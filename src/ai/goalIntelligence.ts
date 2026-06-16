/**
 * LifeOS Goal Intelligence Engine
 *
 * Answers: "How likely is this goal to succeed?" and "What's putting it at risk?"
 *
 * Probability formula (clamped 5–95):
 *   Base 50
 *   + momentum   (focus sessions this week)
 *   + coverage   (goal in today's plan)
 *   - inactivity (days since last session)
 *   - deadline   (urgency penalty near due date)
 *
 * Risk levels:
 *   critical  — probability < 25 OR deadline ≤ 3 days
 *   stalled   — no activity in 14+ days
 *   at-risk   — probability < 50 OR deadline ≤ 14 days with probability < 65
 *   on-track  — everything else
 */

import type { Goal, FocusSession, PlanItem, GoalIntelligence, GoalRiskLevel } from '../types';
import { getLocalDateStr } from '../lib/utils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(isoA: string, isoB: string): number {
  return Math.floor(
    (new Date(isoA).getTime() - new Date(isoB).getTime()) / 86_400_000,
  );
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ─── Core computation ─────────────────────────────────────────────────────────

export function computeGoalIntelligence(
  goal:         Goal,
  allSessions:  FocusSession[],
  planItems:    PlanItem[],
): GoalIntelligence {
  const now        = new Date();
  const todayISO   = now.toISOString();
  const todayStr   = getLocalDateStr(now);
  const weekAgoStr = getLocalDateStr(new Date(now.getTime() - 7  * 86_400_000));
  const twoWeeksAgoStr = getLocalDateStr(new Date(now.getTime() - 14 * 86_400_000));

  // Sessions for this goal
  const goalSessions = allSessions.filter((s) => s.goalId === goal.id);

  // Activity this week
  const sessionsThisWeek = goalSessions.filter(
    (s) => getLocalDateStr(new Date(s.start)) >= weekAgoStr,
  );
  const weeklyHoursLogged = sessionsThisWeek.reduce(
    (sum, s) => sum + (s.durationMinutes ?? 0) / 60,
    0,
  );

  // Last activity
  const lastSession = goalSessions
    .filter((s) => s.end)
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())[0];
  const lastActivityDate = lastSession?.start;
  const daysSinceActivity = lastActivityDate
    ? daysBetween(todayISO, lastActivityDate)
    : 999;

  // Plan coverage
  const inTodaysPlan = planItems.some(
    (i) => i.goalId === goal.id && (i.type === 'goal' || i.type === 'skill'),
  );

  // Deadline distance
  const daysUntilDeadline = goal.deadline
    ? daysBetween(goal.deadline + 'T23:59:59', todayISO)
    : null;

  // ── Probability formula ────────────────────────────────────────────────────

  let prob = 50;

  // Momentum bonus
  if (sessionsThisWeek.length >= 3) prob += 20;
  else if (sessionsThisWeek.length >= 1) prob += 12;

  // Meeting weekly target
  if (weeklyHoursLogged >= goal.weeklyHoursTarget * 0.8) prob += 10;
  else if (weeklyHoursLogged >= goal.weeklyHoursTarget * 0.5) prob += 5;

  // Plan coverage
  if (inTodaysPlan) prob += 8;

  // No deadline pressure bonus
  if (!goal.deadline) prob += 5;

  // Inactivity penalties
  if (daysSinceActivity >= 14) prob -= 30;
  else if (daysSinceActivity >= 7)  prob -= 18;
  else if (daysSinceActivity >= 3)  prob -= 8;

  // Deadline proximity penalties
  if (daysUntilDeadline !== null) {
    if (daysUntilDeadline <= 0)  prob -= 40;
    else if (daysUntilDeadline <= 3)  prob -= 20;
    else if (daysUntilDeadline <= 7)  prob -= 12;
    else if (daysUntilDeadline <= 14) prob -= 6;
  }

  prob = clamp(prob, 5, 95);

  // ── Risk level ─────────────────────────────────────────────────────────────

  let riskLevel: GoalRiskLevel;
  let riskReason: string;

  const isStalled = daysSinceActivity >= 14 && goalSessions.length > 0;
  const neverStarted = goalSessions.length === 0;

  if (daysUntilDeadline !== null && daysUntilDeadline <= 3) {
    riskLevel = 'critical';
    riskReason = daysUntilDeadline <= 0
      ? 'Deadline has passed'
      : `Deadline in ${daysUntilDeadline} day${daysUntilDeadline === 1 ? '' : 's'}`;
  } else if (prob < 25) {
    riskLevel = 'critical';
    riskReason = neverStarted
      ? 'No sessions started yet'
      : `Low momentum — only ${weeklyHoursLogged.toFixed(1)}h logged this week`;
  } else if (isStalled) {
    riskLevel = 'stalled';
    riskReason = `No activity in ${daysSinceActivity} days`;
  } else if (neverStarted) {
    riskLevel = 'at-risk';
    riskReason = 'No focus sessions started yet';
  } else if (prob < 50) {
    riskLevel = 'at-risk';
    riskReason = weeklyHoursLogged < goal.weeklyHoursTarget * 0.5
      ? `Behind weekly target (${weeklyHoursLogged.toFixed(1)}h / ${goal.weeklyHoursTarget}h)`
      : `Low probability of success`;
  } else if (daysUntilDeadline !== null && daysUntilDeadline <= 14 && prob < 65) {
    riskLevel = 'at-risk';
    riskReason = `Deadline in ${daysUntilDeadline} days — needs more sessions`;
  } else {
    riskLevel = 'on-track';
    riskReason = sessionsThisWeek.length > 0
      ? `${sessionsThisWeek.length} session${sessionsThisWeek.length > 1 ? 's' : ''} this week`
      : 'No deadline pressure';
  }

  return {
    probability: Math.round(prob),
    riskLevel,
    riskReason,
    lastActivityDate,
    weeklyHoursLogged: Math.round(weeklyHoursLogged * 10) / 10,
    inTodaysPlan,
    computedAt: todayISO,
  };
}

// ─── Batch analyzer ───────────────────────────────────────────────────────────

export function analyzeAllGoals(
  goals:      Goal[],
  sessions:   FocusSession[],
  planItems:  PlanItem[],
): Record<string, GoalIntelligence> {
  const result: Record<string, GoalIntelligence> = {};
  for (const goal of goals) {
    result[goal.id] = computeGoalIntelligence(goal, sessions, planItems);
  }
  return result;
}

// ─── Pick most urgent goal to surface on home screen ─────────────────────────

export function getMostAtRiskGoal(
  goals: Goal[],
  intelligence: Record<string, GoalIntelligence>,
): { goal: Goal; intel: GoalIntelligence } | null {
  const RISK_ORDER: GoalRiskLevel[] = ['critical', 'stalled', 'at-risk', 'on-track'];

  const ranked = goals
    .filter((g) => intelligence[g.id])
    .sort((a, b) => {
      const ia = intelligence[a.id];
      const ib = intelligence[b.id];
      const ra = RISK_ORDER.indexOf(ia.riskLevel);
      const rb = RISK_ORDER.indexOf(ib.riskLevel);
      if (ra !== rb) return ra - rb;
      return ia.probability - ib.probability; // lower probability first
    });

  if (!ranked.length) return null;
  const top = ranked[0];
  const intel = intelligence[top.id];

  // Only surface if actually at risk
  if (intel.riskLevel === 'on-track') return null;

  return { goal: top, intel };
}
