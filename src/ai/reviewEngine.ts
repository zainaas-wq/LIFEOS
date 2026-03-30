/**
 * LifeOS Review Engine
 *
 * Pure computation layer for end-of-day and weekly reviews.
 * No store access, no React, no side effects.
 *
 * Responsibilities:
 *   - computeDailyReview()          — build DailyReview from store state slices
 *   - computeWeeklyReview()         — roll up DailyReviews into a WeeklyReview
 *   - generateReviewMemorySignals() — produce signals for memory service
 *   - getDominantDriftType()        — most frequent drift across a set of reviews
 */

import { timeToMins } from './planGenerator';
import type {
  PlanItem,
  DistractionLog,
  DriftRecord,
  RecoveryMode,
  DailyReview,
  WeeklyReview,
  WeeklyDaySummary,
  ReviewMemorySignal,
  DriftType,
} from '../types';

// ─── Daily Review ──────────────────────────────────────────────────────────────

export interface DailyReviewInput {
  /** YYYY-MM-DD for today. */
  date: string;
  /** All plan items for today (includes breaks, events, etc.). */
  planItems: PlanItem[];
  /** All distraction logs in the store (filtered internally by date). */
  distractionLogs: DistractionLog[];
  /** Today's drift audit log (ephemeral, cleared on day boundary). */
  driftHistory: DriftRecord[];
  /** Recovery mode currently in effect (null = none used). */
  activeRecoveryMode: RecoveryMode | null;
  /** Number of tasks explicitly skipped this day. */
  taskSkipCount: number;
  /**
   * Optional pre-computed alignment score (0–100).
   * If omitted, alignmentScore is left undefined in the output.
   */
  alignmentScore?: number;
}

/**
 * Builds a DailyReview from store state slices.
 *
 * Does NOT include user reflection text (reflectionText, whatWorked,
 * whatFailed, tomorrowFocus) — those are added on the review screen.
 * systemTakeaway is machine-derived here from the computed signals.
 */
export function computeDailyReview(input: DailyReviewInput): DailyReview {
  const {
    date,
    planItems,
    distractionLogs,
    driftHistory,
    activeRecoveryMode,
    taskSkipCount,
    alignmentScore,
  } = input;

  // Only goal/skill items count toward completion review (not breaks, events, habits).
  const actionable = planItems.filter(
    (i) => i.type === 'goal' || i.type === 'skill',
  );
  const completedActionable = actionable.filter((i) => i.completed);
  const completedCount = completedActionable.length;
  const totalCount = actionable.length;

  // focusMinutes: sum durations of all completed goal/skill plan items.
  const focusMinutes = completedActionable.reduce(
    (acc, i) => acc + Math.max(0, timeToMins(i.endTime) - timeToMins(i.startTime)),
    0,
  );

  // criticalDone: any isCritical item (any type) completed today.
  const criticalDone = planItems.some((i) => !!i.isCritical && i.completed);

  // driftTypes: unique types from today's drift audit history.
  const driftTypes: DriftType[] = Array.from(
    new Set(driftHistory.map((r) => r.type)),
  );

  // recoveryUsed: active recovery mode OR at least one recovery was applied.
  const recoveryUsed =
    activeRecoveryMode !== null ||
    driftHistory.some((r) => r.recoveryApplied !== null);

  const recoveryMode = activeRecoveryMode ?? undefined;

  // distractionCount: only today's distraction logs.
  const distractionCount = distractionLogs.filter((d) =>
    d.timestamp.startsWith(date),
  ).length;

  // systemTakeaway: machine-derived single-word pattern tag.
  const systemTakeaway = _deriveSystemTakeaway(
    completedCount,
    totalCount,
    driftTypes,
    distractionCount,
    recoveryUsed,
  );

  return {
    date,
    completedCount,
    totalCount,
    focusMinutes,
    criticalDone,
    driftTypes,
    recoveryUsed,
    recoveryMode,
    alignmentScore,
    savedAt: new Date().toISOString(),
    distractionCount,
    skipCount: taskSkipCount,
    systemTakeaway,
  };
}

/**
 * Derives a short machine-readable pattern tag from today's execution data.
 * Used as a signal in ai_user_memory for coach personalization.
 */
function _deriveSystemTakeaway(
  completed: number,
  total: number,
  driftTypes: DriftType[],
  distractionCount: number,
  recoveryUsed: boolean,
): string {
  const rate = total > 0 ? completed / total : 1;

  if (rate === 1 && driftTypes.length === 0) return 'clean_day';
  if (rate === 1 && recoveryUsed)            return 'recovered_strong';
  if (rate >= 0.7 && driftTypes.length === 0) return 'solid_day';
  if (driftTypes.includes('avoidance') && rate < 0.4) return 'avoidance_pattern';
  if (driftTypes.includes('overload'))       return 'overload_pattern';
  if (distractionCount >= 5)                 return 'distraction_heavy';
  if (recoveryUsed && rate >= 0.5)           return 'recovery_effective';
  if (rate < 0.3)                            return 'low_execution';
  return 'mixed_day';
}

// ─── Weekly Review ─────────────────────────────────────────────────────────────

/**
 * Rolls up DailyReviews into a WeeklyReview.
 *
 * Days not in `dailyReviews` for the given week are simply absent from
 * `dailySummaries` — they do not affect averages.
 *
 * @param dailyReviews  All daily reviews available in the store. Filtered internally.
 * @param weekStart     Monday in YYYY-MM-DD format (ISO week start).
 */
export function computeWeeklyReview(
  dailyReviews: DailyReview[],
  weekStart: string,
): WeeklyReview {
  const weekEnd = _addDays(weekStart, 6);

  const weekReviews = dailyReviews.filter(
    (r) => r.date >= weekStart && r.date <= weekEnd,
  );

  const dailySummaries: WeeklyDaySummary[] = weekReviews.map((r) => ({
    date:           r.date,
    completionRate: r.totalCount > 0 ? r.completedCount / r.totalCount : 1,
    focusMinutes:   r.focusMinutes,
    driftCount:     r.driftTypes.length,
    recoveryUsed:   r.recoveryUsed,
  }));

  // avgCompletionRate excludes days where the user had no tasks (totalCount === 0).
  const daysWithTasks = weekReviews.filter((r) => r.totalCount > 0);
  const avgCompletionRate =
    daysWithTasks.length > 0
      ? daysWithTasks.reduce(
          (acc, r) => acc + r.completedCount / r.totalCount,
          0,
        ) / daysWithTasks.length
      : 0;

  const totalFocusMinutes = weekReviews.reduce((acc, r) => acc + r.focusMinutes, 0);

  const dominantDriftType = getDominantDriftType(weekReviews);

  const recoveryCount = weekReviews.filter((r) => r.recoveryUsed).length;

  const withScore = weekReviews.filter((r) => r.alignmentScore !== undefined);
  const avgAlignmentScore =
    withScore.length > 0
      ? Math.round(
          withScore.reduce((acc, r) => acc + (r.alignmentScore ?? 0), 0) /
            withScore.length,
        )
      : 0;

  return {
    weekStart,
    weekEnd,
    dailySummaries,
    avgCompletionRate,
    totalFocusMinutes,
    dominantDriftType,
    recoveryCount,
    avgAlignmentScore,
    savedAt: new Date().toISOString(),
  };
}

// ─── Memory Signals ────────────────────────────────────────────────────────────

/**
 * Generates memory signals from a daily review.
 *
 * Always emits a `productivity_pattern` signal.
 * Emits a `coaching_preference` signal only when recovery was used.
 *
 * These are consumed by reviewService.saveDailyReview(), which calls
 * memoryService.upsertMemory() to write them to ai_user_memory.
 */
export function generateReviewMemorySignals(review: DailyReview): ReviewMemorySignal[] {
  const signals: ReviewMemorySignal[] = [];

  const completionRate =
    review.totalCount > 0
      ? Math.round((review.completedCount / review.totalCount) * 100) / 100
      : 1;

  // Productivity pattern — always emitted.
  signals.push({
    signalType: 'productivity_pattern',
    content: JSON.stringify({
      completionRate,
      focusMinutes:     review.focusMinutes,
      dominantDrift:    review.driftTypes[0] ?? null,
      distractionCount: review.distractionCount ?? 0,
      skipCount:        review.skipCount ?? 0,
      systemTakeaway:   review.systemTakeaway ?? null,
    }),
    date: review.date,
  });

  // Recovery preference — only when recovery was used.
  if (review.recoveryUsed && review.recoveryMode) {
    signals.push({
      signalType: 'coaching_preference',
      content: JSON.stringify({
        recoveryMode: review.recoveryMode,
        wasEffective: completionRate >= 0.5,
        date:         review.date,
      }),
      date: review.date,
    });
  }

  return signals;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the most frequently occurring DriftType across a set of reviews.
 * Returns null if no drifts were recorded.
 * Tie-breaking: first occurrence in Map insertion order wins (deterministic).
 */
export function getDominantDriftType(reviews: DailyReview[]): DriftType | null {
  const counts = new Map<DriftType, number>();
  for (const review of reviews) {
    for (const dt of review.driftTypes) {
      counts.set(dt, (counts.get(dt) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;

  let dominant: DriftType | null = null;
  let max = 0;
  for (const [dt, count] of counts) {
    if (count > max) {
      max = count;
      dominant = dt;
    }
  }
  return dominant;
}

/** Returns the Monday (weekStart) for a given YYYY-MM-DD date. */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function _addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
