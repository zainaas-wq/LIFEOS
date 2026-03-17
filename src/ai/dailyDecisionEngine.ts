/**
 * dailyDecisionEngine.ts — Core behavior intelligence layer.
 *
 * Answers the questions a life operating system must answer every day:
 *   1. What must I do today (non-negotiable)?
 *   2. Which goals am I falling behind on?
 *   3. What did I miss that still needs attention?
 *   4. Am I drifting — and how badly?
 *   5. What counts as a successful day?
 *
 * This is a pure computation module — no side effects, no network calls.
 * It reads from store state and returns a DailyDecision snapshot.
 *
 * Called from:
 *   - useAppStore.computeDailyDecisionAction()
 *   - home.tsx on mount and on plan changes
 */

import type {
  Goal,
  FocusSession,
  MissedTask,
  GoalRiskAssessment,
  DailyDecision,
  ControlDailyPlan,
} from '../types';

// ─── Week boundary helpers ────────────────────────────────────────────────────

/**
 * Returns the ISO date string (YYYY-MM-DD) of the most recent Monday on or
 * before the given date. Used for consistent Mon–Sun week boundaries.
 */
function getMondayOfWeek(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun
  const daysFromMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysFromMonday);
  return d;
}

/** Days remaining in the Mon–Sun week, counting today as 1. */
function daysRemainingInWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  // Sunday = 0 → 1 day remaining; Monday = 1 → 7 days; Saturday = 6 → 2 days
  return day === 0 ? 1 : 8 - day;
}

// ─── Goal risk assessment ─────────────────────────────────────────────────────

/**
 * Computes weekly progress for each goal and flags those at risk of missing
 * their weekly hour target.
 *
 * At-risk criteria (either condition):
 *   a) Hours still needed per remaining day > 2.5 (unrealistic pace)
 *   b) Less than 50% complete with ≤ 2 days remaining
 */
export function computeGoalRiskAssessments(
  goals: Goal[],
  focusSessions: FocusSession[],
  dateStr: string,
): GoalRiskAssessment[] {
  const weekStart = getMondayOfWeek(dateStr);
  const today = new Date(dateStr + 'T23:59:59');
  const remaining = daysRemainingInWeek(dateStr);

  return goals.map((goal) => {
    const weeklyMins = focusSessions
      .filter((s) => {
        if (!s.goalId || s.goalId !== goal.id) return false;
        const sessionDate = new Date(s.start);
        return sessionDate >= weekStart && sessionDate <= today;
      })
      .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);

    const loggedHours = Math.round((weeklyMins / 60) * 10) / 10;
    const target = goal.weeklyHoursTarget;
    const shortfall = Math.max(0, Math.round((target - loggedHours) * 10) / 10);
    const neededPerDay = remaining > 0
      ? Math.round((shortfall / remaining) * 10) / 10
      : shortfall;

    const pctComplete = target > 0 ? loggedHours / target : 1;
    const isAtRisk =
      neededPerDay > 2.5 ||
      (pctComplete < 0.5 && remaining <= 2);

    return {
      goalId:                   goal.id,
      goalTitle:                goal.title,
      weeklyHoursTarget:        target,
      loggedHoursThisWeek:      loggedHours,
      shortfallHours:           shortfall,
      daysRemainingInWeek:      remaining,
      isAtRisk,
      hoursNeededPerRemainingDay: neededPerDay,
    };
  });
}

// ─── Archive helper (called by store when switching days) ─────────────────────

/**
 * Scans a completed day's plan for uncompleted goal/skill items and returns
 * new MissedTask records to append to the store.
 *
 * Idempotent — will not create duplicates for items already tracked.
 */
export function extractMissedTasksFromPlan(
  controlPlan: ControlDailyPlan,
  date: string,
  existingMissed: MissedTask[],
  goalTitles: Record<string, string>,  // goalId → title lookup
): MissedTask[] {
  const newMissed: MissedTask[] = [];

  for (const item of controlPlan.plan.items) {
    if (item.completed) continue;
    if (item.type !== 'goal' && item.type !== 'skill') continue;

    // Dedup: same title + same date already tracked
    const alreadyTracked = existingMissed.some(
      (m) => m.title === item.title && m.originalDate === date,
    );
    if (alreadyTracked) continue;

    newMissed.push({
      id:              `${item.id}-missed-${date}`,
      title:           item.title,
      type:            item.type,
      goalId:          item.goalId,
      goalTitle:       item.goalId ? goalTitles[item.goalId] : undefined,
      isCritical:      !!item.isCritical,
      energyRequired:  item.energyRequired,
      originalDate:    date,
      status:          'pending',
    });
  }

  return newMissed;
}

// ─── Core decision engine ─────────────────────────────────────────────────────

/**
 * Computes today's full behavioral decision snapshot.
 *
 * Drift score formula:
 *   +25 per missed critical task (capped at 50)
 *   +20 per at-risk goal (capped at 40)
 *   +10 per non-critical missed item, up to 3 items
 *   Max: 100
 */
export function computeDailyDecision(
  date: string,
  goals: Goal[],
  focusSessions: FocusSession[],
  missedTasks: MissedTask[],
  controlPlan: ControlDailyPlan | null,
): DailyDecision {
  // ── 1. Must-do items ────────────────────────────────────────────────────────
  const mustDoItems: string[] = [];
  if (controlPlan) {
    const criticalItem = controlPlan.plan.items.find(
      (i) => !!i.isCritical && !i.completed,
    );
    if (criticalItem) mustDoItems.push(criticalItem.title);

    const topWorkItems = controlPlan.plan.items
      .filter(
        (i) =>
          !i.completed &&
          (i.type === 'goal' || i.type === 'skill') &&
          !i.isCritical,
      )
      .slice(0, 2)
      .map((i) => i.title);
    mustDoItems.push(...topWorkItems);
  }

  // ── 2. Goal risk assessments ────────────────────────────────────────────────
  const allAssessments = computeGoalRiskAssessments(goals, focusSessions, date);
  const atRiskGoals = allAssessments.filter((g) => g.isAtRisk);

  // ── 3. Carryover missed tasks (pending, within last 7 days, before today) ──
  const cutoff = new Date(date + 'T00:00:00');
  cutoff.setDate(cutoff.getDate() - 7);
  const missedCarryover = missedTasks.filter(
    (t) =>
      t.status === 'pending' &&
      t.originalDate < date &&
      new Date(t.originalDate + 'T00:00:00') >= cutoff,
  );

  // ── 4. Drift score ──────────────────────────────────────────────────────────
  const criticalMissedCount = missedCarryover.filter((t) => t.isCritical).length;
  const otherMissedCount    = missedCarryover.filter((t) => !t.isCritical).length;

  const driftScore = Math.min(
    100,
    Math.min(criticalMissedCount * 25, 50) +
    Math.min(atRiskGoals.length * 20, 40) +
    Math.min(otherMissedCount, 3) * 10,
  );

  // ── 5. Recovery mode ────────────────────────────────────────────────────────
  const isInRecoveryMode = driftScore >= 40 || criticalMissedCount > 0;

  // ── 6. Recovery message ─────────────────────────────────────────────────────
  let recoveryMessage: string | undefined;
  if (isInRecoveryMode) {
    if (criticalMissedCount > 0) {
      recoveryMessage = `${criticalMissedCount} critical item${criticalMissedCount > 1 ? 's' : ''} from previous days still need your attention.`;
    } else if (atRiskGoals.length > 0) {
      recoveryMessage = `${atRiskGoals.length} goal${atRiskGoals.length > 1 ? 's are' : ' is'} falling behind the weekly target.`;
    } else {
      recoveryMessage = 'Several tasks from previous days remain unfinished.';
    }
  }

  // ── 7. Minimum viable day ───────────────────────────────────────────────────
  let minimumViableDay: string;
  if (!controlPlan) {
    minimumViableDay = 'Generate a plan to define your successful day.';
  } else if (mustDoItems.length > 0) {
    const topItem = mustDoItems[0];
    minimumViableDay = `Complete "${topItem}"${mustDoItems.length > 1 ? ` + ${mustDoItems.length - 1} more` : ''}.`;
  } else {
    minimumViableDay = 'Complete your goal sessions and check in with your rules.';
  }

  return {
    date,
    mustDoItems,
    atRiskGoals,
    missedCarryover,
    minimumViableDay,
    driftScore,
    isInRecoveryMode,
    recoveryMessage,
    generatedAt: new Date().toISOString(),
  };
}
