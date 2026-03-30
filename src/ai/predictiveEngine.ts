/**
 * predictiveEngine.ts
 *
 * Lightweight heuristic predictor for likely behavioral drift.
 * Derived entirely from existing store signals — no hidden models.
 *
 * Pure functions: no store, no React, no side effects.
 * Node-testable: safe to import in __tests__/batch8-predictive.ts
 *
 * Design contract:
 *   - Every prediction must cite a specific signal (traceable, not "AI magic")
 *   - Prefer false negatives over false positives — only predict when evidence exists
 *   - Confidence 'high' requires ≥2 independent signals or strong recency
 *   - No prediction should fire with zero supporting reviews
 *
 * Consumers:
 *   - store/useAppStore.ts — tickBehavior (recovery ranking), useAIContext (coach signals)
 *   - app/(tabs)/home.tsx — PredictiveWarningCard
 */

import type { DailyReview, AdaptationHints, ControlDailyPlan, RecoveryMode } from '../types';
import type { RecoveryStats } from './metricsEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PredictedRiskType =
  | 'likely_late_start'
  | 'likely_avoidance'
  | 'likely_overload'
  | 'likely_distraction'
  | 'likely_fragmentation';

export interface DriftPrediction {
  /** Machine label — use for keying, switching, and tracking. */
  riskType: PredictedRiskType;
  /** Evidence strength. */
  confidence: 'low' | 'medium' | 'high';
  /** Short UI string — shown in PredictiveWarningCard headline. */
  headline: string;
  /** What signals drove this prediction — traceable to actual data. */
  rationale: string;
  /** What the user should do — one concrete action. */
  actionHint: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Converts "HH:MM" to total minutes since midnight. */
function minsOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Takes the N most recent reviews (sorted descending by date). */
function lastN(reviews: DailyReview[], n: number): DailyReview[] {
  return [...reviews].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
}

/** Count reviews in the window whose systemTakeaway matches a given value. */
function takeawayCount(window: DailyReview[], value: string): number {
  return window.filter((r) => r.systemTakeaway === value).length;
}

/** Count reviews in the window that include a given drift type. */
function driftTypeCount(window: DailyReview[], type: string): number {
  return window.filter((r) => r.driftTypes.includes(type as any)).length;
}

/**
 * Returns the first uncompleted goal/skill item sorted by startTime.
 * null when no uncompleted actionable items exist.
 */
function firstActionable(plan: ControlDailyPlan): import('../types').PlanItem | null {
  return (
    plan.plan.items
      .filter((i) => (i.type === 'goal' || i.type === 'skill') && !i.completed)
      .sort((a, b) => minsOf(a.startTime) - minsOf(b.startTime))[0] ?? null
  );
}

/** Duration of a plan item in minutes. */
function itemDurationMins(item: import('../types').PlanItem): number {
  return Math.max(0, minsOf(item.endTime) - minsOf(item.startTime));
}

// ─── Individual predictors ────────────────────────────────────────────────────

function predictLateStart(
  plan: ControlDailyPlan,
  reviews: DailyReview[],
  nowMins: number,
): DriftPrediction | null {
  if (reviews.length === 0) return null;

  const last5 = lastN(reviews, 5);
  const avoidanceReviews = takeawayCount(last5, 'avoidance_pattern')
    + driftTypeCount(last5, 'avoidance');
  const avoidanceSignal = avoidanceReviews >= 2;

  const first = firstActionable(plan);
  const alreadyPast = first !== null && nowMins > minsOf(first.startTime) + 10;
  const timeSignal = alreadyPast && first !== null && !first.completed;

  if (!avoidanceSignal && !timeSignal) return null;

  const confidence: DriftPrediction['confidence'] =
    (avoidanceSignal && avoidanceReviews >= 3) || (avoidanceSignal && timeSignal) ? 'high' :
    avoidanceSignal ? 'medium' :
    'low';

  return {
    riskType:   'likely_late_start',
    confidence,
    headline:   'Risk of late start',
    rationale:  avoidanceSignal
      ? `Avoidance pattern in ${avoidanceReviews} of last ${last5.length} reviews`
      : `First task started ${Math.floor(nowMins - minsOf(first!.startTime))} min ago with no completion`,
    actionHint: 'Start with just the first 20 minutes — not the whole block.',
  };
}

function predictAvoidance(
  plan: ControlDailyPlan,
  reviews: DailyReview[],
): DriftPrediction | null {
  if (reviews.length === 0) return null;

  const last5 = lastN(reviews, 5);
  const avoidanceSignals = takeawayCount(last5, 'avoidance_pattern')
    + driftTypeCount(last5, 'avoidance');

  const first = firstActionable(plan);
  const firstIsLong = first !== null && itemDurationMins(first) > 75;

  if (avoidanceSignals === 0 && !firstIsLong) return null;

  const confidence: DriftPrediction['confidence'] =
    avoidanceSignals >= 3 || (avoidanceSignals >= 2 && firstIsLong) ? 'high' :
    avoidanceSignals >= 2 || firstIsLong ? 'medium' :
    'low';

  return {
    riskType:   'likely_avoidance',
    confidence,
    headline:   'Avoidance likely today',
    rationale: firstIsLong && avoidanceSignals >= 1
      ? `First task is ${itemDurationMins(first!)}m long + avoidance pattern in ${avoidanceSignals}/${last5.length} recent days`
      : firstIsLong
        ? `First task is ${itemDurationMins(first!)} min — large blocks increase avoidance risk`
        : `Avoidance pattern seen in ${avoidanceSignals} of last ${last5.length} reviews`,
    actionHint: firstIsLong
      ? 'Break the first block into a 25-min start — commit to beginning, not finishing.'
      : 'Complete one quick win before the main session.',
  };
}

function predictOverload(
  plan: ControlDailyPlan,
  reviews: DailyReview[],
  hints: AdaptationHints,
): DriftPrediction | null {
  const last3 = lastN(reviews, 3);
  const last5 = lastN(reviews, 5);
  const recentOverload = takeawayCount(last3, 'overload_pattern');
  const driftOverload  = driftTypeCount(last5, 'overload');

  const actionable = plan.plan.items.filter(
    (i) => i.type === 'goal' || i.type === 'skill',
  );
  const taskCount = actionable.length;
  const isDense   = taskCount >= 6 && hints.capMultiplier >= 0.75;

  if (recentOverload === 0 && driftOverload === 0 && !isDense) return null;

  const confidence: DriftPrediction['confidence'] =
    recentOverload >= 2 ? 'high' :
    recentOverload >= 1 || (isDense && driftOverload >= 1) ? 'medium' :
    'low';

  return {
    riskType:   'likely_overload',
    confidence,
    headline:   'High overload risk today',
    rationale:  recentOverload >= 1
      ? `Overload pattern in ${recentOverload} of last 3 reviews (${taskCount} tasks today)`
      : isDense
        ? `${taskCount} tasks at ${Math.round(hints.capMultiplier * 100)}% capacity — plan is dense`
        : `Overload drift in ${driftOverload} of last 5 days`,
    actionHint: 'Protect your first block. Do not add tasks before the critical one is done.',
  };
}

function predictDistraction(reviews: DailyReview[]): DriftPrediction | null {
  if (reviews.length === 0) return null;

  const last5             = lastN(reviews, 5);
  const distractionTakeaway = takeawayCount(last5, 'distraction_heavy');
  const distractionDrift    = driftTypeCount(last5, 'distraction');
  const totalSignals        = distractionTakeaway + distractionDrift;

  if (totalSignals === 0) return null;

  const confidence: DriftPrediction['confidence'] =
    totalSignals >= 4 ? 'high' :
    totalSignals >= 2 ? 'medium' :
    'low';

  return {
    riskType:   'likely_distraction',
    confidence,
    headline:   'Distraction risk today',
    rationale:  `Distraction pattern in ${totalSignals} of last ${last5.length} days`,
    actionHint: 'Protect the first 90 minutes. Close non-essential tabs before starting.',
  };
}

function predictFragmentation(
  plan: ControlDailyPlan,
  reviews: DailyReview[],
): DriftPrediction | null {
  const last5        = lastN(reviews, 5);
  const recoveryDays = last5.filter((r) => r.recoveryUsed).length;

  const actionable   = plan.plan.items.filter((i) => i.type === 'goal' || i.type === 'skill');
  const shortItems   = actionable.filter((i) => itemDurationMins(i) < 30).length;
  const mostlyShort  = actionable.length > 0 && shortItems / actionable.length >= 0.5;

  if (recoveryDays < 2 && !mostlyShort) return null;

  const confidence: DriftPrediction['confidence'] =
    recoveryDays >= 4 ? 'high' :
    recoveryDays >= 3 || (mostlyShort && recoveryDays >= 2) ? 'medium' :
    'low';

  return {
    riskType:   'likely_fragmentation',
    confidence,
    headline:   'Day may fragment',
    rationale:  mostlyShort && recoveryDays >= 1
      ? `${shortItems}/${actionable.length} tasks are <30 min + recovery used ${recoveryDays}/${last5.length} recent days`
      : recoveryDays >= 2
        ? `Recovery used in ${recoveryDays} of last ${last5.length} days — fragmentation pattern`
        : `Most tasks are under 30 min — high context-switching risk`,
    actionHint: 'Group small tasks into a single time block to reduce context switches.',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns all active drift predictions for today, sorted by confidence (high first).
 *
 * @param plan     Today's ControlDailyPlan.
 * @param reviews  DailyReviews from store (last 30 days).
 * @param hints    AdaptationHints derived from review history.
 * @param nowMins  Current time in minutes since midnight.
 */
export function predictDrift(
  plan: ControlDailyPlan,
  reviews: DailyReview[],
  hints: AdaptationHints,
  nowMins: number,
): DriftPrediction[] {
  const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

  return [
    predictLateStart(plan, reviews, nowMins),
    predictAvoidance(plan, reviews),
    predictOverload(plan, reviews, hints),
    predictDistraction(reviews),
    predictFragmentation(plan, reviews),
  ]
    .filter((p): p is DriftPrediction => p !== null)
    .sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]);
}

/**
 * Ranks recovery modes using past effectiveness + predicted risk type.
 *
 * Replaces the old preference-only ranking in tickBehavior.
 * Deterministic: same inputs always produce the same ranking.
 *
 * Score computation:
 *   base = past effectiveness (0–1), or 0.5 if < 2 uses (not enough data)
 *   boost = added when the mode aligns with the top predicted risk
 *
 * @param modes          Available recovery modes for today's drift event.
 * @param stats          Recovery stats derived from past reviews.
 * @param topPrediction  Top predicted risk (or null if no predictions).
 */
export function rankRecoveryModes(
  modes: RecoveryMode[],
  stats: RecoveryStats,
  topPrediction: DriftPrediction | null,
): RecoveryMode[] {
  const scores = modes.map((mode) => {
    const modeData = stats.rankedModes.find((m) => m.mode === mode);
    // Require ≥ 2 uses before trusting effectiveness score
    const base = modeData && modeData.uses >= 2 ? modeData.score : 0.5;

    let boost = 0;
    if (topPrediction) {
      const risk = topPrediction.riskType;
      if (risk === 'likely_overload' || risk === 'likely_fragmentation') {
        if (mode === 'save_day' || mode === 'compress_day') boost = 0.35;
      } else if (risk === 'likely_avoidance' || risk === 'likely_late_start') {
        if (mode === 'critical_only') boost = 0.30;
        if (mode === 'resume_now')    boost = 0.15;
      } else if (risk === 'likely_distraction') {
        if (mode === 'compress_day' || mode === 'critical_only') boost = 0.20;
      }
    }

    return { mode, score: base + boost };
  });

  return scores.sort((a, b) => b.score - a.score).map((s) => s.mode);
}
