/**
 * Batch 18: Memory Intelligence Layer — Unit Tests
 *
 * Coverage:
 *   A. scoreMemoryCandidate          — quality scoring by type
 *   B. shouldStoreMemory             — qualification gate
 *   C. shouldMergeMemory             — dedup check
 *   D. mergeMemory                   — rolling aggregation (productivity_pattern)
 *   E. getMemoryTTL                  — TTL constants
 *   F. shouldExpireMemory            — TTL enforcement
 *   G. shouldPromoteToDurableMemory  — durable promotion
 *   H. selectCoachingMemories        — mode-aware context selection
 *   I. buildMemoryPromptSummary      — compact pattern narrative
 *   J. reviewService stable-key fix  — no more date-keyed pollution
 *
 * Pure engine tests only — no Supabase, no React, no store access.
 */

import {
  scoreMemoryCandidate,
  shouldStoreMemory,
  shouldMergeMemory,
  mergeMemory,
  getMemoryTTL,
  shouldExpireMemory,
  shouldPromoteToDurableMemory,
  selectCoachingMemories,
  buildMemoryPromptSummary,
  STORAGE_QUALITY_THRESHOLD,
  MEMORY_TTL_MS,
  STABLE_SIGNAL_KEYS,
  DURABLE_SAMPLE_THRESHOLD,
  ROLLING_TAKEAWAY_WINDOW,
  type PolicyMemoryRecord,
  type MemoryCandidate,
} from '../src/ai/memoryPolicyEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(
  overrides: Partial<PolicyMemoryRecord> & { memory_type: PolicyMemoryRecord['memory_type'] },
): PolicyMemoryRecord {
  return {
    id:           'test-id',
    memory_key:   overrides.memory_type,
    memory_value: {},
    created_at:   '2026-01-01T00:00:00.000Z',
    updated_at:   '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

const NOW = new Date('2026-03-31T12:00:00.000Z').toISOString();

function isoAgoFrom(nowIso: string, ms: number): string {
  return new Date(new Date(nowIso).getTime() - ms).toISOString();
}

const DAY_MS  = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// ─── Section A: scoreMemoryCandidate ─────────────────────────────────────────

function testScoreProductivityPattern_highClarity(): void {
  const c: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern',
    memoryValue: {
      completionRate:   0.85,
      focusMinutes:     90,
      distractionCount: 1,
      skipCount:        0,
      systemTakeaway:   'clean_day',
      dominantDrift:    null,
    },
  };
  const { score } = scoreMemoryCandidate(c);
  // 40 (high-clarity) + 30 (all 3 fields) + 10 (focus >= 30) + 10 (rate > 0) = 90
  console.assert(score === 90, `A1 expected 90, got ${score}`);
  console.log('A1 PASS scoreMemoryCandidate productivity_pattern high-clarity');
}

function testScoreProductivityPattern_lowClarity(): void {
  const c: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern',
    memoryValue: {
      completionRate:   0.5,
      focusMinutes:     10,
      distractionCount: 3,
      systemTakeaway:   'mixed_day',
    },
  };
  const { score } = scoreMemoryCandidate(c);
  // 10 (low-clarity) + 30 (all 3 fields) + 5 (focus > 0) + 10 (rate > 0) = 55
  console.assert(score === 55, `A2 expected 55, got ${score}`);
  console.log('A2 PASS scoreMemoryCandidate productivity_pattern low-clarity (mixed_day)');
}

function testScoreProductivityPattern_noTakeaway(): void {
  const c: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern',
    memoryValue: {
      completionRate:   0.0,
      focusMinutes:     0,
      distractionCount: 0,
    },
  };
  const { score } = scoreMemoryCandidate(c);
  // 0 (no takeaway) + 30 (all 3 fields) + 0 (no focus) + 0 (rate=0) = 30
  console.assert(score === 30, `A3 expected 30, got ${score}`);
  console.log('A3 PASS scoreMemoryCandidate productivity_pattern no takeaway → below threshold');
}

function testScoreProductivityPattern_avoidancePattern(): void {
  const c: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern',
    memoryValue: {
      completionRate:   0.2,
      focusMinutes:     15,
      distractionCount: 7,
      systemTakeaway:   'avoidance_pattern',
    },
  };
  const { score } = scoreMemoryCandidate(c);
  // 40 (high-clarity) + 30 (all 3) + 5 (focus > 0) + 10 (rate > 0) = 85
  console.assert(score === 85, `A4 expected 85, got ${score}`);
  console.log('A4 PASS scoreMemoryCandidate avoidance_pattern scores high (useful negative signal)');
}

function testScoreCoachingPreference_complete(): void {
  const c: MemoryCandidate = {
    memoryType:  'coaching_preference',
    memoryKey:   'recovery_preference',
    memoryValue: { recoveryMode: 'rest', wasEffective: true, date: '2026-03-31' },
  };
  const { score } = scoreMemoryCandidate(c);
  // 50 + 30 + 20 = 100
  console.assert(score === 100, `A5 expected 100, got ${score}`);
  console.log('A5 PASS scoreMemoryCandidate coaching_preference complete → 100');
}

function testScoreCoachingPreference_missingMode(): void {
  const c: MemoryCandidate = {
    memoryType:  'coaching_preference',
    memoryKey:   'recovery_preference',
    memoryValue: { wasEffective: false, date: '2026-03-31' },
  };
  const { score } = scoreMemoryCandidate(c);
  // 0 + 30 + 20 = 50
  console.assert(score === 50, `A6 expected 50, got ${score}`);
  console.log('A6 PASS scoreMemoryCandidate coaching_preference missing mode → 50');
}

function testScoreProfilePreference_canonical(): void {
  const c: MemoryCandidate = {
    memoryType:  'profile_preference',
    memoryKey:   'coaching_tone',
    memoryValue: { value: 'direct' },
  };
  const { score } = scoreMemoryCandidate(c);
  // 70 + 10 = 80
  console.assert(score === 80, `A7 expected 80, got ${score}`);
  console.log('A7 PASS scoreMemoryCandidate profile_preference canonical → 80');
}

function testScoreProfilePreference_empty(): void {
  const c: MemoryCandidate = {
    memoryType:  'profile_preference',
    memoryKey:   'coaching_tone',
    memoryValue: {},
  };
  const { score } = scoreMemoryCandidate(c);
  // 0 + 10 = 10
  console.assert(score === 10, `A8 expected 10, got ${score}`);
  console.log('A8 PASS scoreMemoryCandidate profile_preference empty → 10');
}

function testScoreGoal_canonical(): void {
  const c: MemoryCandidate = {
    memoryType:  'goal',
    memoryKey:   'top_priority',
    memoryValue: { value: 'ship the MVP' },
  };
  const { score } = scoreMemoryCandidate(c);
  console.assert(score === 80, `A9 expected 80, got ${score}`);
  console.log('A9 PASS scoreMemoryCandidate goal canonical → 80');
}

function testScoreMaxCap(): void {
  // Score cannot exceed 100
  const c: MemoryCandidate = {
    memoryType:  'coaching_preference',
    memoryKey:   'recovery_preference',
    memoryValue: { recoveryMode: 'rest', wasEffective: true, date: '2026-03-31' },
  };
  const { score } = scoreMemoryCandidate(c);
  console.assert(score <= 100, `A10 score ${score} exceeds 100`);
  console.log('A10 PASS scoreMemoryCandidate score capped at 100');
}

// ─── Section B: shouldStoreMemory ────────────────────────────────────────────

function testShouldStore_highQuality(): void {
  const c: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern',
    memoryValue: {
      completionRate: 0.8, focusMinutes: 60, distractionCount: 1, systemTakeaway: 'clean_day',
    },
  };
  console.assert(shouldStoreMemory(c) === true, 'B1 high-quality candidate should be stored');
  console.log('B1 PASS shouldStoreMemory high-quality → true');
}

function testShouldStore_belowThreshold(): void {
  const c: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern',
    memoryValue: { completionRate: 0, focusMinutes: 0, distractionCount: 0 },
  };
  // Score = 30 < STORAGE_QUALITY_THRESHOLD (35)
  console.assert(shouldStoreMemory(c) === false, 'B2 low-quality candidate should not be stored');
  console.log('B2 PASS shouldStoreMemory below threshold → false');
}

function testShouldStore_emptyValue(): void {
  const c: MemoryCandidate = {
    memoryType:  'profile_preference',
    memoryKey:   'coaching_tone',
    memoryValue: {},
  };
  console.assert(shouldStoreMemory(c) === false, 'B3 empty value should not be stored');
  console.log('B3 PASS shouldStoreMemory empty value → false');
}

function testShouldStore_threshold(): void {
  console.assert(STORAGE_QUALITY_THRESHOLD === 35, 'B4 threshold should be 35');
  console.log('B4 PASS STORAGE_QUALITY_THRESHOLD = 35');
}

function testShouldStore_mixedDay_aboveThreshold(): void {
  // mixed_day scores 55 which is above 35
  const c: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern',
    memoryValue: {
      completionRate: 0.5, focusMinutes: 10, distractionCount: 3, systemTakeaway: 'mixed_day',
    },
  };
  console.assert(shouldStoreMemory(c) === true, 'B5 mixed_day with data above threshold');
  console.log('B5 PASS shouldStoreMemory mixed_day with data → true');
}

// ─── Section C: shouldMergeMemory ────────────────────────────────────────────

function testShouldMerge_sameKey(): void {
  const candidate: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern',
    memoryValue: { completionRate: 0.8 },
  };
  const existing = makeRecord({
    memory_type: 'productivity_pattern',
    memory_key:  'productivity_pattern',
  });
  console.assert(shouldMergeMemory(candidate, existing) === true, 'C1 same key should merge');
  console.log('C1 PASS shouldMergeMemory same key → true');
}

function testShouldMerge_noExisting(): void {
  const candidate: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern',
    memoryValue: {},
  };
  console.assert(shouldMergeMemory(candidate, null) === false, 'C2 no existing → no merge');
  console.log('C2 PASS shouldMergeMemory null existing → false');
}

function testShouldMerge_differentKey(): void {
  const candidate: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern_new',
    memoryValue: {},
  };
  const existing = makeRecord({
    memory_type: 'productivity_pattern',
    memory_key:  'productivity_pattern',
  });
  console.assert(shouldMergeMemory(candidate, existing) === false, 'C3 different key → no merge');
  console.log('C3 PASS shouldMergeMemory different keys → false');
}

// ─── Section D: mergeMemory ───────────────────────────────────────────────────

function testMergeMemory_productivityPattern_firstMerge(): void {
  const existing = makeRecord({
    memory_type:  'productivity_pattern',
    memory_key:   'productivity_pattern',
    memory_value: {
      completionRate:    0.6,
      focusMinutes:      45,
      distractionCount:  2,
      systemTakeaway:    'solid_day',
      avgCompletionRate: 0.6,
      sampleCount:       1,
      rollingTakeaways:  ['solid_day'],
      lastUpdatedDate:   '2026-03-30',
    },
  });
  const candidate: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern',
    memoryValue: {
      completionRate:   0.8,
      focusMinutes:     90,
      distractionCount: 1,
      systemTakeaway:   'clean_day',
      date:             '2026-03-31',
    },
  };

  const merged = mergeMemory(candidate, existing);

  // Latest snapshot values
  console.assert(merged.completionRate   === 0.8,        `D1a completionRate should be 0.8, got ${merged.completionRate}`);
  console.assert(merged.focusMinutes     === 90,         `D1b focusMinutes should be 90, got ${merged.focusMinutes}`);
  console.assert(merged.systemTakeaway   === 'clean_day', `D1c systemTakeaway should be clean_day`);
  console.assert(merged.lastUpdatedDate  === '2026-03-31', `D1d lastUpdatedDate should be 2026-03-31`);

  // Rolling aggregates
  console.assert(merged.sampleCount === 2, `D1e sampleCount should be 2, got ${merged.sampleCount}`);
  const expectedAvg = Math.round(((0.6 + 0.8) / 2) * 100) / 100;
  console.assert(merged.avgCompletionRate === expectedAvg, `D1f avgCompletionRate should be ${expectedAvg}, got ${merged.avgCompletionRate}`);
  const rolling = merged.rollingTakeaways as string[];
  console.assert(Array.isArray(rolling), 'D1g rollingTakeaways should be array');
  console.assert(rolling.includes('clean_day'), 'D1h rollingTakeaways should include clean_day');
  console.assert(rolling.includes('solid_day'),  'D1i rollingTakeaways should include solid_day');

  console.log('D1 PASS mergeMemory productivity_pattern first merge');
}

function testMergeMemory_productivityPattern_ringBuffer(): void {
  // Existing record with full 7-entry rolling buffer
  const fullRolling = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const existing = makeRecord({
    memory_type:  'productivity_pattern',
    memory_key:   'productivity_pattern',
    memory_value: {
      completionRate:    0.5,
      sampleCount:       7,
      avgCompletionRate: 0.5,
      rollingTakeaways:  fullRolling,
      systemTakeaway:    'g',
    },
  });
  const candidate: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern',
    memoryValue: { completionRate: 0.9, systemTakeaway: 'clean_day' },
  };

  const merged = mergeMemory(candidate, existing);
  const rolling = merged.rollingTakeaways as string[];

  // Buffer must not exceed ROLLING_TAKEAWAY_WINDOW entries
  console.assert(rolling.length <= ROLLING_TAKEAWAY_WINDOW, `D2a ring buffer overflow: ${rolling.length}`);
  // 'a' (oldest) should be dropped, 'clean_day' should be at end
  console.assert(!rolling.includes('a'), 'D2b oldest entry should be evicted');
  console.assert(rolling[rolling.length - 1] === 'clean_day', 'D2c newest entry at tail');
  console.log('D2 PASS mergeMemory ring buffer evicts oldest entry');
}

function testMergeMemory_nonPattern_newerWins(): void {
  const existing = makeRecord({
    memory_type:  'coaching_preference',
    memory_key:   'recovery_preference',
    memory_value: { recoveryMode: 'rest', wasEffective: false },
  });
  const candidate: MemoryCandidate = {
    memoryType:  'coaching_preference',
    memoryKey:   'recovery_preference',
    memoryValue: { recoveryMode: 'light_work', wasEffective: true, date: '2026-03-31' },
  };
  const merged = mergeMemory(candidate, existing);
  console.assert(merged.recoveryMode === 'light_work', 'D3a newer recoveryMode wins');
  console.assert(merged.wasEffective  === true,        'D3b newer wasEffective wins');
  console.assert(!('date' in existing.memory_value),   'D3c existing had no date field');
  console.assert(merged.date === '2026-03-31',         'D3d new date field present');
  console.log('D3 PASS mergeMemory coaching_preference → newer wins');
}

function testMergeMemory_profilePreference_newerWins(): void {
  const existing = makeRecord({
    memory_type:  'profile_preference',
    memory_key:   'coaching_tone',
    memory_value: { value: 'gentle' },
  });
  const candidate: MemoryCandidate = {
    memoryType:  'profile_preference',
    memoryKey:   'coaching_tone',
    memoryValue: { value: 'direct' },
  };
  const merged = mergeMemory(candidate, existing);
  console.assert(merged.value === 'direct', 'D4 profile_preference newer wins');
  console.log('D4 PASS mergeMemory profile_preference → newer wins');
}

function testMergeMemory_pureNoMutation(): void {
  const existing = makeRecord({
    memory_type:  'productivity_pattern',
    memory_key:   'productivity_pattern',
    memory_value: { completionRate: 0.5, sampleCount: 1, rollingTakeaways: ['solid_day'] },
  });
  const candidate: MemoryCandidate = {
    memoryType:  'productivity_pattern',
    memoryKey:   'productivity_pattern',
    memoryValue: { completionRate: 0.9, systemTakeaway: 'clean_day' },
  };
  const originalValue = JSON.stringify(existing.memory_value);
  mergeMemory(candidate, existing);
  console.assert(JSON.stringify(existing.memory_value) === originalValue, 'D5 existing not mutated');
  console.log('D5 PASS mergeMemory is pure — existing not mutated');
}

// ─── Section E: getMemoryTTL ─────────────────────────────────────────────────

function testGetMemoryTTL_permanent(): void {
  console.assert(getMemoryTTL('profile_preference') === 0, 'E1 profile_preference TTL = 0');
  console.assert(getMemoryTTL('goal')               === 0, 'E2 goal TTL = 0');
  console.log('E1-E2 PASS getMemoryTTL permanent types → 0');
}

function testGetMemoryTTL_transient(): void {
  console.assert(getMemoryTTL('productivity_pattern') === 30 * DAY_MS, 'E3 productivity_pattern TTL = 30d');
  console.assert(getMemoryTTL('coaching_preference')  === 90 * DAY_MS, 'E4 coaching_preference TTL = 90d');
  console.assert(getMemoryTTL('habit')                === 45 * DAY_MS, 'E5 habit TTL = 45d');
  console.log('E3-E5 PASS getMemoryTTL transient types → correct TTLs');
}

function testMemoryTTL_constants(): void {
  // Verify MEMORY_TTL_MS export matches getMemoryTTL
  for (const [type, ms] of Object.entries(MEMORY_TTL_MS)) {
    console.assert(getMemoryTTL(type as any) === ms, `E6 MEMORY_TTL_MS[${type}] matches getMemoryTTL`);
  }
  console.log('E6 PASS MEMORY_TTL_MS constants match getMemoryTTL');
}

// ─── Section F: shouldExpireMemory ───────────────────────────────────────────

function testShouldExpire_permanent(): void {
  // profile_preference and goal never expire
  const r = makeRecord({
    memory_type: 'profile_preference',
    memory_key:  'coaching_tone',
    updated_at:  '2020-01-01T00:00:00.000Z',  // 6 years old
  });
  console.assert(shouldExpireMemory(r, NOW) === false, 'F1 profile_preference never expires');
  console.log('F1 PASS shouldExpireMemory profile_preference → false (permanent)');
}

function testShouldExpire_withinTTL(): void {
  const r = makeRecord({
    memory_type: 'productivity_pattern',
    memory_key:  'productivity_pattern',
    updated_at:  isoAgoFrom(NOW, 15 * DAY_MS),  // 15 days ago (TTL = 30 days)
  });
  console.assert(shouldExpireMemory(r, NOW) === false, 'F2 within TTL should not expire');
  console.log('F2 PASS shouldExpireMemory productivity_pattern within TTL → false');
}

function testShouldExpire_exceeded(): void {
  const r = makeRecord({
    memory_type: 'productivity_pattern',
    memory_key:  'productivity_pattern',
    updated_at:  isoAgoFrom(NOW, 31 * DAY_MS),  // 31 days ago (TTL = 30 days)
  });
  console.assert(shouldExpireMemory(r, NOW) === true, 'F3 exceeded TTL should expire');
  console.log('F3 PASS shouldExpireMemory productivity_pattern exceeded TTL → true');
}

function testShouldExpire_habit(): void {
  const r = makeRecord({
    memory_type: 'habit',
    memory_key:  'morning_routine',
    updated_at:  isoAgoFrom(NOW, 46 * DAY_MS),  // 46 days (TTL = 45 days)
  });
  console.assert(shouldExpireMemory(r, NOW) === true, 'F4 habit exceeded TTL');
  console.log('F4 PASS shouldExpireMemory habit exceeded 45d TTL → true');
}

function testShouldExpire_coaching_withinTTL(): void {
  const r = makeRecord({
    memory_type: 'coaching_preference',
    memory_key:  'recovery_preference',
    updated_at:  isoAgoFrom(NOW, 60 * DAY_MS),  // 60 days (TTL = 90 days)
  });
  console.assert(shouldExpireMemory(r, NOW) === false, 'F5 coaching_preference within 90d TTL');
  console.log('F5 PASS shouldExpireMemory coaching_preference within TTL → false');
}

// ─── Section G: shouldPromoteToDurableMemory ─────────────────────────────────

function testPromotion_notProductivityPattern(): void {
  const r = makeRecord({ memory_type: 'profile_preference' });
  console.assert(shouldPromoteToDurableMemory(r) === false, 'G1 non-pattern → not durable');
  console.log('G1 PASS shouldPromoteToDurableMemory non-pattern type → false');
}

function testPromotion_belowThreshold(): void {
  const r = makeRecord({
    memory_type:  'productivity_pattern',
    memory_value: { sampleCount: DURABLE_SAMPLE_THRESHOLD - 1 },
  });
  console.assert(shouldPromoteToDurableMemory(r) === false, 'G2 below sample threshold → not durable');
  console.log('G2 PASS shouldPromoteToDurableMemory below threshold → false');
}

function testPromotion_atThreshold(): void {
  const r = makeRecord({
    memory_type:  'productivity_pattern',
    memory_value: { sampleCount: DURABLE_SAMPLE_THRESHOLD },
  });
  console.assert(shouldPromoteToDurableMemory(r) === true, 'G3 at threshold → durable');
  console.log('G3 PASS shouldPromoteToDurableMemory at threshold → true');
}

function testPromotion_aboveThreshold(): void {
  const r = makeRecord({
    memory_type:  'productivity_pattern',
    memory_value: { sampleCount: 30 },
  });
  console.assert(shouldPromoteToDurableMemory(r) === true, 'G4 above threshold → durable');
  console.log('G4 PASS shouldPromoteToDurableMemory above threshold → true');
}

function testPromotion_noSampleCount(): void {
  const r = makeRecord({
    memory_type:  'productivity_pattern',
    memory_value: {},
  });
  console.assert(shouldPromoteToDurableMemory(r) === false, 'G5 no sampleCount → not durable');
  console.log('G5 PASS shouldPromoteToDurableMemory no sampleCount → false');
}

// ─── Section H: selectCoachingMemories ───────────────────────────────────────

function makeRecords(): PolicyMemoryRecord[] {
  const base = isoAgoFrom(NOW, 5 * DAY_MS);
  return [
    makeRecord({ memory_type: 'habit',                memory_key: 'morning_routine',  updated_at: base }),
    makeRecord({ memory_type: 'goal',                 memory_key: 'top_priority',     updated_at: base }),
    makeRecord({ memory_type: 'productivity_pattern', memory_key: 'productivity_pattern', updated_at: base, memory_value: { sampleCount: 3 } }),
    makeRecord({ memory_type: 'coaching_preference',  memory_key: 'recovery_preference', updated_at: base }),
    makeRecord({ memory_type: 'profile_preference',   memory_key: 'coaching_tone',    updated_at: base }),
  ];
}

function testSelectCoaching_strategicPlanning(): void {
  const records = makeRecords();
  const selected = selectCoachingMemories(records, 'strategic_planning', NOW);
  // Priority: goal, profile_preference, productivity_pattern, coaching_preference, habit
  console.assert(selected.length === 5, `H1a expected 5 results, got ${selected.length}`);
  console.assert(selected[0].memory_type === 'goal',               'H1b first should be goal');
  console.assert(selected[1].memory_type === 'profile_preference', 'H1c second should be profile_preference');
  console.assert(selected[2].memory_type === 'productivity_pattern', 'H1d third should be productivity_pattern');
  console.log('H1 PASS selectCoachingMemories strategic_planning priority order');
}

function testSelectCoaching_recoveryCoach(): void {
  const records = makeRecords();
  const selected = selectCoachingMemories(records, 'recovery_coach', NOW);
  // Priority: coaching_preference, productivity_pattern, profile_preference, goal, habit
  console.assert(selected[0].memory_type === 'coaching_preference',  'H2a first should be coaching_preference');
  console.assert(selected[1].memory_type === 'productivity_pattern', 'H2b second should be productivity_pattern');
  console.log('H2 PASS selectCoachingMemories recovery_coach priority order');
}

function testSelectCoaching_filtersExpired(): void {
  const records: PolicyMemoryRecord[] = [
    makeRecord({
      memory_type: 'productivity_pattern',
      memory_key:  'productivity_pattern',
      updated_at:  isoAgoFrom(NOW, 31 * DAY_MS), // expired (TTL=30d)
      memory_value: { sampleCount: 3 },           // NOT durable (< 7)
    }),
    makeRecord({ memory_type: 'profile_preference', memory_key: 'coaching_tone', updated_at: isoAgoFrom(NOW, 1 * DAY_MS) }),
  ];
  const selected = selectCoachingMemories(records, undefined, NOW);
  console.assert(selected.length === 1, `H3a expected 1, got ${selected.length}`);
  console.assert(selected[0].memory_type === 'profile_preference', 'H3b expired productivity_pattern filtered');
  console.log('H3 PASS selectCoachingMemories filters expired records');
}

function testSelectCoaching_durableExemptFromExpiry(): void {
  // Durable productivity_pattern (sampleCount >= 7) should survive past TTL
  const records: PolicyMemoryRecord[] = [
    makeRecord({
      memory_type:  'productivity_pattern',
      memory_key:   'productivity_pattern',
      updated_at:   isoAgoFrom(NOW, 31 * DAY_MS), // past 30d TTL
      memory_value: { sampleCount: DURABLE_SAMPLE_THRESHOLD },
    }),
  ];
  const selected = selectCoachingMemories(records, undefined, NOW);
  console.assert(selected.length === 1, 'H4 durable record survives past TTL');
  console.log('H4 PASS selectCoachingMemories durable record exempted from TTL filter');
}

function testSelectCoaching_maxRecordsCap(): void {
  const records: PolicyMemoryRecord[] = Array.from({ length: 15 }, (_, i) =>
    makeRecord({
      memory_type: 'profile_preference',
      memory_key:  `pref_${i}`,
      updated_at:  isoAgoFrom(NOW, i * HOUR_MS),
    }),
  );
  const selected = selectCoachingMemories(records, undefined, NOW, 8);
  console.assert(selected.length === 8, `H5 cap at 8, got ${selected.length}`);
  console.log('H5 PASS selectCoachingMemories respects maxRecords cap');
}

function testSelectCoaching_recencyTiebreaker(): void {
  // Two profile_preference records with same type — newer should rank first
  const records: PolicyMemoryRecord[] = [
    makeRecord({ memory_type: 'profile_preference', memory_key: 'older_pref', updated_at: isoAgoFrom(NOW, 5 * DAY_MS) }),
    makeRecord({ memory_type: 'profile_preference', memory_key: 'newer_pref', updated_at: isoAgoFrom(NOW, 1 * DAY_MS) }),
  ];
  const selected = selectCoachingMemories(records, undefined, NOW);
  console.assert(selected[0].memory_key === 'newer_pref', 'H6 newer record ranks first within same type');
  console.log('H6 PASS selectCoachingMemories recency tiebreaker');
}

function testSelectCoaching_noMode_defaultPriority(): void {
  const records = makeRecords();
  const selected = selectCoachingMemories(records, undefined, NOW);
  // Default: profile_preference, productivity_pattern, coaching_preference, goal, habit
  console.assert(selected[0].memory_type === 'profile_preference', 'H7 no mode → profile_preference first');
  console.log('H7 PASS selectCoachingMemories no mode → default priority');
}

// ─── Section I: buildMemoryPromptSummary ─────────────────────────────────────

function testBuildSummary_empty(): void {
  const result = buildMemoryPromptSummary([]);
  console.assert(result === '', 'I1 empty records → empty string');
  console.log('I1 PASS buildMemoryPromptSummary empty → ""');
}

function testBuildSummary_noPatternRecord(): void {
  const records: PolicyMemoryRecord[] = [
    makeRecord({ memory_type: 'profile_preference', memory_key: 'coaching_tone' }),
  ];
  const result = buildMemoryPromptSummary(records);
  console.assert(result === '', 'I2 no productivity_pattern → empty string');
  console.log('I2 PASS buildMemoryPromptSummary no productivity_pattern → ""');
}

function testBuildSummary_withPattern(): void {
  const records: PolicyMemoryRecord[] = [
    makeRecord({
      memory_type:  'productivity_pattern',
      memory_key:   'productivity_pattern',
      memory_value: {
        systemTakeaway:    'avoidance_pattern',
        avgCompletionRate: 0.58,
        sampleCount:       7,
        rollingTakeaways:  ['solid_day', 'clean_day', 'avoidance_pattern', 'mixed_day', 'avoidance_pattern'],
        dominantDrift:     'avoidance',
      },
    }),
  ];
  const result = buildMemoryPromptSummary(records);
  console.assert(result.includes('═══ EXECUTION PATTERNS ═══'), 'I3a section header present');
  console.assert(result.includes('avoidance_pattern'), 'I3b takeaway present');
  console.assert(result.includes('7-day'), 'I3c sample count label');
  console.assert(result.includes('58%'), 'I3d avg completion rate');
  console.assert(result.includes('Rolling patterns'), 'I3e rolling patterns line');
  console.assert(result.includes('Recurring drift'), 'I3f drift line');
  console.log('I3 PASS buildMemoryPromptSummary with full pattern record');
}

function testBuildSummary_noRolling_noAvg(): void {
  const records: PolicyMemoryRecord[] = [
    makeRecord({
      memory_type:  'productivity_pattern',
      memory_key:   'productivity_pattern',
      memory_value: {
        systemTakeaway: 'clean_day',
        // no avgCompletionRate, no rollingTakeaways
      },
    }),
  ];
  const result = buildMemoryPromptSummary(records);
  console.assert(result.includes('clean_day'), 'I4a takeaway present');
  // No rolling or avg should not cause errors
  console.assert(!result.includes('Rolling'), 'I4b no rolling line (only 1 entry)');
  console.assert(!result.includes('avg'), 'I4c no avg without avgCompletionRate');
  console.log('I4 PASS buildMemoryPromptSummary minimal pattern — no rolling/avg');
}

function testBuildSummary_noDrift(): void {
  const records: PolicyMemoryRecord[] = [
    makeRecord({
      memory_type:  'productivity_pattern',
      memory_key:   'productivity_pattern',
      memory_value: {
        systemTakeaway:    'solid_day',
        rollingTakeaways:  ['clean_day', 'solid_day'],
        avgCompletionRate: 0.75,
        sampleCount:       2,
      },
    }),
  ];
  const result = buildMemoryPromptSummary(records);
  console.assert(!result.includes('Recurring drift'), 'I5 no drift line when dominantDrift absent');
  console.log('I5 PASS buildMemoryPromptSummary no drift → no drift line');
}

// ─── Section J: Stable-key strategy (constants) ──────────────────────────────

function testStableSignalKeys(): void {
  console.assert(STABLE_SIGNAL_KEYS.productivity_pattern === 'productivity_pattern', 'J1 stable key for productivity_pattern');
  console.assert(STABLE_SIGNAL_KEYS.coaching_preference  === 'recovery_preference',  'J2 stable key for coaching_preference');
  console.log('J1-J2 PASS STABLE_SIGNAL_KEYS — stable per-type keys, no date suffix');
}

function testStableKeys_noDateSuffix(): void {
  // Old pattern: `${signalType}_2026-03-31` — this should NOT be the key anymore
  const badKey = `productivity_pattern_2026-03-31`;
  const stableKey = STABLE_SIGNAL_KEYS['productivity_pattern'] ?? 'productivity_pattern';
  console.assert(!stableKey.includes('_2026'), 'J3 stable key must not contain date');
  console.assert(stableKey === 'productivity_pattern', `J3 stable key is "productivity_pattern", not "${badKey}"`);
  console.log('J3 PASS STABLE_SIGNAL_KEYS — date-keyed pollution eliminated');
}

function testDurableSampleThreshold(): void {
  console.assert(DURABLE_SAMPLE_THRESHOLD === 7, 'J4 durable threshold = 7 (one week)');
  console.log('J4 PASS DURABLE_SAMPLE_THRESHOLD = 7');
}

function testRollingWindow(): void {
  console.assert(ROLLING_TAKEAWAY_WINDOW === 7, 'J5 rolling window = 7');
  console.log('J5 PASS ROLLING_TAKEAWAY_WINDOW = 7');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function runAll(): void {
  const tests = [
    // A
    testScoreProductivityPattern_highClarity,
    testScoreProductivityPattern_lowClarity,
    testScoreProductivityPattern_noTakeaway,
    testScoreProductivityPattern_avoidancePattern,
    testScoreCoachingPreference_complete,
    testScoreCoachingPreference_missingMode,
    testScoreProfilePreference_canonical,
    testScoreProfilePreference_empty,
    testScoreGoal_canonical,
    testScoreMaxCap,
    // B
    testShouldStore_highQuality,
    testShouldStore_belowThreshold,
    testShouldStore_emptyValue,
    testShouldStore_threshold,
    testShouldStore_mixedDay_aboveThreshold,
    // C
    testShouldMerge_sameKey,
    testShouldMerge_noExisting,
    testShouldMerge_differentKey,
    // D
    testMergeMemory_productivityPattern_firstMerge,
    testMergeMemory_productivityPattern_ringBuffer,
    testMergeMemory_nonPattern_newerWins,
    testMergeMemory_profilePreference_newerWins,
    testMergeMemory_pureNoMutation,
    // E
    testGetMemoryTTL_permanent,
    testGetMemoryTTL_transient,
    testMemoryTTL_constants,
    // F
    testShouldExpire_permanent,
    testShouldExpire_withinTTL,
    testShouldExpire_exceeded,
    testShouldExpire_habit,
    testShouldExpire_coaching_withinTTL,
    // G
    testPromotion_notProductivityPattern,
    testPromotion_belowThreshold,
    testPromotion_atThreshold,
    testPromotion_aboveThreshold,
    testPromotion_noSampleCount,
    // H
    testSelectCoaching_strategicPlanning,
    testSelectCoaching_recoveryCoach,
    testSelectCoaching_filtersExpired,
    testSelectCoaching_durableExemptFromExpiry,
    testSelectCoaching_maxRecordsCap,
    testSelectCoaching_recencyTiebreaker,
    testSelectCoaching_noMode_defaultPriority,
    // I
    testBuildSummary_empty,
    testBuildSummary_noPatternRecord,
    testBuildSummary_withPattern,
    testBuildSummary_noRolling_noAvg,
    testBuildSummary_noDrift,
    // J
    testStableSignalKeys,
    testStableKeys_noDateSuffix,
    testDurableSampleThreshold,
    testRollingWindow,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (err) {
      console.error(`FAIL ${test.name}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\n═══ Batch 18 Results: ${passed} passed, ${failed} failed / ${tests.length} total ═══`);
  if (failed > 0) process.exit(1);
}

runAll();
