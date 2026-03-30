/**
 * ritualEngine.ts
 *
 * Pure helpers for Morning Launch and Night Shutdown daily rituals.
 * No store access, no React, no side effects. Safe to import in Node tests.
 *
 * Consumers:
 *   - app/(tabs)/home.tsx — computes ritual data, passes to card components
 *   - __tests__/batch7-ritual.ts
 */

import type { PlanItem, DailyReview, AdaptationHints, ControlDailyPlan } from '../types';

/** Converts "HH:MM" to total minutes since midnight. */
function timeToMins(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MorningLaunchData {
  /** First uncompleted goal/skill item sorted by startTime. */
  firstAction: PlanItem | null;
  /** Day intensity derived from task count + adaptation cap multiplier. */
  dayIntensity: 'light' | 'moderate' | 'heavy';
  /** systemTakeaway from the most recent saved review. null if no reviews. */
  yesterdayPattern: string | null;
  /** Total uncompleted actionable items (goal + skill). */
  taskCount: number;
  /** Total planned focus minutes across uncompleted actionable items. */
  totalFocusMins: number;
}

export interface NightShutdownData {
  completedCount: number;
  totalCount: number;
  /** Completion fraction 0–1. */
  completionRate: number;
  /** Actual logged focus minutes from store's focusSessions (today only). */
  focusMins: number;
  /** Whether any isCritical item was completed today. */
  criticalDone: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Derives morning launch context from today's plan + review history.
 *
 * @param plan         Today's ControlDailyPlan.
 * @param dailyReviews All daily reviews in the store (last 30 days).
 * @param hints        Adaptation hints computed from review history.
 */
export function buildMorningLaunch(
  plan: ControlDailyPlan,
  dailyReviews: DailyReview[],
  hints: AdaptationHints,
): MorningLaunchData {
  const actionable = plan.plan.items.filter(
    (i) => (i.type === 'goal' || i.type === 'skill') && !i.completed,
  );

  const firstAction = [...actionable]
    .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime))[0] ?? null;

  const taskCount = actionable.length;
  const totalFocusMins = actionable.reduce(
    (sum, i) => sum + Math.max(0, timeToMins(i.endTime) - timeToMins(i.startTime)),
    0,
  );

  const dayIntensity = deriveDayIntensity(taskCount, hints.capMultiplier);

  const yesterdayPattern =
    [...dailyReviews]
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.systemTakeaway ?? null;

  return { firstAction, dayIntensity, yesterdayPattern, taskCount, totalFocusMins };
}

/**
 * Derives night shutdown summary from today's plan + logged focus time.
 *
 * @param plan      Today's ControlDailyPlan.
 * @param focusMins Actual logged focus minutes (today's focusSessions sum).
 */
export function buildNightShutdown(
  plan: ControlDailyPlan,
  focusMins: number,
): NightShutdownData {
  const actionable = plan.plan.items.filter(
    (i) => i.type === 'goal' || i.type === 'skill',
  );
  const completedCount = actionable.filter((i) => i.completed).length;
  const totalCount     = actionable.length;
  const completionRate = totalCount > 0 ? completedCount / totalCount : 0;
  const criticalDone   = plan.plan.items.some((i) => !!i.isCritical && i.completed);

  return { completedCount, totalCount, completionRate, focusMins, criticalDone };
}

/**
 * Classifies day intensity from pending task count + adaptation cap multiplier.
 *
 * light    — few tasks OR reduced capacity (recent overload/low-execution pattern)
 * heavy    — many tasks AND full capacity
 * moderate — default middle range
 *
 * capMultiplier thresholds (from adaptationEngine defaults):
 *   ≤ 0.62 → user was recently overloaded/low — treat as light even with more tasks
 *   ≥ 0.75 → full or near-full capacity
 */
export function deriveDayIntensity(
  taskCount: number,
  capMultiplier: number,
): 'light' | 'moderate' | 'heavy' {
  if (taskCount <= 2 || capMultiplier <= 0.62) return 'light';
  if (taskCount >= 6 && capMultiplier >= 0.75)  return 'heavy';
  return 'moderate';
}

/**
 * Generates a one-line interpretation of a weekly review.
 * Used in the Weekly Review screen below the stats.
 */
export function interpretWeeklyReview(weekly: {
  avgCompletionRate: number;
  recoveryCount: number;
  dominantDriftType: string | null;
  totalFocusMinutes: number;
  dailySummaries: { date: string }[];
}): string {
  const { avgCompletionRate, recoveryCount, dominantDriftType, dailySummaries } = weekly;
  const reviewedDays = dailySummaries.length;

  if (reviewedDays === 0) return 'No reviews recorded this week yet.';

  if (avgCompletionRate >= 0.85 && recoveryCount === 0) {
    return 'Excellent week — clean execution with no recovery needed.';
  }
  if (avgCompletionRate >= 0.75) {
    return 'Strong week. Consistent execution across your tracks.';
  }
  if (recoveryCount >= 3) {
    return 'Heavy recovery usage — consider reducing daily task load next week.';
  }
  if (dominantDriftType === 'avoidance') {
    return 'Avoidance was the main pattern. Starting smaller tasks first may help.';
  }
  if (dominantDriftType === 'overload') {
    return 'Overload pattern detected. The planner will reduce load next week.';
  }
  if (dominantDriftType === 'distraction') {
    return 'Distraction was frequent. Try protecting the first 90 minutes.';
  }
  if (avgCompletionRate < 0.4) {
    return 'Difficult week. The system will adapt and start lighter next week.';
  }
  return 'Mixed week. Every day you showed up counts.';
}
