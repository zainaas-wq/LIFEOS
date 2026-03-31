/**
 * reviewService — daily review persistence.
 *
 * Writes to `daily_reviews` Supabase table and emits productivity and
 * coaching signals to `ai_user_memory` via memoryService after each save.
 *
 * Storage contract:
 *   daily_reviews   — one row per (user_id, date); upserted on every save.
 *   ai_user_memory  — productivity_pattern + coaching_preference signals.
 *                     Written fire-and-forget; never blocks the save path.
 *
 * Expected `daily_reviews` table schema:
 *   user_id           UUID          (FK auth.users, RLS enforced)
 *   date              DATE          (YYYY-MM-DD)
 *   completed_count   INTEGER
 *   total_count       INTEGER
 *   focus_minutes     INTEGER
 *   critical_done     BOOLEAN
 *   drift_types       TEXT[]
 *   recovery_used     BOOLEAN
 *   recovery_mode     TEXT
 *   reflection_text   TEXT
 *   alignment_score   INTEGER
 *   distraction_count INTEGER
 *   skip_count        INTEGER
 *   what_worked       TEXT
 *   what_failed       TEXT
 *   tomorrow_focus    TEXT
 *   system_takeaway   TEXT
 *   saved_at          TIMESTAMPTZ
 *
 * Unique constraint: (user_id, date) — upsert uses onConflict: 'user_id,date'.
 */

import { supabase } from '../lib/supabase';
import { upsertMemory } from './memoryService';
import { generateReviewMemorySignals } from '../ai/reviewEngine';
import { shouldStoreMemory, STABLE_SIGNAL_KEYS } from '../ai/memoryPolicyEngine';
import type { DailyReview } from '../types';
import type { MemoryType } from './memoryService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from('daily_reviews');

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Upserts a DailyReview to Supabase and emits memory signals.
 *
 * Memory signals are fire-and-forget — a failure there never surfaces to the
 * caller and never blocks the user's review save.
 */
export async function saveDailyReview(
  userId: string,
  review: DailyReview,
): Promise<void> {
  const { error } = await table().upsert(
    {
      user_id:           userId,
      date:              review.date,
      completed_count:   review.completedCount,
      total_count:       review.totalCount,
      focus_minutes:     review.focusMinutes,
      critical_done:     review.criticalDone,
      drift_types:       review.driftTypes,
      recovery_used:     review.recoveryUsed,
      recovery_mode:     review.recoveryMode ?? null,
      reflection_text:   review.reflectionText ?? null,
      alignment_score:   review.alignmentScore ?? null,
      distraction_count: review.distractionCount ?? null,
      skip_count:        review.skipCount ?? null,
      what_worked:       review.whatWorked ?? null,
      what_failed:       review.whatFailed ?? null,
      tomorrow_focus:    review.tomorrowFocus ?? null,
      system_takeaway:   review.systemTakeaway ?? null,
      saved_at:          review.savedAt,
    },
    { onConflict: 'user_id,date' },
  );

  if (error) {
    console.warn('[reviewService] saveDailyReview:', error.message);
    return;
  }

  // Emit memory signals — fire and forget, never blocks the save result.
  // Quality gate: low-signal reviews (e.g. no tasks, zero focus) are skipped.
  // Stable keys: one row per signal type per user — avoids date-keyed pollution.
  const signals = generateReviewMemorySignals(review);
  for (const signal of signals) {
    const memoryType  = signal.signalType as MemoryType;
    const memoryKey   = STABLE_SIGNAL_KEYS[memoryType] ?? signal.signalType;
    const memoryValue = JSON.parse(signal.content) as Record<string, unknown>;

    const candidate = { memoryType, memoryKey, memoryValue };
    if (!shouldStoreMemory(candidate)) continue;

    upsertMemory({ memoryType, memoryKey, memoryValue }).catch(console.warn);
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetches a single DailyReview for a given date.
 * Returns null if not found or on error.
 */
export async function getDailyReview(
  userId: string,
  date: string,
): Promise<DailyReview | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await table()
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (error) {
    console.warn('[reviewService] getDailyReview:', error.message);
    return null;
  }
  if (!data) return null;

  return _rowToReview(data);
}

/**
 * Fetches all DailyReviews for a given week (weekStart to weekEnd inclusive).
 * Returns [] on any error.
 */
export async function getWeeklyReviews(
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<DailyReview[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await table()
    .select('*')
    .eq('user_id', userId)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .order('date', { ascending: true });

  if (error) {
    console.warn('[reviewService] getWeeklyReviews:', error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => _rowToReview(row));
}

// ─── Private ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _rowToReview(row: any): DailyReview {
  return {
    date:             row.date,
    completedCount:   row.completed_count,
    totalCount:       row.total_count,
    focusMinutes:     row.focus_minutes,
    criticalDone:     row.critical_done,
    driftTypes:       row.drift_types ?? [],
    recoveryUsed:     row.recovery_used,
    recoveryMode:     row.recovery_mode ?? undefined,
    reflectionText:   row.reflection_text ?? undefined,
    alignmentScore:   row.alignment_score ?? undefined,
    savedAt:          row.saved_at,
    distractionCount: row.distraction_count ?? undefined,
    skipCount:        row.skip_count ?? undefined,
    whatWorked:       row.what_worked ?? undefined,
    whatFailed:       row.what_failed ?? undefined,
    tomorrowFocus:    row.tomorrow_focus ?? undefined,
    systemTakeaway:   row.system_takeaway ?? undefined,
  };
}
