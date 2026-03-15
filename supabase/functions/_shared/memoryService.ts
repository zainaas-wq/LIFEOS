/**
 * _shared/memoryService.ts — AI User Memory helpers for Edge Functions.
 *
 * Shared Deno module.  Imported via relative path:
 *   import { ... } from '../_shared/memoryService.ts';
 *
 * Responsibilities:
 *   1. Type definitions for memory records (mirrored in src/services/memoryService.ts)
 *   2. fetchUserMemory() — fail-safe SELECT for prompt injection
 *   3. upsertMemory()   — idempotent INSERT/UPDATE (ready for Block B+)
 *   4. buildMemoryContext() — converts rows to compact prompt section string
 *
 * Design contracts:
 *   - All functions are fail-open: errors produce empty/void results, never throws.
 *   - fetchUserMemory caps at MAX_MEMORY_RECORDS to bound prompt token growth.
 *   - buildMemoryContext returns '' when records is empty — callers must guard
 *     against injecting an empty section into the prompt.
 *   - memory_value must be a JSON object (not array/scalar); enforced by app layer.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export const MEMORY_TYPES = [
  'profile_preference',
  'productivity_pattern',
  'coaching_preference',
  'goal',
  'habit',
] as const;

export type MemoryType = typeof MEMORY_TYPES[number];

/** One structured memory record as returned from Supabase. */
export interface MemoryRecord {
  id:           string;
  user_id:      string;
  memory_type:  MemoryType;
  memory_key:   string;
  memory_value: Record<string, unknown>;
  created_at:   string;
  updated_at:   string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Hard cap on records injected into the prompt.
 * 12 records × ~55 chars ≈ 660 chars ≈ 165 tokens — well within budget.
 * Records are ordered by updated_at DESC so the most-recently-relevant
 * preferences take priority when the cap is hit.
 */
const MAX_MEMORY_RECORDS = 12;

/**
 * Human-readable labels for canonical memory keys.
 * Unknown keys fall back to key.replace(/_/g, ' ').
 */
const KEY_LABELS: Record<string, string> = {
  // profile_preference
  planning_style:              'Planning style',
  preferred_work_hours:        'Preferred work hours',
  preferred_focus_block_mins:  'Preferred focus block',
  // productivity_pattern
  peak_energy_time:            'Peak energy time',
  session_length_preference:   'Preferred session length',
  break_duration_preference:   'Break preference',
  // profile_preference (additional)
  response_length:             'Response length',
  // coaching_preference
  coaching_tone:               'Coaching tone',
  feedback_style:              'Feedback style',
  accountability_level:        'Accountability level',
  // goal
  long_term_intent:            'Long-term intent',
  top_priority:                'Top priority',
  // habit
  recovery_preference:         'Recovery preference',
  morning_routine:             'Morning routine',
  wind_down_routine:           'Wind-down routine',
};

// ─── Database helpers ─────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type AdminClient = any;

/**
 * Fetch all memory records for a user, ordered by recency.
 * Capped at MAX_MEMORY_RECORDS to bound prompt token consumption.
 *
 * Fail-open: returns [] on any error so the caller can build a prompt
 * without memory context rather than failing the entire request.
 */
export async function fetchUserMemory(
  adminClient: AdminClient,
  userId:      string,
): Promise<MemoryRecord[]> {
  if (!adminClient) return [];

  try {
    const { data, error } = await adminClient
      .from('ai_user_memory')
      .select('id, user_id, memory_type, memory_key, memory_value, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(MAX_MEMORY_RECORDS);

    if (error) {
      console.error('[memoryService] fetchUserMemory failed:', error.message);
      return [];
    }

    return (data as MemoryRecord[]) ?? [];
  } catch (err: unknown) {
    console.error(
      '[memoryService] fetchUserMemory threw:',
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

/**
 * Upsert a single memory record for a user.
 *
 * Uses (user_id, memory_key) as the conflict key — matching the UNIQUE
 * constraint on the table.  Safe to call repeatedly with the same key;
 * only updated_at and memory_value change on conflict.
 *
 * No-op (silent) if adminClient is null.
 */
export async function upsertMemory(
  adminClient:  AdminClient,
  userId:       string,
  memoryType:   MemoryType,
  memoryKey:    string,
  memoryValue:  Record<string, unknown>,
): Promise<void> {
  if (!adminClient) return;

  try {
    const { error } = await adminClient
      .from('ai_user_memory')
      .upsert(
        {
          user_id:      userId,
          memory_type:  memoryType,
          memory_key:   memoryKey,
          memory_value: memoryValue,
          updated_at:   new Date().toISOString(),
        },
        { onConflict: 'user_id,memory_key' },
      );

    if (error) {
      console.error('[memoryService] upsertMemory failed:', error.message);
    }
  } catch (err: unknown) {
    console.error(
      '[memoryService] upsertMemory threw:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── Prompt formatting ────────────────────────────────────────────────────────

/**
 * Renders a single memory_value object as a compact human-readable string.
 *
 * Canonical shapes:
 *   { value: "morning" }          → "morning"
 *   { value: 50 }                 → "50"
 *   { start: "09:00", end: "18:00" } → "09:00–18:00"
 *   { minutes: 45 }               → "45 min"
 *   { steps: ["x", "y", "z"] }   → "x, y, z"
 *   (anything else)               → JSON string, truncated to 60 chars
 */
function renderMemoryValue(value: Record<string, unknown>): string {
  if ('value' in value) {
    return String(value.value);
  }
  if ('start' in value && 'end' in value) {
    return `${String(value.start)}–${String(value.end)}`;
  }
  if ('minutes' in value) {
    return `${String(value.minutes)} min`;
  }
  if ('steps' in value && Array.isArray(value.steps)) {
    return (value.steps as unknown[]).map(String).join(', ');
  }
  // Fallback: compact JSON, truncated to avoid token bloat
  const raw = JSON.stringify(value);
  return raw.length > 60 ? raw.slice(0, 57) + '…' : raw;
}

/**
 * Converts a list of memory records into a compact prompt section.
 *
 * Returns '' when records is empty — callers must check before
 * inserting a section header into the prompt.
 *
 * Output format (when non-empty):
 *   ═══ PERSONAL CONTEXT ═══
 *   • Planning style: structured
 *   • Peak energy time: morning
 *   • Coaching tone: direct
 *   ...
 */
export function buildMemoryContext(records: MemoryRecord[]): string {
  if (records.length === 0) return '';

  const lines = records
    .filter((r) => r.memory_value !== null && typeof r.memory_value === 'object' && !Array.isArray(r.memory_value))
    .map((r): string | null => {
      const label    = KEY_LABELS[r.memory_key] ?? r.memory_key.replace(/_/g, ' ');
      const valueStr = renderMemoryValue(r.memory_value);
      if (!valueStr) return null;
      return `• ${label}: ${valueStr}`;
    })
    .filter((line): line is string => line !== null);

  if (lines.length === 0) return '';

  return '═══ PERSONAL CONTEXT ═══\n' + lines.join('\n');
}

// ─── Personalization instruction building ─────────────────────────────────────

/**
 * Allowlisted memory keys that produce behavioral coaching directives.
 * Any key NOT in this set is ignored, regardless of its memory_value.
 * This is the primary injection-safety gate.
 */
const PERSONALIZATION_KEYS = new Set([
  'coaching_tone',
  'feedback_style',
  'accountability_level',
  'planning_style',
  'response_length',
]);

/**
 * Canonical directive map: memory_key → (value → directive string).
 *
 * Directive contract:
 *   - Non-empty string → injected as a bullet instruction into the prompt.
 *   - Empty string     → recognized value that represents the default; no directive added.
 *   - Missing key      → unknown value; no directive added (fail-silent).
 *
 * Directives are pre-written English sentences. The user's raw memory_value is never
 * passed through to the prompt — only these pre-approved sentences can appear.
 */
const PERSONALIZATION_DIRECTIVES: Record<string, Record<string, string>> = {
  coaching_tone: {
    direct:   'Be direct. State problems plainly without softening language.',
    gentle:   'Use an encouraging tone. Acknowledge effort and progress before addressing gaps.',
    strict:   'Hold the user firmly to their stated commitments. Name gaps explicitly.',
    balanced: '',  // default — no override
  },
  feedback_style: {
    direct:   'State facts, consequences, and improvements plainly without diplomatic hedging.',
    gentle:   'Frame feedback as observations rather than direct criticism.',
    balanced: '',  // default
  },
  accountability_level: {
    strict: 'When the user falls short of stated targets, name the gap explicitly.',
    light:  'Focus on next steps and forward momentum rather than missed commitments.',
    medium: '',  // default
  },
  planning_style: {
    structured: 'Use time-blocked plans with explicit start and end times.',
    flexible:   'Prefer flexible task suggestions over rigid time blocks.',
  },
  response_length: {
    concise:  'Keep responses short — 3 sentences max unless generating a full plan.',
    detailed: 'Provide more context and explanation alongside your recommendations.',
  },
};

/**
 * Extracts a canonical scalar string from a memory_value object.
 * Only handles the { value: string } shape — the canonical shape for user preferences.
 * Returns '' for any other structure or missing value field.
 */
function extractScalarValue(memoryValue: Record<string, unknown>): string {
  if ('value' in memoryValue && typeof memoryValue.value === 'string') {
    return memoryValue.value.toLowerCase().trim();
  }
  return '';
}

/**
 * Converts memory records into a compact behavioral instruction section for the prompt.
 *
 * Design:
 *   - Allowlist-enforced: only PERSONALIZATION_KEYS are considered.
 *   - Canonical value map: only known values produce directives.
 *   - User's raw memory values never appear in output — only pre-written sentences do.
 *   - Returns '' when no actionable preferences are found — callers must guard before injecting.
 *
 * Output format (when non-empty):
 *   ═══ USER PREFERENCES ═══
 *   • Be direct. State problems plainly without softening language.
 *   • Keep responses short — 3 sentences max unless generating a full plan.
 *
 * Token budget: max 5 directives × ~70 chars ≈ ~88 tokens across all prompt builders.
 *
 * Position in prompts: injected after role definition, before first data section.
 * This is intentionally separate from buildMemoryContext (personal facts) which is
 * injected after data sections — each serves a distinct purpose.
 */
export function buildPersonalizationInstructions(records: MemoryRecord[]): string {
  const directives: string[] = [];

  for (const record of records) {
    // Gate 1: key allowlist
    if (!PERSONALIZATION_KEYS.has(record.memory_key)) continue;

    // Gate 2: shape guard — only well-formed { value: string } objects
    if (
      !record.memory_value ||
      typeof record.memory_value !== 'object' ||
      Array.isArray(record.memory_value)
    ) continue;

    // Gate 3: extract canonical scalar value
    const value = extractScalarValue(record.memory_value);
    if (!value) continue;

    // Gate 4: canonical directive lookup — unknown values produce no output
    const keyMap = PERSONALIZATION_DIRECTIVES[record.memory_key];
    if (!keyMap) continue;

    const directive = keyMap[value];
    if (!directive) continue;  // empty string = explicit default, no override

    directives.push(`• ${directive}`);
  }

  if (directives.length === 0) return '';

  return '═══ USER PREFERENCES ═══\n' + directives.join('\n');
}
