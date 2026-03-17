/**
 * enforcementEngine.ts — Real-time enforcement layer.
 *
 * Extends the behavior engine with time-aware urgency signals:
 *   - Urgency levels for must-do items (none / soon / urgent / overdue)
 *   - Replan detection when a must-do window closes without completion
 *   - Behavioral nudge generation (separate from schedule-based nudges)
 *
 * Pure computation — no side effects, no timers.
 * Called once per minute by the enforcement tick in store + layout.
 */

import type {
  PlanItem,
  ControlDailyPlan,
  DailyDecision,
  NudgeItem,
  PlanItemType,
} from '../types';
import { timeToMins, minsToTime } from './planGenerator';

// ─── Urgency levels ───────────────────────────────────────────────────────────

export type UrgencyLevel = 'none' | 'soon' | 'urgent' | 'overdue';

/**
 * How many minutes ahead counts as "starting soon".
 * Soft: shows a gentle prompt, not an alarm.
 */
const SOON_WINDOW_MINS = 30;

/**
 * Returns the urgency level for a plan item at the given clock position.
 *
 *   'soon'    — starts within SOON_WINDOW_MINS (not yet time, but coming up)
 *   'urgent'  — window is open (now ≥ startTime) but not yet closed
 *   'overdue' — window has closed (now > endTime), item not completed
 *   'none'    — comfortably in the future, or already completed
 */
export function getUrgencyLevel(item: PlanItem, nowMins: number): UrgencyLevel {
  if (item.completed) return 'none';
  const start = timeToMins(item.startTime);
  const end   = timeToMins(item.endTime);
  if (nowMins > end)                       return 'overdue';
  if (nowMins >= start)                    return 'urgent';
  if (start - nowMins <= SOON_WINDOW_MINS) return 'soon';
  return 'none';
}

/**
 * Returns a short, supportive urgency hint for display under a must-do item.
 * Tone is always informative, never punishing.
 */
export function getUrgencyHint(item: PlanItem, nowMins: number): string {
  const level = getUrgencyLevel(item, nowMins);
  const start = timeToMins(item.startTime);
  const end   = timeToMins(item.endTime);

  switch (level) {
    case 'soon': {
      const minsUntil = start - nowMins;
      return minsUntil <= 10
        ? `Starting in ${minsUntil}m — get ready`
        : `Start by ${item.startTime}`;
    }
    case 'urgent': {
      const overdueBy = nowMins - start;
      return overdueBy <= 5 ? 'Start now' : `${overdueBy}m late — start now`;
    }
    case 'overdue': {
      const missedBy = nowMins - end;
      return `Window closed ${missedBy}m ago — reschedule?`;
    }
    default:
      return `Scheduled ${item.startTime}–${item.endTime}`;
  }
}

// ─── Replan detection ─────────────────────────────────────────────────────────

/**
 * Returns the first must-do PlanItem whose scheduled window has closed
 * without completion. When this returns a value, offer a replan.
 */
export function getOverdueMustDo(
  mustDoTitles: string[],
  controlPlan: ControlDailyPlan | null,
  nowMins: number,
): PlanItem | null {
  if (!controlPlan || mustDoTitles.length === 0) return null;

  const actionTypes: PlanItemType[] = ['goal', 'skill'];
  for (const title of mustDoTitles) {
    const item = controlPlan.plan.items.find(
      (i) => i.title === title && actionTypes.includes(i.type) && !i.completed,
    );
    if (item && getUrgencyLevel(item, nowMins) === 'overdue') return item;
  }
  return null;
}

// ─── Behavioral nudge builder ─────────────────────────────────────────────────

/**
 * Produces the single most important behavioral nudge for the current minute.
 *
 * Priority:
 *   1. Must-do item that just entered its window (urgent, not yet fired)
 *   2. Drift ≥ 60 — recovery check-in (once, afternoon 14:00–21:00)
 *   3. Critical carryover task — morning reminder (once, 09:00–12:00)
 *
 * firedIds — set of nudge IDs already shown today.
 *            Prevents repeat-firing on every tick.
 *
 * Returns null when no nudge is warranted.
 */
export function buildBehavioralNudge(
  decision: DailyDecision | null,
  controlPlan: ControlDailyPlan | null,
  nowMins: number,
  firedIds: Set<string>,
): NudgeItem | null {
  if (!decision || !controlPlan) return null;

  const actionTypes: PlanItemType[] = ['goal', 'skill'];

  // ── 1. Must-do item just entered its window ──────────────────────────────
  for (const title of decision.mustDoItems) {
    const item = controlPlan.plan.items.find(
      (i) => i.title === title && actionTypes.includes(i.type) && !i.completed,
    );
    if (!item) continue;
    if (getUrgencyLevel(item, nowMins) !== 'urgent') continue;

    const nudgeId = `enforce-mustdo-${item.id}`;
    if (firedIds.has(nudgeId)) continue;

    return {
      id:          nudgeId,
      itemId:      item.id,
      itemTitle:   item.title,
      triggerTime: item.startTime,
      type:        'start',
    };
  }

  // ── 2. Drift recovery check-in (once, 14:00–21:00) ───────────────────────
  if (decision.driftScore >= 60 && nowMins >= 14 * 60 && nowMins <= 21 * 60) {
    const nudgeId = `enforce-drift-${decision.date}`;
    if (!firedIds.has(nudgeId)) {
      return {
        id:          nudgeId,
        itemId:      'drift',
        itemTitle:   decision.recoveryMessage ?? 'You have unfinished work from previous days.',
        triggerTime: minsToTime(nowMins),
        type:        'checkin',
      };
    }
  }

  // ── 3. Critical carryover reminder (once, 09:00–12:00) ───────────────────
  const criticalMissed = decision.missedCarryover.find((t) => t.isCritical);
  if (criticalMissed && nowMins >= 9 * 60 && nowMins <= 12 * 60) {
    const nudgeId = `enforce-critical-${criticalMissed.id}`;
    if (!firedIds.has(nudgeId)) {
      return {
        id:          nudgeId,
        itemId:      criticalMissed.id,
        itemTitle:   `Carried over: ${criticalMissed.title}`,
        triggerTime: minsToTime(nowMins),
        type:        'missed',
      };
    }
  }

  return null;
}
