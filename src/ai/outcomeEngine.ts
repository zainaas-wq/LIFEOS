/**
 * outcomeEngine.ts — Product-level outcome metrics for the "Is LifeOS working?" dashboard.
 *
 * Thin adapter over metricsEngine — composes existing pure functions into a
 * dashboard-friendly summary struct. Node-testable. No React, no store deps.
 *
 * Call sites:
 *   - OutcomeDashboard (rendered on Home secondary section)
 *   - Future: coach context injection
 */

import type { DailyReview } from '../types';
import {
  computeAvgCompletionRate,
  computeRecoveryStats,
} from './metricsEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OutcomeTrend {
  /** Average task completion rate across the window (0–1). */
  avgCompletion: number;
  /** Days in window with at least one drift signal detected. */
  driftDays: number;
  /** Fraction of recovery days where completion stayed ≥ 50% (0–1).
   *  Returns -1 when there were no drift/recovery days (display as N/A). */
  recoveryRate: number;
  /** Fraction of the window that has a saved review (0–1, capped at 1). */
  reviewConsistency: number;
  /** Total focus minutes recorded in the window. */
  totalFocusMins: number;
  /** Window size used for this computation. */
  windowDays: number;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Derive product-level outcome metrics from recent reviews.
 *
 * @param reviews    - All DailyReview records (store passes last 30 days)
 * @param windowDays - Look-back window in days (default 7; Pro callers pass 30)
 */
export function computeOutcomeTrend(
  reviews: DailyReview[],
  windowDays: number = 7,
): OutcomeTrend {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const window = reviews.filter((r) => r.date >= cutoffStr);
  const totalFocusMins = window.reduce((s, r) => s + r.focusMinutes, 0);

  if (window.length === 0) {
    return {
      avgCompletion:    0,
      driftDays:        0,
      recoveryRate:     -1,
      reviewConsistency: 0,
      totalFocusMins:   0,
      windowDays,
    };
  }

  const avgCompletion = computeAvgCompletionRate(window);
  const recovery      = computeRecoveryStats(window);
  const driftDays     = window.filter((r) => r.driftTypes.length > 0).length;

  // recoveryRate: -1 signals "no recovery data" → render as N/A, not 0%
  const recoveryRate =
    recovery.effectivenessRate > 0 || window.some((r) => r.recoveryUsed)
      ? recovery.effectivenessRate
      : -1;

  return {
    avgCompletion,
    driftDays,
    recoveryRate,
    reviewConsistency: Math.min(window.length / windowDays, 1),
    totalFocusMins,
    windowDays,
  };
}
