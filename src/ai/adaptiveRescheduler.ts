/**
 * LifeOS Adaptive Rescheduler
 *
 * Given the current time, finds incomplete work items and redistributes them
 * into the remaining free slots of the day, respecting energy levels and
 * prioritising the isCritical item.
 */

import type { Plan, PlanItem, Goal, ScheduleEvent, Rule } from '../types';
import { extractFreeTime, subtractIntervals, timeToMins, minsToTime } from './planGenerator';
import { generateId } from '../lib/utils';
import {
  categoryEnergy,
  importanceScore,
  urgencyScore,
  sessionDuration,
  breakDuration,
  getEnergyLevel,
  type EnergyLevel,
} from './planningEngine';

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Reschedules all incomplete non-break/non-event items from `plan` that have
 * not yet started, fitting them into free slots after `currentTime`.
 *
 * @param plan          Today's current ControlDailyPlan.plan
 * @param currentTime   Current time as "HH:MM"
 * @param goals         All user goals (for energy/priority scoring)
 * @param scheduleEvents Fixed schedule events
 * @param rules         Active rules (used to derive day-end)
 * @param date          Today's date "YYYY-MM-DD"
 * @param fixedStart    Optional planning window start (minutes from midnight)
 * @param fixedEnd      Optional planning window end (minutes from midnight)
 */
export function rescheduleRemaining(
  plan: Plan,
  currentTime: string,
  goals: Goal[],
  scheduleEvents: ScheduleEvent[],
  rules: Rule[],
  date: string,
  fixedStart?: number,
  fixedEnd?: number,
): Plan {
  const currentMins = timeToMins(currentTime);
  const dow = new Date(date).getDay();

  // ── Partition items ────────────────────────────────────────────────────────

  // Keep past items (ended before now) and already-completed items
  const keptItems = plan.items.filter((item) => {
    const endMins = timeToMins(item.endTime);
    return endMins <= currentMins || item.completed;
  });

  // Collect incomplete work items that haven't started yet
  const toReschedule = plan.items.filter((item) => {
    const startMins = timeToMins(item.startTime);
    return (
      startMins >= currentMins &&
      !item.completed &&
      item.type !== 'break' &&
      item.type !== 'event'
    );
  });

  if (!toReschedule.length) return plan; // nothing to do

  // ── Find available future slots ────────────────────────────────────────────

  const allFreeSlots = extractFreeTime(scheduleEvents, rules, dow);

  // Remove time before currentTime
  const futureSlots = subtractIntervals(allFreeSlots, [{ start: 0, end: currentMins }]);

  // Remove time occupied by kept items (events, completed sessions)
  const keptBusy = keptItems
    .filter((i) => i.type !== 'break')
    .map((i) => ({ start: timeToMins(i.startTime), end: timeToMins(i.endTime) }));
  const rawAvailableSlots = subtractIntervals(futureSlots, keptBusy);

  // Clip to fixed planning window (end boundary) — mirrors planningEngine clipSlots.
  // If no fixedEnd is set, no clipping is applied (identical to previous behavior).
  const availableSlots = fixedEnd !== undefined
    ? rawAvailableSlots
        .map((s) => ({ start: s.start, end: Math.min(s.end, fixedEnd) }))
        .filter((s) => s.end > s.start)
    : rawAvailableSlots;

  // ── Score and sort items ───────────────────────────────────────────────────

  const scored = toReschedule
    .map((item) => {
      const goal = goals.find((g) => g.id === item.goalId);
      const importance = goal ? importanceScore(goal) : 5;
      const urgency = goal ? urgencyScore(goal) : 4;
      return { item, score: importance + urgency };
    })
    .sort((a, b) => {
      // Critical items always first
      if (a.item.isCritical && !b.item.isCritical) return -1;
      if (!a.item.isCritical && b.item.isCritical) return 1;
      return b.score - a.score;
    });

  // ── Fill slots ─────────────────────────────────────────────────────────────

  const rescheduled: PlanItem[] = [];
  let targetIndex = 0;
  let lastEnergy: EnergyLevel | null = null;

  for (const slot of availableSlots) {
    let cursor = slot.start;

    while (cursor + 20 <= slot.end && targetIndex < scored.length) {
      const { item } = scored[targetIndex];
      const remaining = slot.end - cursor;
      const goal = goals.find((g) => g.id === item.goalId);
      const energy = goal ? categoryEnergy(goal.category) : getEnergyLevel(cursor);

      // Skip consecutive HIGH blocks
      if (lastEnergy === 'high' && energy === 'high') {
        targetIndex++;
        continue;
      }

      const idealDuration = sessionDuration(energy);
      const originalDuration = timeToMins(item.endTime) - timeToMins(item.startTime);
      const actualDuration = Math.min(idealDuration, originalDuration, remaining);

      if (actualDuration < 20) break;

      const originalNote = item.notes ? item.notes.replace(/^Rescheduled.*?— /, '') : '';
      rescheduled.push({
        ...item,
        startTime: minsToTime(cursor),
        endTime: minsToTime(cursor + actualDuration),
        notes: `Rescheduled to ${minsToTime(cursor)}${originalNote ? ' — ' + originalNote : ''}`,
      });

      lastEnergy = energy;
      cursor += actualDuration;
      targetIndex++;

      // Insert visible break if room
      const brkLen = breakDuration(energy);
      if (cursor + brkLen <= slot.end) {
        rescheduled.push({
          id: generateId(),
          startTime: minsToTime(cursor),
          endTime: minsToTime(cursor + brkLen),
          title: 'Break',
          type: 'break',
          completed: false,
        });
        cursor += brkLen;
      }
    }

    if (targetIndex >= scored.length) break;
  }

  // ── Merge and sort ─────────────────────────────────────────────────────────

  const allItems = [...keptItems, ...rescheduled].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );

  return { ...plan, items: allItems };
}
