/**
 * intelligenceEngine.ts — Weekly / Monthly Intelligence Layer.
 *
 * Batch 19: Longitudinal intelligence — interprets trajectory over time,
 * not just individual days.
 *
 * Answers:
 *   - What kind of week did the user actually have?
 *   - Is the user improving, flat, or declining?
 *   - What pattern is repeating across multiple reviews?
 *   - What should next week change?
 *   - What should the coach emphasize now?
 *
 * Design rules:
 *   - Pure functions only. No React, no Supabase, no store access.
 *   - Data-sparse guards throughout: insufficient_data is a valid output.
 *   - No fake certainty — every interpretation is signal-traceable.
 *   - Builds on DailyReview[] and existing reviewEngine output; no new data sources.
 */

import type {
  DailyReview,
  DriftType,
  WeeklyIntelligence,
  MonthlyIntelligence,
  MomentumState,
  StrategicRecommendation,
  WeekCharacter,
} from '../types';

// ─── Internal constants ───────────────────────────────────────────────────────

/** Minimum reviewed days for weekCharacter / executionQuality to be meaningful. */
const WEEKLY_MIN_DAYS   = 3;

/** Minimum reviewed days for any monthly trend to be meaningful. */
const MONTHLY_MIN_DAYS  = 7;

/** Fraction of reviewed days a drift type must appear in to be 'repeated'. */
const BREAKDOWN_PATTERN_THRESHOLD = 0.4;

/** Completion-rate delta to call a trend 'improving' or 'declining'. */
const TREND_DELTA = 0.10;

/** Std-deviation threshold above which a week / month is 'volatile' / 'unstable'. */
const VOLATILITY_THRESHOLD = 0.25;

/** Recovery count cutoffs for recoveryDependence levels. */
const RECOVERY_OCCASIONAL_MIN = 1;
const RECOVERY_FREQUENT_MIN   = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function _stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = _mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function _addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function _weekEndFromStart(weekStart: string): string {
  return _addDays(weekStart, 6);
}

function _thirtyDaysAgo(todayDate: string): string {
  return _addDays(todayDate, -29); // inclusive 30-day window
}

/**
 * Returns the ISO Monday (week start) for the given YYYY-MM-DD date.
 * Exported so callers (useAIContext, useStrategicIntelligence, tests) can
 * compute weekStart without importing reviewEngine → planGenerator → react-native.
 */
export function getWeekStartForIntelligence(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 = Sun … 6 = Sat
  const offset = day === 0 ? -6 : 1 - day; // shift to Monday
  return _addDays(dateStr, offset);
}

// ─── computeWeeklyIntelligence ────────────────────────────────────────────────

/**
 * Analyzes the last 7 days of DailyReview records and produces structured
 * intelligence about the week's execution quality, character, and momentum.
 *
 * @param dailyReviews  All available DailyReview records (filtered internally).
 * @param weekStart     Monday in YYYY-MM-DD format.
 */
export function computeWeeklyIntelligence(
  dailyReviews: DailyReview[],
  weekStart: string,
): WeeklyIntelligence {
  const weekEnd = _weekEndFromStart(weekStart);

  // Filter to this week and sort chronologically
  const weekReviews = dailyReviews
    .filter((r) => r.date >= weekStart && r.date <= weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date));

  const reviewedDays = weekReviews.length;

  // Per-day completion rates (only for days that had tasks)
  const reviewsWithTasks = weekReviews.filter((r) => r.totalCount > 0);
  const completionRates  = reviewsWithTasks.map((r) =>
    Math.round((r.completedCount / r.totalCount) * 100) / 100,
  );

  const avgCompletionRate = Math.round(_mean(completionRates) * 100) / 100;
  const totalFocusMinutes = weekReviews.reduce((acc, r) => acc + r.focusMinutes, 0);

  // Recovery dependence
  const recoveryCount = weekReviews.filter((r) => r.recoveryUsed).length;
  const recoveryDependence: WeeklyIntelligence['recoveryDependence'] =
    recoveryCount >= RECOVERY_FREQUENT_MIN   ? 'frequent'
    : recoveryCount >= RECOVERY_OCCASIONAL_MIN ? 'occasional'
    : 'none';

  // Dominant drift pattern
  const dominantDriftPattern = _getDominantDrift(weekReviews);

  // systemTakeaways (non-null only)
  const systemTakeaways = weekReviews
    .map((r) => r.systemTakeaway)
    .filter((t): t is string => typeof t === 'string');

  // reviewConsistency
  const reviewConsistency = Math.round((reviewedDays / 7) * 100) / 100;

  // Momentum trend (require ≥ 4 reviewed days)
  const momentumTrend = _computeMomentumTrend(reviewsWithTasks);

  // Week character
  const weekCharacter = _computeWeekCharacter(
    reviewedDays,
    avgCompletionRate,
    completionRates,
    dominantDriftPattern,
    recoveryCount,
  );

  // Execution quality
  const executionQuality = _computeExecutionQuality(reviewedDays, avgCompletionRate);

  return {
    weekStart,
    weekEnd,
    reviewedDays,
    avgCompletionRate,
    totalFocusMinutes,
    completionRates,
    recoveryDependence,
    dominantDriftPattern,
    weekCharacter,
    executionQuality,
    reviewConsistency,
    momentumTrend,
    systemTakeaways,
  };
}

function _getDominantDrift(reviews: DailyReview[]): DriftType | null {
  const counts = new Map<DriftType, number>();
  for (const r of reviews) {
    for (const dt of r.driftTypes) {
      counts.set(dt, (counts.get(dt) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  let dominant: DriftType | null = null;
  let max = 0;
  for (const [dt, count] of counts) {
    if (count > max) { max = count; dominant = dt; }
  }
  return dominant;
}

function _computeMomentumTrend(
  reviewsWithTasks: DailyReview[],
): WeeklyIntelligence['momentumTrend'] {
  if (reviewsWithTasks.length < 4) return 'insufficient_data';
  const mid  = Math.floor(reviewsWithTasks.length / 2);
  const firstHalf  = reviewsWithTasks.slice(0, mid).map((r) => r.completedCount / r.totalCount);
  const secondHalf = reviewsWithTasks.slice(mid).map((r) => r.completedCount / r.totalCount);
  const diff = _mean(secondHalf) - _mean(firstHalf);
  if (diff > TREND_DELTA)  return 'improving';
  if (diff < -TREND_DELTA) return 'declining';
  return 'flat';
}

function _computeWeekCharacter(
  reviewedDays:           number,
  avgCompletionRate:      number,
  completionRates:        number[],
  dominantDrift:          DriftType | null,
  recoveryCount:          number,
): WeekCharacter {
  if (reviewedDays < WEEKLY_MIN_DAYS) return 'insufficient_data';
  if (dominantDrift === 'overload')   return 'overloaded';
  if (recoveryCount >= RECOVERY_FREQUENT_MIN && avgCompletionRate < 0.6) return 'rebuilding';
  if (completionRates.length >= 2 && _stdDev(completionRates) > VOLATILITY_THRESHOLD) return 'volatile';
  if (avgCompletionRate >= 0.75)      return 'strong';
  if (avgCompletionRate >= 0.45)      return 'stable';
  return 'volatile';
}

function _computeExecutionQuality(
  reviewedDays:      number,
  avgCompletionRate: number,
): WeeklyIntelligence['executionQuality'] {
  if (reviewedDays < WEEKLY_MIN_DAYS) return 'insufficient_data';
  if (avgCompletionRate >= 0.75) return 'high';
  if (avgCompletionRate >= 0.45) return 'medium';
  return 'low';
}

// ─── computeMonthlyIntelligence ───────────────────────────────────────────────

/**
 * Analyzes the last 30 days of DailyReview records and produces high-level
 * trend intelligence about the user's execution trajectory.
 *
 * @param dailyReviews  All available DailyReview records (filtered internally).
 * @param todayDate     YYYY-MM-DD (defines the end of the 30-day window).
 */
export function computeMonthlyIntelligence(
  dailyReviews: DailyReview[],
  todayDate: string,
): MonthlyIntelligence {
  const periodStart = _thirtyDaysAgo(todayDate);
  const periodEnd   = todayDate;

  // Filter to 30-day window and sort chronologically
  const monthReviews = dailyReviews
    .filter((r) => r.date >= periodStart && r.date <= periodEnd)
    .sort((a, b) => a.date.localeCompare(b.date));

  const reviewedDays = monthReviews.length;

  // Completion rates (days with tasks only)
  const reviewsWithTasks = monthReviews.filter((r) => r.totalCount > 0);
  const allRates = reviewsWithTasks.map((r) => r.completedCount / r.totalCount);
  const avgCompletionRate = Math.round(_mean(allRates) * 100) / 100;

  if (reviewedDays < MONTHLY_MIN_DAYS) {
    return {
      periodStart,
      periodEnd,
      reviewedDays,
      avgCompletionRate,
      executionTrend:           'insufficient_data',
      routineStability:         'insufficient_data',
      repeatedBreakdownPatterns: [],
      monthlyInterpretation:    'insufficient_data',
    };
  }

  // Execution trend: compare first half vs second half
  const executionTrend = _computeExecutionTrend(reviewsWithTasks);

  // Routine stability: stdDev of completion rates
  const stdDev = _stdDev(allRates);
  const routineStability: MonthlyIntelligence['routineStability'] =
    stdDev > VOLATILITY_THRESHOLD ? 'unstable' : 'stable';

  // Repeated breakdown patterns
  const repeatedBreakdownPatterns = _computeRepeatedBreakdowns(monthReviews);

  // Monthly interpretation
  const monthlyInterpretation = _computeMonthlyInterpretation(
    executionTrend,
    routineStability,
  );

  return {
    periodStart,
    periodEnd,
    reviewedDays,
    avgCompletionRate,
    executionTrend,
    routineStability,
    repeatedBreakdownPatterns,
    monthlyInterpretation,
  };
}

function _computeExecutionTrend(
  reviewsWithTasks: DailyReview[],
): MonthlyIntelligence['executionTrend'] {
  if (reviewsWithTasks.length < MONTHLY_MIN_DAYS) return 'insufficient_data';
  const rates = reviewsWithTasks.map((r) => r.completedCount / r.totalCount);
  const mid = Math.floor(rates.length / 2);
  const firstHalf  = rates.slice(0, mid);
  const secondHalf = rates.slice(mid);
  const diff = _mean(secondHalf) - _mean(firstHalf);
  const overallStdDev = _stdDev(rates);

  // Strong oscillation check: very high overall variance with only a marginal
  // half-to-half difference — the "improvement" is an artifact of alternating highs/lows.
  // Threshold: stdDev > 0.30 AND half-delta < 0.15 → oscillating regardless of direction.
  if (overallStdDev > 0.30 && Math.abs(diff) < 0.15) return 'oscillating';

  if (diff > TREND_DELTA)  return 'improving';
  if (diff < -TREND_DELTA) return 'declining';
  if (overallStdDev > VOLATILITY_THRESHOLD) return 'oscillating';
  return 'flat';
}

function _computeRepeatedBreakdowns(reviews: DailyReview[]): DriftType[] {
  if (reviews.length === 0) return [];
  const counts = new Map<DriftType, number>();
  for (const r of reviews) {
    // Count each drift type once per day (avoid double-counting multiple in one day)
    const dayTypes = new Set<DriftType>(r.driftTypes);
    for (const dt of dayTypes) {
      counts.set(dt, (counts.get(dt) ?? 0) + 1);
    }
  }
  const threshold = reviews.length * BREAKDOWN_PATTERN_THRESHOLD;
  const repeated: DriftType[] = [];
  for (const [dt, count] of counts) {
    if (count >= threshold) repeated.push(dt);
  }
  return repeated;
}

function _computeMonthlyInterpretation(
  executionTrend:   MonthlyIntelligence['executionTrend'],
  routineStability: MonthlyIntelligence['routineStability'],
): MonthlyIntelligence['monthlyInterpretation'] {
  if (executionTrend === 'insufficient_data') return 'insufficient_data';
  if (executionTrend === 'improving' && routineStability === 'stable')   return 'progressing';
  if (executionTrend === 'declining')                                    return 'decaying';
  if (executionTrend === 'oscillating')                                  return 'oscillating';
  if (executionTrend === 'improving' && routineStability === 'unstable') return 'building';
  return 'oscillating'; // flat with variance — conservative default
}

// ─── getMomentumState ─────────────────────────────────────────────────────────

/**
 * Derives the user's current momentum state from weekly intelligence.
 *
 * building     — strong character + non-declining trend
 * maintaining  — stable character + flat trend
 * recovering   — rebuilding/volatile but trend is improving
 * stalled      — execution is low and not improving
 * insufficient_data — not enough review data to judge
 */
export function getMomentumState(weekly: WeeklyIntelligence): MomentumState {
  if (weekly.weekCharacter === 'insufficient_data') return 'insufficient_data';
  if (weekly.weekCharacter === 'strong' && weekly.momentumTrend !== 'declining') return 'building';
  if (weekly.weekCharacter === 'stable' && weekly.momentumTrend === 'flat') return 'maintaining';
  if (
    (weekly.weekCharacter === 'rebuilding' || weekly.weekCharacter === 'volatile') &&
    weekly.momentumTrend === 'improving'
  ) return 'recovering';
  if (weekly.executionQuality === 'high') return 'maintaining';
  return 'stalled';
}

// ─── getDominantWeeklyPattern ─────────────────────────────────────────────────

/**
 * Returns the most frequently occurring systemTakeaway tag from the week.
 * Returns null when no takeaway data is available.
 */
export function getDominantWeeklyPattern(weekly: WeeklyIntelligence): string | null {
  if (weekly.systemTakeaways.length === 0) return null;
  const counts = new Map<string, number>();
  for (const t of weekly.systemTakeaways) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let dominant: string | null = null;
  let max = 0;
  for (const [t, count] of counts) {
    if (count > max) { max = count; dominant = t; }
  }
  return dominant;
}

// ─── buildStrategicRecommendations ───────────────────────────────────────────

/**
 * Derives up to 3 structured recommendations from weekly + monthly signals.
 *
 * Every recommendation is traceable to a specific signal — no generic advice.
 * Empty array when data is insufficient for confident recommendations.
 * Ordered: high → medium → low priority.
 */
export function buildStrategicRecommendations(
  weekly:  WeeklyIntelligence,
  monthly: MonthlyIntelligence,
): StrategicRecommendation[] {
  if (weekly.weekCharacter === 'insufficient_data') return [];

  const recs: StrategicRecommendation[] = [];

  // ── High priority ──────────────────────────────────────────────────────────

  if (
    weekly.weekCharacter === 'overloaded' ||
    monthly.repeatedBreakdownPatterns.includes('overload')
  ) {
    recs.push({
      action:    'reduce weekly load',
      rationale: `Overload drift ${monthly.repeatedBreakdownPatterns.includes('overload')
        ? 'is a repeated monthly pattern'
        : 'dominated this week'} — the plan consistently exceeds available capacity.`,
      priority:  'high',
      signal:    'overload_pattern',
    });
  }

  if (
    weekly.dominantDriftPattern === 'avoidance' ||
    monthly.repeatedBreakdownPatterns.includes('avoidance')
  ) {
    recs.push({
      action:    'simplify daily plan',
      rationale: `Avoidance pattern ${monthly.repeatedBreakdownPatterns.includes('avoidance')
        ? 'recurs across multiple weeks'
        : 'was the dominant drift this week'} — starting smaller breaks the resistance loop.`,
      priority:  'high',
      signal:    'avoidance_pattern',
    });
  }

  if (weekly.recoveryDependence === 'frequent') {
    recs.push({
      action:    'protect recovery blocks',
      rationale: `Recovery was used on ${weekly.completionRates.length} or more days — it is load-bearing, not optional.`,
      priority:  'high',
      signal:    'recovery_dependence_frequent',
    });
  }

  // ── Medium priority ────────────────────────────────────────────────────────

  if (weekly.reviewConsistency < 0.5) {
    recs.push({
      action:    'increase review consistency',
      rationale: `Only ${weekly.reviewedDays}/7 days were reviewed — pattern detection and adaptation depend on consistent reflection.`,
      priority:  'medium',
      signal:    'low_review_consistency',
    });
  }

  if (
    weekly.momentumTrend === 'improving' &&
    weekly.executionQuality !== 'high'
  ) {
    recs.push({
      action:    'front-load key work',
      rationale: 'Execution is improving across the week — anchor momentum by scheduling critical tasks earlier in the day.',
      priority:  'medium',
      signal:    'improving_momentum',
    });
  }

  if (
    (weekly.weekCharacter === 'rebuilding' || weekly.weekCharacter === 'volatile') &&
    weekly.momentumTrend === 'improving'
  ) {
    recs.push({
      action:    'rebuild momentum',
      rationale: 'The week started rough but improved — keep daily targets modest and consistent to consolidate the upswing.',
      priority:  'medium',
      signal:    'recovering_from_low',
    });
  }

  // ── Low priority ───────────────────────────────────────────────────────────

  if (
    weekly.weekCharacter === 'strong' &&
    (monthly.monthlyInterpretation === 'progressing' || monthly.monthlyInterpretation === 'insufficient_data')
  ) {
    recs.push({
      action:    'maintain current system',
      rationale: 'Execution is consistently strong — avoid unnecessary plan changes that could disrupt a working rhythm.',
      priority:  'low',
      signal:    'strong_execution',
    });
  }

  // Cap at 3, sorted high → medium → low
  const ORDER = { high: 0, medium: 1, low: 2 };
  return recs
    .sort((a, b) => ORDER[a.priority] - ORDER[b.priority])
    .slice(0, 3);
}

// ─── buildStrategicCoachSummary ───────────────────────────────────────────────

/**
 * Builds a compact STRATEGIC INTELLIGENCE section for the AI coaching prompt.
 *
 * Returns '' when there is insufficient data — callers must guard before
 * injecting this section into a system prompt.
 *
 * Example output:
 *   ═══ STRATEGIC INTELLIGENCE ═══
 *   • Week: volatile (4/7 days reviewed, avg 62%)
 *   • Momentum: recovering
 *   • Dominant pattern: avoidance_pattern
 *   • Monthly trend: oscillating (18/30 days reviewed)
 *   • Recovery dependence: frequent
 *   • Top priority: simplify daily plan — avoidance detected across multiple weeks
 */
export function buildStrategicCoachSummary(
  weekly:          WeeklyIntelligence,
  monthly:         MonthlyIntelligence,
  recommendations: StrategicRecommendation[],
): string {
  if (weekly.weekCharacter === 'insufficient_data') {
    if (weekly.reviewedDays === 0) return '';
    // Some data exists but not enough for full intelligence
    return (
      '═══ STRATEGIC INTELLIGENCE ═══\n' +
      `• Week data: ${weekly.reviewedDays}/7 days reviewed — insufficient for pattern analysis`
    );
  }

  const lines: string[] = [];

  // Week character line
  const avgPct = Math.round(weekly.avgCompletionRate * 100);
  lines.push(
    `• Week: ${weekly.weekCharacter} (${weekly.reviewedDays}/7 days reviewed, avg ${avgPct}% completion)`,
  );

  // Momentum
  const momentum = getMomentumState(weekly);
  if (momentum !== 'insufficient_data') {
    lines.push(`• Momentum: ${momentum}`);
  }

  // Dominant weekly pattern
  const pattern = getDominantWeeklyPattern(weekly);
  if (pattern) {
    lines.push(`• Dominant pattern: ${pattern}`);
  }

  // Dominant drift
  if (weekly.dominantDriftPattern) {
    lines.push(`• Dominant drift: ${weekly.dominantDriftPattern}`);
  }

  // Monthly trend
  if (monthly.executionTrend !== 'insufficient_data') {
    lines.push(
      `• Monthly trend: ${monthly.monthlyInterpretation} (${monthly.reviewedDays}/30 days reviewed)`,
    );
  } else if (monthly.reviewedDays > 0) {
    lines.push(`• Monthly data: ${monthly.reviewedDays} days reviewed (more needed)`);
  }

  // Recovery dependence
  if (weekly.recoveryDependence !== 'none') {
    lines.push(`• Recovery dependence: ${weekly.recoveryDependence}`);
  }

  // Top recommendation
  const topRec = recommendations[0];
  if (topRec) {
    lines.push(`• Top priority: ${topRec.action} — ${topRec.rationale}`);
  }

  if (lines.length === 0) return '';
  return '═══ STRATEGIC INTELLIGENCE ═══\n' + lines.join('\n');
}
