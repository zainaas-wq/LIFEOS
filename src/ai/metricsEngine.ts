/**
 * LifeOS Metrics Engine
 *
 * Pure functions for deriving behavioral metrics from saved DailyReview data.
 * No store access, no React, no side effects. Safe to import in Node tests.
 *
 * Consumers:
 *   - Coach context (future: inject trends into AI system prompt)
 *   - Dashboard screen (future: completion trend chart)
 *   - adaptationEngine (already reads systemTakeaway — these are complementary)
 *
 * Data model boundary:
 *   - Input:  DailyReview[] from local store (persisted, last 30 days)
 *   - Output: plain numbers/strings — no side effects, no writes
 *   - NOT a replacement for analytics_events — those are the raw event stream;
 *     these are aggregated signals derived from structured review data.
 */

import type { DailyReview, DriftType, RecoveryMode } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompletionDataPoint {
  date: string;           // YYYY-MM-DD
  rate: number;           // 0–1
  focusMinutes: number;
}

export interface DriftFrequencyBreakdown {
  avgDriftsPerDay: number;
  byType: Record<DriftType, number>; // count per drift type across all reviews
  worstDay: string | null;            // date with most drifts
}

export interface RecoveryStats {
  /** Fraction of days where recovery was used (0–1). */
  usageRate: number;
  /** Fraction of recovery days where completion rate ≥ 0.5 (0–1). */
  effectivenessRate: number;
  /** Recovery modes ranked by effectiveness score (best first). */
  rankedModes: { mode: RecoveryMode; score: number; uses: number }[];
}

export interface RetentionSignals {
  /** Total number of reviews saved in the window. */
  reviewsSaved: number;
  /** Days in window that had at least one plan item (totalCount > 0). */
  activeDays: number;
  /** Fraction of active days with a saved review. */
  reviewCompletionRate: number;
  /** Longest consecutive streak of days with ≥1 completed task. */
  bestCompletionStreak: number;
  /** Current streak (from most recent date backwards). */
  currentCompletionStreak: number;
}

export interface MetricsSummary {
  windowDays: number;
  avgCompletionRate: number;
  totalFocusMinutes: number;
  drift: DriftFrequencyBreakdown;
  recovery: RecoveryStats;
  retention: RetentionSignals;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns daily completion rate + focus minutes for the last `days` reviews.
 * Sorted ascending by date (oldest first — suitable for chart rendering).
 */
export function computeCompletionTrend(
  reviews: DailyReview[],
  days = 7,
): CompletionDataPoint[] {
  return [...reviews]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days)
    .map((r) => ({
      date:         r.date,
      rate:         r.totalCount > 0 ? r.completedCount / r.totalCount : 1,
      focusMinutes: r.focusMinutes,
    }));
}

/**
 * Average daily completion rate across all provided reviews.
 * Days with totalCount === 0 are excluded (no tasks = not a meaningful day).
 */
export function computeAvgCompletionRate(reviews: DailyReview[]): number {
  const active = reviews.filter((r) => r.totalCount > 0);
  if (active.length === 0) return 0;
  return active.reduce((sum, r) => sum + r.completedCount / r.totalCount, 0) / active.length;
}

/**
 * Drift frequency analysis over the provided reviews.
 */
export function computeDriftFrequency(reviews: DailyReview[]): DriftFrequencyBreakdown {
  if (reviews.length === 0) {
    return { avgDriftsPerDay: 0, byType: {} as Record<DriftType, number>, worstDay: null };
  }

  const byType = {} as Record<DriftType, number>;
  let worstDay: string | null = null;
  let worstCount = 0;
  let totalDrifts = 0;

  for (const r of reviews) {
    totalDrifts += r.driftTypes.length;
    if (r.driftTypes.length > worstCount) {
      worstCount = r.driftTypes.length;
      worstDay = r.date;
    }
    for (const dt of r.driftTypes) {
      byType[dt] = (byType[dt] ?? 0) + 1;
    }
  }

  return {
    avgDriftsPerDay: totalDrifts / reviews.length,
    byType,
    worstDay,
  };
}

/**
 * Recovery usage and effectiveness stats.
 *
 * Effectiveness: completion rate ≥ 0.5 on a day where recovery was used.
 * Mode score: effective uses / total uses (0–1). Only modes with ≥1 use included.
 */
export function computeRecoveryStats(reviews: DailyReview[]): RecoveryStats {
  const recoveryDays = reviews.filter((r) => r.recoveryUsed && r.totalCount > 0);
  const usageRate = reviews.length > 0 ? recoveryDays.length / reviews.length : 0;

  const effectiveDays = recoveryDays.filter(
    (r) => r.completedCount / r.totalCount >= 0.5,
  );
  const effectivenessRate = recoveryDays.length > 0
    ? effectiveDays.length / recoveryDays.length
    : 0;

  // Mode breakdown
  const modeUses    = new Map<RecoveryMode, number>();
  const modeEffective = new Map<RecoveryMode, number>();
  for (const r of recoveryDays) {
    if (!r.recoveryMode) continue;
    modeUses.set(r.recoveryMode, (modeUses.get(r.recoveryMode) ?? 0) + 1);
    if (r.completedCount / r.totalCount >= 0.5) {
      modeEffective.set(r.recoveryMode, (modeEffective.get(r.recoveryMode) ?? 0) + 1);
    }
  }

  const rankedModes = Array.from(modeUses.entries())
    .map(([mode, uses]) => ({
      mode,
      uses,
      score: (modeEffective.get(mode) ?? 0) / uses,
    }))
    .sort((a, b) => b.score - a.score);

  return { usageRate, effectivenessRate, rankedModes };
}

/**
 * Review completion rate and streak metrics.
 *
 * @param reviews         All saved DailyReview entries.
 * @param activeDayCount  Number of days the user had at least one task planned.
 *                        When unknown, pass reviews.length as a reasonable proxy.
 */
export function computeRetentionSignals(
  reviews: DailyReview[],
  activeDayCount?: number,
): RetentionSignals {
  const effectiveActiveDays = activeDayCount ?? reviews.filter((r) => r.totalCount > 0).length;
  const reviewCompletionRate = effectiveActiveDays > 0
    ? Math.min(1, reviews.length / effectiveActiveDays)
    : 0;

  // Streak computation — requires date-sorted reviews
  const sorted = [...reviews]
    .filter((r) => r.completedCount > 0)
    .map((r) => r.date)
    .sort();

  let bestStreak = 0;
  let currentStreak = 0;
  let streak = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diffDays = Math.round(
      (curr.getTime() - prev.getTime()) / 86_400_000,
    );
    if (diffDays === 1) {
      streak++;
    } else {
      bestStreak = Math.max(bestStreak, streak);
      streak = 1;
    }
  }
  bestStreak = Math.max(bestStreak, streak);

  // Current streak — from most recent date back
  if (sorted.length > 0) {
    currentStreak = 1;
    for (let i = sorted.length - 1; i >= 1; i--) {
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(sorted[i]);
      const diff = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
      if (diff === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return {
    reviewsSaved:          reviews.length,
    activeDays:            effectiveActiveDays,
    reviewCompletionRate,
    bestCompletionStreak:  sorted.length > 0 ? bestStreak : 0,
    currentCompletionStreak: sorted.length > 0 ? currentStreak : 0,
  };
}

/**
 * Full metrics summary over the last `days` reviews.
 * Convenience wrapper around all individual metric functions.
 */
export function computeMetricsSummary(
  allReviews: DailyReview[],
  days = 30,
): MetricsSummary {
  const sorted = [...allReviews]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);

  return {
    windowDays:        days,
    avgCompletionRate: computeAvgCompletionRate(sorted),
    totalFocusMinutes: sorted.reduce((sum, r) => sum + r.focusMinutes, 0),
    drift:             computeDriftFrequency(sorted),
    recovery:          computeRecoveryStats(sorted),
    retention:         computeRetentionSignals(sorted),
  };
}

/**
 * Average alignment score across reviews that have one.
 * Returns 0 when no scored reviews exist.
 */
export function computeAvgAlignmentScore(reviews: DailyReview[]): number {
  const withScore = reviews.filter((r) => r.alignmentScore !== undefined);
  if (withScore.length === 0) return 0;
  return (
    withScore.reduce((sum, r) => sum + (r.alignmentScore ?? 0), 0) /
    withScore.length
  );
}
