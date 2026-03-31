/**
 * memoryPolicyEngine.ts — Pure memory policy functions.
 *
 * Batch 18: Memory Intelligence Layer.
 *
 * Decides:
 *   - Whether a new signal should be stored (quality gate)
 *   - Whether it should overwrite vs. merge into an existing record
 *   - Whether a record has expired (TTL enforcement)
 *   - Whether a record should be promoted to durable (long-lived) status
 *   - Which records to inject into the AI coaching prompt (context shaping)
 *
 * Design constraints:
 *   - Pure functions only. No React, no Supabase, no store access.
 *   - All functions take explicit arguments and return deterministic results.
 *   - No side effects. Callers are responsible for persistence.
 *   - Import only from types — no circular deps.
 */

import type { MemoryType } from '../services/memoryService';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Lightweight record shape used by policy functions.
 * Structurally matches MemoryRecord from memoryService — no Supabase dep.
 */
export interface PolicyMemoryRecord {
  id:           string;
  memory_type:  MemoryType;
  memory_key:   string;
  memory_value: Record<string, unknown>;
  created_at:   string;
  updated_at:   string;
}

/**
 * A candidate memory signal before the policy decision.
 */
export interface MemoryCandidate {
  memoryType:  MemoryType;
  memoryKey:   string;
  memoryValue: Record<string, unknown>;
}

/**
 * Result of scoring a candidate signal.
 */
export interface MemoryScore {
  score:   number;   // 0–100
  reasons: string[]; // scoring factors for debug/tests
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum quality score to write a candidate to ai_user_memory. */
export const STORAGE_QUALITY_THRESHOLD = 35;

/**
 * TTL in milliseconds per memory type.
 * 0 = permanent (no expiry). Used by shouldExpireMemory().
 */
export const MEMORY_TTL_MS: Record<MemoryType, number> = {
  profile_preference:   0,                              // permanent
  productivity_pattern: 30 * 24 * 60 * 60 * 1000,     // 30 days
  coaching_preference:  90 * 24 * 60 * 60 * 1000,     // 90 days
  goal:                 0,                              // permanent
  habit:                45 * 24 * 60 * 60 * 1000,     // 45 days
};

/**
 * Stable memory keys for review-derived signals.
 *
 * Replaces the date-keyed strategy (`${signalType}_${date}`) that caused
 * one new row per day and polluted the 12-record prompt cap.
 * One stable row per signal type per user — upsert updates it in place.
 */
export const STABLE_SIGNAL_KEYS: Partial<Record<MemoryType, string>> = {
  productivity_pattern: 'productivity_pattern',
  coaching_preference:  'recovery_preference',
};

/**
 * sampleCount threshold for promoting a productivity_pattern record to
 * durable status. 7 days = one full week of data.
 */
export const DURABLE_SAMPLE_THRESHOLD = 7;

/**
 * Size of the rolling systemTakeaway ring buffer stored in
 * productivity_pattern.rollingTakeaways.
 */
export const ROLLING_TAKEAWAY_WINDOW = 7;

/**
 * systemTakeaway values that carry a specific, actionable pattern.
 * 'mixed_day' and null/undefined are low-clarity — they score lower.
 */
const HIGH_CLARITY_TAKEAWAYS = new Set([
  'clean_day',
  'recovered_strong',
  'solid_day',
  'avoidance_pattern',
  'overload_pattern',
  'distraction_heavy',
  'recovery_effective',
  'low_execution',
]);

/**
 * Memory type priority by AI mode.
 * selectCoachingMemories uses this to rank records for prompt injection.
 */
const MODE_MEMORY_PRIORITY: Record<string, MemoryType[]> = {
  strategic_planning: ['goal', 'profile_preference', 'productivity_pattern', 'coaching_preference', 'habit'],
  recovery_coach:     ['coaching_preference', 'productivity_pattern', 'profile_preference', 'goal', 'habit'],
  review_reflection:  ['productivity_pattern', 'goal', 'coaching_preference', 'profile_preference', 'habit'],
  quick_nudge:        ['productivity_pattern', 'coaching_preference', 'profile_preference', 'goal', 'habit'],
  focused_answer:     ['productivity_pattern', 'coaching_preference', 'profile_preference', 'goal', 'habit'],
};

const DEFAULT_MEMORY_PRIORITY: MemoryType[] = [
  'profile_preference', 'productivity_pattern', 'coaching_preference', 'goal', 'habit',
];

// ─── Quality scoring ──────────────────────────────────────────────────────────

/**
 * Scores a memory candidate 0–100.
 *
 * Philosophy: measures how *useful* this signal will be for coaching
 * personalization, not how "good" the outcome was. A clear avoidance_pattern
 * day scores high even though it's a bad outcome — it is a strong signal.
 *
 * Score components vary by memory type:
 *
 * productivity_pattern:
 *   patternClarity (0–40)   — specific systemTakeaway → 40; mixed/null → 10/0
 *   dataCompleteness (0–30) — required fields present
 *   dataDepth (0–20)        — non-trivial focusMinutes + non-zero completionRate
 *   (max: 90 — leaves 10 pts unreachable to discourage inflated signals)
 *
 * coaching_preference:
 *   recoveryMode present (0–50)
 *   effectiveness signal (0–30)
 *   date present (0–20)
 *
 * profile_preference / goal / habit:
 *   canonical { value } present (70) + base reliability (10)
 *   non-empty non-canonical object (40) + base reliability (10)
 */
export function scoreMemoryCandidate(candidate: MemoryCandidate): MemoryScore {
  const reasons: string[] = [];
  let score = 0;
  const v = candidate.memoryValue;

  if (candidate.memoryType === 'productivity_pattern') {
    // ── Pattern clarity ────────────────────────────────────────────────────
    const takeaway = v.systemTakeaway;
    if (typeof takeaway === 'string' && HIGH_CLARITY_TAKEAWAYS.has(takeaway)) {
      score += 40;
      reasons.push(`+40 high-clarity takeaway: ${takeaway}`);
    } else if (typeof takeaway === 'string') {
      score += 10;
      reasons.push(`+10 low-clarity takeaway: ${takeaway}`);
    } else {
      reasons.push('+0 systemTakeaway absent');
    }

    // ── Data completeness ──────────────────────────────────────────────────
    const hasRate        = typeof v.completionRate   === 'number';
    const hasMinutes     = typeof v.focusMinutes     === 'number';
    const hasDistraction = typeof v.distractionCount === 'number';
    const comp = (hasRate ? 10 : 0) + (hasMinutes ? 10 : 0) + (hasDistraction ? 10 : 0);
    score += comp;
    reasons.push(`+${comp} data completeness (rate=${hasRate}, mins=${hasMinutes}, distract=${hasDistraction})`);

    // ── Data depth ─────────────────────────────────────────────────────────
    const mins = typeof v.focusMinutes === 'number' ? v.focusMinutes : 0;
    if (mins >= 30) {
      score += 10;
      reasons.push('+10 focusMinutes >= 30');
    } else if (mins > 0) {
      score += 5;
      reasons.push('+5 focusMinutes > 0');
    } else {
      reasons.push('+0 no focus time');
    }
    const rate = typeof v.completionRate === 'number' ? v.completionRate : 0;
    if (rate > 0) {
      score += 10;
      reasons.push('+10 non-zero completionRate');
    } else {
      reasons.push('+0 completionRate is zero');
    }

  } else if (candidate.memoryType === 'coaching_preference') {
    const hasMode      = typeof v.recoveryMode  === 'string' && (v.recoveryMode as string).length > 0;
    const hasEffective = typeof v.wasEffective  === 'boolean';
    const hasDate      = typeof v.date          === 'string';

    if (hasMode) { score += 50; reasons.push('+50 recoveryMode present'); }
    else          { reasons.push('+0 recoveryMode absent'); }
    if (hasEffective) { score += 30; reasons.push('+30 wasEffective present'); }
    if (hasDate)      { score += 20; reasons.push('+20 date present'); }

  } else {
    // profile_preference, goal, habit
    if ('value' in v && v.value !== null && v.value !== undefined && v.value !== '') {
      score += 70;
      reasons.push('+70 canonical { value } present');
    } else if (Object.keys(v).length > 0) {
      score += 40;
      reasons.push('+40 non-empty non-canonical object');
    } else {
      reasons.push('+0 empty value object');
    }
    score += 10;
    reasons.push('+10 base reliability for preference type');
  }

  return { score: Math.min(100, Math.max(0, score)), reasons };
}

/**
 * Returns true if the candidate passes the quality gate and should be written.
 *
 * Rejects candidates with an empty memoryValue regardless of score.
 * Threshold: STORAGE_QUALITY_THRESHOLD (35).
 */
export function shouldStoreMemory(candidate: MemoryCandidate): boolean {
  if (Object.keys(candidate.memoryValue).length === 0) return false;
  const { score } = scoreMemoryCandidate(candidate);
  return score >= STORAGE_QUALITY_THRESHOLD;
}

// ─── Deduplication / Merge ────────────────────────────────────────────────────

/**
 * Returns true if the candidate should be merged into the existing record
 * (same stable key — update in place) rather than creating a new row.
 */
export function shouldMergeMemory(
  candidate: MemoryCandidate,
  existing:  PolicyMemoryRecord | null,
): boolean {
  if (!existing) return false;
  return existing.memory_key === candidate.memoryKey;
}

/**
 * Merges a candidate's value into an existing record's value.
 *
 * Strategy by type:
 *   productivity_pattern — rolling aggregation:
 *     - Snapshot fields update to latest values
 *     - rollingTakeaways: ring buffer (last ROLLING_TAKEAWAY_WINDOW entries)
 *     - avgCompletionRate: incremental average across sampleCount samples
 *   All other types — newer wins (full replace)
 *
 * Pure — never mutates either argument. Returns a new object.
 */
export function mergeMemory(
  candidate: MemoryCandidate,
  existing:  PolicyMemoryRecord,
): Record<string, unknown> {
  if (candidate.memoryType !== 'productivity_pattern') {
    return { ...candidate.memoryValue };
  }

  const prev = existing.memory_value;
  const curr = candidate.memoryValue;

  // Rolling takeaways ring buffer
  const prevRolling: string[] = Array.isArray(prev.rollingTakeaways)
    ? (prev.rollingTakeaways as string[]).slice()
    : [];
  const newTakeaway = typeof curr.systemTakeaway === 'string' ? curr.systemTakeaway : null;
  if (newTakeaway) {
    prevRolling.push(newTakeaway);
    if (prevRolling.length > ROLLING_TAKEAWAY_WINDOW) prevRolling.shift();
  }

  // Incremental average completion rate
  const prevCount = typeof prev.sampleCount       === 'number' ? prev.sampleCount       : 1;
  const prevAvg   = typeof prev.avgCompletionRate === 'number' ? prev.avgCompletionRate
                  : (typeof prev.completionRate   === 'number' ? prev.completionRate     : 0);
  const currRate  = typeof curr.completionRate    === 'number' ? curr.completionRate     : 0;
  const newCount  = prevCount + 1;
  const newAvg    = Math.round(((prevAvg * prevCount + currRate) / newCount) * 100) / 100;

  return {
    // Latest snapshot
    completionRate:    currRate,
    focusMinutes:      typeof curr.focusMinutes     === 'number' ? curr.focusMinutes     : prev.focusMinutes,
    dominantDrift:     curr.dominantDrift   !== undefined ? curr.dominantDrift   : prev.dominantDrift,
    distractionCount:  typeof curr.distractionCount === 'number' ? curr.distractionCount : prev.distractionCount,
    skipCount:         typeof curr.skipCount        === 'number' ? curr.skipCount        : prev.skipCount,
    systemTakeaway:    curr.systemTakeaway  !== undefined ? curr.systemTakeaway  : prev.systemTakeaway,
    // Rolling aggregates
    avgCompletionRate: newAvg,
    sampleCount:       newCount,
    rollingTakeaways:  prevRolling,
    lastUpdatedDate:   typeof curr.date === 'string' ? curr.date : prev.lastUpdatedDate,
  };
}

// ─── TTL / Expiry ─────────────────────────────────────────────────────────────

/**
 * Returns the TTL in milliseconds for the given memory type.
 * 0 means permanent (no expiry).
 */
export function getMemoryTTL(memoryType: MemoryType): number {
  return MEMORY_TTL_MS[memoryType] ?? 0;
}

/**
 * Returns true if the record has exceeded its type's TTL.
 *
 * Records with TTL=0 (profile_preference, goal) never expire.
 * Freshness is measured from record.updated_at.
 */
export function shouldExpireMemory(
  record: PolicyMemoryRecord,
  nowIso: string,
): boolean {
  const ttlMs = getMemoryTTL(record.memory_type);
  if (ttlMs === 0) return false;

  const updatedAt = new Date(record.updated_at).getTime();
  const now       = new Date(nowIso).getTime();
  return (now - updatedAt) > ttlMs;
}

// ─── Promotion ────────────────────────────────────────────────────────────────

/**
 * Returns true if the record is stable enough to be treated as a durable
 * long-lived preference rather than a transient signal.
 *
 * Durable records are exempt from TTL filtering in selectCoachingMemories.
 * Rationale: after 7+ days of data, the rolling pattern reflects genuine
 * user behavior and should remain available even if not updated for a few days.
 *
 * Currently: productivity_pattern with sampleCount >= DURABLE_SAMPLE_THRESHOLD.
 */
export function shouldPromoteToDurableMemory(record: PolicyMemoryRecord): boolean {
  if (record.memory_type !== 'productivity_pattern') return false;
  const count = record.memory_value.sampleCount;
  return typeof count === 'number' && count >= DURABLE_SAMPLE_THRESHOLD;
}

// ─── Coaching context selection ───────────────────────────────────────────────

/**
 * Filters and ranks memory records for injection into the AI coaching prompt.
 *
 * Algorithm:
 *   1. Filter: remove expired records (unless promoted to durable).
 *   2. Sort:   mode-specific type priority → recency as tiebreaker.
 *   3. Cap:    return at most maxRecords entries.
 *
 * @param records    All memory records for the user.
 * @param aiMode     AI request mode string — determines type priority order.
 * @param nowIso     Current ISO timestamp for TTL calculation.
 * @param maxRecords Maximum records to return (default 8).
 */
export function selectCoachingMemories(
  records:    PolicyMemoryRecord[],
  aiMode?:    string,
  nowIso?:    string,
  maxRecords  = 8,
): PolicyMemoryRecord[] {
  const now = nowIso ?? new Date().toISOString();

  // Step 1: filter expired (durable records are exempt)
  const live = records.filter(
    (r) => shouldPromoteToDurableMemory(r) || !shouldExpireMemory(r, now),
  );

  // Step 2: sort by mode-specific priority, then recency
  const priority = (aiMode && MODE_MEMORY_PRIORITY[aiMode]) ?? DEFAULT_MEMORY_PRIORITY;

  const sorted = [...live].sort((a, b) => {
    const aIdx = priority.indexOf(a.memory_type);
    const bIdx = priority.indexOf(b.memory_type);
    const aNorm = aIdx === -1 ? priority.length : aIdx;
    const bNorm = bIdx === -1 ? priority.length : bIdx;

    if (aNorm !== bNorm) return aNorm - bNorm;
    // Tiebreaker: most recently updated first
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  // Step 3: cap
  return sorted.slice(0, maxRecords);
}

// ─── Prompt summary ───────────────────────────────────────────────────────────

/**
 * Builds a compact EXECUTION PATTERNS prompt section from the selected records.
 *
 * Supplements buildMemoryContext (key→value pairs) with a narrative summary
 * of recent execution patterns from the productivity_pattern record.
 *
 * Returns '' when no productivity_pattern record is present — callers must
 * guard before injecting a section header into the prompt.
 *
 * Example output:
 *   ═══ EXECUTION PATTERNS ═══
 *   • Recent pattern: avoidance_pattern (7-day avg: 58% completion)
 *   • Rolling patterns: solid_day, clean_day, avoidance_pattern
 *   • Recurring drift: avoidance
 */
export function buildMemoryPromptSummary(records: PolicyMemoryRecord[]): string {
  const patternRecord = records.find((r) => r.memory_type === 'productivity_pattern');
  if (!patternRecord) return '';

  const v = patternRecord.memory_value;
  const lines: string[] = [];

  const takeaway    = typeof v.systemTakeaway   === 'string' ? v.systemTakeaway   : null;
  const avgRate     = typeof v.avgCompletionRate === 'number' ? v.avgCompletionRate : null;
  const sampleCount = typeof v.sampleCount      === 'number' ? v.sampleCount      : null;
  const rolling     = Array.isArray(v.rollingTakeaways) ? (v.rollingTakeaways as string[]) : [];

  if (takeaway) {
    const sample = sampleCount && sampleCount > 1 ? `${sampleCount}-day` : 'latest';
    const avgStr = avgRate !== null
      ? ` (${sample} avg: ${Math.round(avgRate * 100)}% completion)`
      : '';
    lines.push(`• Recent pattern: ${takeaway}${avgStr}`);
  }

  if (rolling.length > 1) {
    lines.push(`• Rolling patterns: ${rolling.slice(-5).join(', ')}`);
  }

  const dominantDrift = typeof v.dominantDrift === 'string' && v.dominantDrift
    ? v.dominantDrift : null;
  if (dominantDrift) {
    lines.push(`• Recurring drift: ${dominantDrift}`);
  }

  if (lines.length === 0) return '';
  return '═══ EXECUTION PATTERNS ═══\n' + lines.join('\n');
}
