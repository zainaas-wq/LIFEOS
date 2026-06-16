/**
 * LifeOS Smart Nudge Engine
 *
 * Generates context-aware nudges that explain WHY now is the right moment.
 *
 * Old:  "Study Java at 8 PM."
 * New:  "45 min free · peak energy · Java exam in 3 days.
 *        Best action: Study Java Threads."
 *
 * Reads: plan items (free-window detection), goals (deadline urgency),
 *        user profile (energy style → peak hours), distraction count.
 */

import type { Goal, PlanItem, NudgeItem, NudgeUrgency, EnergyStyle, UserProfile } from '../types';
import { timeToMins, minsToTime } from './planGenerator';
import { computeNextBestAction } from '../control/controlEngine';
import { generateId } from '../lib/utils';

// ─── Peak-energy window per style ────────────────────────────────────────────

const PEAK_WINDOWS: Record<EnergyStyle, [number, number][]> = {
  morning:   [[360, 720]],           // 06:00–12:00
  afternoon: [[720, 1020]],          // 12:00–17:00
  evening:   [[1020, 1260]],         // 17:00–21:00
  night:     [[1260, 1440], [0, 60]],// 21:00–01:00
  flexible:  [[360, 1320]],          // 06:00–22:00 (always on)
};

export function isAtPeakEnergy(energyStyle: EnergyStyle | undefined, nowMins: number): boolean {
  const style = energyStyle ?? 'flexible';
  return PEAK_WINDOWS[style].some(([s, e]) => nowMins >= s && nowMins < e);
}

// ─── Free-window detection ────────────────────────────────────────────────────

/**
 * How many minutes of unscheduled time exist starting from nowMins?
 * Looks at the gap between now and the next plan item.
 * Returns 120 (2 h) when nothing is upcoming.
 */
export function detectFreeMinutes(items: PlanItem[], nowMins: number): number {
  const busyNow = items.find(
    (i) => timeToMins(i.startTime) <= nowMins && timeToMins(i.endTime) > nowMins,
  );
  if (busyNow) return 0; // user is mid-block

  const upcoming = items
    .filter((i) => timeToMins(i.startTime) > nowMins)
    .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));

  if (!upcoming.length) return 120;
  return Math.max(0, timeToMins(upcoming[0].startTime) - nowMins);
}

// ─── Deadline urgency ─────────────────────────────────────────────────────────

export interface UrgentGoalResult {
  goal: Goal;
  daysLeft: number;
  urgency: NudgeUrgency;
}

export function getMostUrgentGoal(goals: Goal[]): UrgentGoalResult | null {
  const today = Date.now();
  const candidates = goals
    .filter((g) => g.deadline)
    .map((g) => {
      const daysLeft = Math.max(
        0,
        Math.floor((new Date(g.deadline!).getTime() - today) / 86_400_000),
      );
      return { goal: g, daysLeft };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (!candidates.length) return null;
  const { goal, daysLeft } = candidates[0];

  const urgency: NudgeUrgency =
    daysLeft <= 2  ? 'critical' :
    daysLeft <= 7  ? 'high'     :
    daysLeft <= 14 ? 'medium'   : 'low';

  return { goal, daysLeft, urgency };
}

// ─── Context message builder ──────────────────────────────────────────────────

export function buildContextMessage(params: {
  freeMinutes:    number;
  isPeakEnergy:   boolean;
  urgentGoal:     UrgentGoalResult | null;
  distractionCount: number;
  itemTitle:      string;
  isRecovery:     boolean;
}): string {
  const { freeMinutes, isPeakEnergy, urgentGoal, distractionCount, itemTitle, isRecovery } = params;

  if (isRecovery) {
    const remaining = freeMinutes > 0 ? ` You still have ${freeMinutes} min available.` : '';
    return `You've been distracted ${distractionCount}× today.${remaining} Get back on track now.`;
  }

  const parts: string[] = [];

  if (freeMinutes >= 20) {
    const h = Math.floor(freeMinutes / 60);
    const m = freeMinutes % 60;
    const label = h > 0
      ? `${h}h${m > 0 ? ` ${m}min` : ''} free`
      : `${freeMinutes} min free`;
    parts.push(label);
  }

  if (isPeakEnergy) parts.push('peak energy');

  if (urgentGoal) {
    if (urgentGoal.daysLeft === 0) {
      parts.push(`${urgentGoal.goal.title} deadline TODAY`);
    } else if (urgentGoal.daysLeft === 1) {
      parts.push(`${urgentGoal.goal.title} deadline TOMORROW`);
    } else if (urgentGoal.daysLeft <= 14) {
      parts.push(`${urgentGoal.goal.title} in ${urgentGoal.daysLeft} days`);
    }
  }

  if (!parts.length) {
    return `Now is a good time to work on ${itemTitle}.`;
  }

  return parts.join(' · ') + `. Best action: ${itemTitle}.`;
}

// ─── Main: generate opportunity nudge ────────────────────────────────────────

export function generateOpportunityNudge(params: {
  planItems:       PlanItem[];
  goals:           Goal[];
  profile:         UserProfile | null;
  distractionCount: number;
  nowMins:         number;
}): NudgeItem | null {
  const { planItems, goals, profile, distractionCount, nowMins } = params;

  const nextAction = computeNextBestAction(planItems, nowMins);
  if (!nextAction) return null;

  const freeMinutes    = detectFreeMinutes(planItems, nowMins);
  const isPeakEnergy   = isAtPeakEnergy(profile?.energyStyle, nowMins);
  const urgentGoal     = getMostUrgentGoal(goals);
  const isRecovery     = distractionCount >= 3;

  // Only fire an opportunity nudge when there's a real reason
  const hasUrgentDeadline = urgentGoal ? urgentGoal.daysLeft <= 14 : false;
  const hasMeaningfulFreeTime = freeMinutes >= 20;

  if (!isRecovery && !hasUrgentDeadline && !isPeakEnergy && !hasMeaningfulFreeTime) {
    return null;
  }

  const urgency: NudgeUrgency =
    isRecovery                                         ? 'high'     :
    urgentGoal?.urgency === 'critical'                 ? 'critical' :
    urgentGoal?.urgency === 'high' && isPeakEnergy     ? 'critical' :
    urgentGoal?.urgency === 'high'                     ? 'high'     :
    isPeakEnergy && hasMeaningfulFreeTime              ? 'medium'   : 'low';

  const contextReason = buildContextMessage({
    freeMinutes,
    isPeakEnergy,
    urgentGoal,
    distractionCount,
    itemTitle: nextAction.title,
    isRecovery,
  });

  return {
    id:                generateId(),
    itemId:            nextAction.id,
    itemTitle:         nextAction.title,
    triggerTime:       minsToTime(nowMins),
    type:              isRecovery ? 'recovery' : 'opportunity',
    contextReason,
    urgency,
    freeMinutes,
    daysUntilDeadline: urgentGoal?.daysLeft,
    isRecovery,
  };
}

// ─── Build energy-aware timed nudge schedule ──────────────────────────────────

/**
 * Produces the same schedule as buildNudgeSchedule(), but skips nudges
 * for high-energy tasks during low-energy windows for the user's style.
 * Also attaches deadline context to nudges for goals with upcoming deadlines.
 */
export function buildSmartNudgeSchedule(
  items:   PlanItem[],
  goals:   Goal[],
  profile: UserProfile | null,
): NudgeItem[] {
  const nudges: NudgeItem[]  = [];
  const urgentGoal           = getMostUrgentGoal(goals);
  const energyStyle          = profile?.energyStyle;

  for (const item of items) {
    if (item.type !== 'goal' && item.type !== 'skill' && item.type !== 'event') continue;

    const startMins = timeToMins(item.startTime);
    const atPeak    = isAtPeakEnergy(energyStyle, startMins);

    // For skill/study tasks during a low-energy window, defer the nudge
    // message rather than skipping it — but flag low energy in context.
    const linkedGoal   = goals.find((g) => g.id === item.goalId);
    const daysLeft     = urgentGoal?.daysLeft;
    const hasDeadline  = !!daysLeft && daysLeft <= 14;

    const contextReason = atPeak
      ? [
          'peak energy window',
          hasDeadline ? `${urgentGoal!.goal.title} in ${daysLeft} days` : '',
        ].filter(Boolean).join(' · ')
      : hasDeadline
        ? `${urgentGoal!.goal.title} in ${daysLeft} days`
        : undefined;

    const urgency: NudgeUrgency =
      urgentGoal?.urgency === 'critical' && hasDeadline ? 'critical' :
      urgentGoal?.urgency === 'high'    && hasDeadline  ? 'high'     :
      atPeak                                            ? 'medium'   : 'low';

    // "Start" nudge at scheduled time
    nudges.push({
      id:                `nudge-start-${item.id}`,
      itemId:            item.id,
      itemTitle:         item.title,
      triggerTime:       item.startTime,
      type:              'start',
      contextReason,
      urgency,
      daysUntilDeadline: daysLeft,
    });

    // "Missed" nudge 10 min later
    const missedMins = startMins + 10;
    nudges.push({
      id:                `nudge-missed-${item.id}`,
      itemId:            item.id,
      itemTitle:         item.title,
      triggerTime:       minsToTime(missedMins),
      type:              'missed',
      contextReason:     contextReason
        ? `You haven't started yet. ${contextReason}`
        : undefined,
      urgency:           urgency === 'low' ? 'medium' : urgency,
      daysUntilDeadline: daysLeft,
    });
  }

  return nudges;
}
