/**
 * LifeOS Smart Planning Engine
 *
 * Energy-aware daily/weekly planner with:
 * - Energy window matching (high/medium/low)
 * - Fatigue prevention (no two consecutive HIGH blocks)
 * - Automatic break insertion
 * - Critical item selection by urgency × importance
 * - End-of-day reflection block
 * - Per-item scheduling notes
 * - Rest block after long university/fixed events
 */

import type {
  Goal,
  SkillPlan,
  Rule,
  ScheduleEvent,
  Plan,
  PlanItem,
  PlanItemType,
  EnergyStyle,
  AdaptationHints,
} from '../types';
import {
  extractFreeTime,
  timeToMins,
  minsToTime,
  subtractIntervals,
  type TimeInterval,
} from './planGenerator';
import { generateId } from '../lib/utils';

// ─── Fixed-window helpers ─────────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Parse fixedScheduleStart / fixedScheduleEnd strings into minute offsets.
 * Returns empty object (no clipping) if either value is absent, invalid, or inverted.
 */
export function parseFixedWindow(
  start?: string,
  end?: string,
): { fixedStart?: number; fixedEnd?: number } {
  if (!start || !end || !TIME_RE.test(start) || !TIME_RE.test(end)) return {};
  const s = timeToMins(start);
  const e = timeToMins(end);
  if (s >= e) return {};
  return { fixedStart: s, fixedEnd: e };
}

/** Clip free slots to [fixedStart, fixedEnd] if provided. */
function clipSlots(
  slots: TimeInterval[],
  fixedStart?: number,
  fixedEnd?: number,
): TimeInterval[] {
  if (fixedEnd === undefined) return slots;
  return slots
    .map(s => ({ start: s.start, end: Math.min(s.end, fixedEnd) }))
    .filter(s => s.end > s.start);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type EnergyLevel = 'high' | 'medium' | 'low';

interface SmartTarget {
  id: string;
  title: string;
  category: Goal['category'];
  priority: number;
  remainingMins: number;
  type: PlanItemType;
  goalId: string;
  skillPlanId?: string;
  urgency: number;
  importance: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Energy level for a given start time, shifted by the user's energyStyle.
 * Defaults to morning peak (legacy behavior) when energyStyle is absent.
 */
export function getEnergyLevel(startMins: number, energyStyle?: EnergyStyle): EnergyLevel {
  switch (energyStyle) {
    case 'afternoon':
      if (startMins >= 12 * 60 && startMins < 17 * 60) return 'high';
      if (startMins >= 9  * 60 && startMins < 12 * 60) return 'medium';
      if (startMins >= 17 * 60 && startMins < 20 * 60) return 'medium';
      return 'low';
    case 'evening':
      if (startMins >= 17 * 60 && startMins < 21 * 60) return 'high';
      if (startMins >= 14 * 60 && startMins < 17 * 60) return 'medium';
      if (startMins >= 21 * 60)                        return 'medium';
      return 'low';
    case 'night':
      if (startMins >= 21 * 60)                        return 'high';
      if (startMins >= 17 * 60)                        return 'medium';
      if (startMins >= 12 * 60)                        return 'medium';
      return 'low';
    case 'morning':
    case 'flexible':
    default:
      if (startMins < 12 * 60) return 'high';   // 06:00–12:00
      if (startMins < 17 * 60) return 'medium'; // 12:00–17:00
      return 'low';
  }
}

/** Preferred energy for each goal category. */
export function categoryEnergy(category: Goal['category']): EnergyLevel {
  if (category === 'study' || category === 'skill') return 'high';
  if (category === 'health' || category === 'career') return 'medium';
  return 'low'; // life
}

/** Ideal session duration in minutes per energy level. */
export function sessionDuration(energy: EnergyLevel): number {
  switch (energy) {
    case 'high':   return 60;
    case 'medium': return 45;
    case 'low':    return 25;
  }
}

/** Break duration in minutes after a session. */
export function breakDuration(energy: EnergyLevel): number {
  switch (energy) {
    case 'high':   return 15;
    case 'medium': return 10;
    case 'low':    return 5;
  }
}

/** Urgency score (1–10) based on deadline proximity. No deadline → 4 (neutral). */
export function urgencyScore(goal: Goal): number {
  if (!goal.deadline) return 4;
  const today    = new Date();
  const deadline = new Date(goal.deadline);
  const daysLeft = Math.max(0, Math.floor((deadline.getTime() - today.getTime()) / 86400000));
  if (daysLeft < 14) return 10;
  if (daysLeft < 30) return 7;
  if (daysLeft < 60) return 5;
  return 4;
}

/** Importance score (1–9). Priority 1 → importance 9. */
export function importanceScore(goal: Goal): number {
  return Math.max(1, 10 - goal.priority);
}

function buildNotes(
  target: SmartTarget,
  startMins: number,
  energy: EnergyLevel,
  isCritical: boolean,
): string {
  const timeOfDay =
    startMins < 12 * 60 ? 'morning' :
    startMins < 17 * 60 ? 'afternoon' : 'evening';
  const energyDesc =
    energy === 'high'   ? 'peak focus window' :
    energy === 'medium' ? 'steady work period' : 'lighter work period';

  let note = `Placed in ${timeOfDay} ${energyDesc}`;
  if (isCritical) note += ' — your highest-priority task today';
  if (target.importance >= 7) note += `. ${target.category} goal (importance ${target.importance}/9)`;
  return note;
}

function goalsToSmartTargets(goals: Goal[], skillPlans: SkillPlan[]): SmartTarget[] {
  return goals
    .filter((g) => g.weeklyHoursTarget > 0)
    .map((g) => {
      const sp = skillPlans.find((s) => s.id === g.linkedSkillPlanId);
      const dailyMins = Math.round((g.weeklyHoursTarget * 60) / 5);
      return {
        id: g.id,
        title: sp ? sp.title : g.title,
        category: g.category,
        priority: g.priority,
        remainingMins: dailyMins,
        type: (g.category === 'study' ? 'skill' : 'goal') as PlanItemType,
        goalId: g.id,
        skillPlanId: sp?.id,
        urgency: urgencyScore(g),
        importance: importanceScore(g),
      };
    })
    .sort((a, b) => a.priority - b.priority);
}

function hasCriticalBeenPlaced(items: PlanItem[]): boolean {
  return items.some((i) => i.isCritical);
}

/**
 * Pick the best target for the current time slot.
 * Respects: energy matching, no consecutive HIGH blocks, light-only for short slots.
 */
function pickTarget(
  targets: SmartTarget[],
  slotEnergy: EnergyLevel,
  lastEnergy: EnergyLevel | null,
  remainingSlotMins: number,
): SmartTarget | null {
  const available = targets.filter((t) => t.remainingMins >= 20);
  if (!available.length) return null;

  const excludeHigh = lastEnergy === 'high';
  const lightOnly = remainingSlotMins < 30;

  // Try preferred energy first, then fall back
  const energyOrder: EnergyLevel[] =
    slotEnergy === 'high'   ? ['high', 'medium', 'low'] :
    slotEnergy === 'medium' ? ['medium', 'low', 'high'] :
                              ['low', 'medium', 'high'];

  for (const e of energyOrder) {
    if (excludeHigh && e === 'high') continue;
    const match = available.find((t) => {
      const tEnergy = categoryEnergy(t.category);
      if (lightOnly && tEnergy === 'high') return false;
      return tEnergy === e;
    });
    if (match) return match;
  }

  // Fallback: any available (skip high if excluded)
  if (!excludeHigh) return available[0] ?? null;
  return available.find((t) => categoryEnergy(t.category) !== 'high') ?? null;
}

// ─── Daily plan ───────────────────────────────────────────────────────────────

/**
 * Generates an energy-aware daily plan.
 * Drop-in replacement for generateDailyPlanItems.
 */
export function generateSmartDailyPlan(
  goals: Goal[],
  scheduleEvents: ScheduleEvent[],
  skillPlans: SkillPlan[],
  rules: Rule[],
  date: string, // YYYY-MM-DD
  fixedStart?: number,                     // minutes from midnight — planning window start
  fixedEnd?: number,                       // minutes from midnight — planning window end
  energyStyle?: EnergyStyle,              // user's peak energy preference
  additionalBusyIntervals?: TimeInterval[], // constraint blocks already locked; excluded from free time
  hints?: AdaptationHints,               // review-derived adaptation hints
): Plan {
  if (!goals.length) {
    return {
      id: generateId(),
      type: 'daily',
      dateRange: { start: date, end: date },
      items: [],
      generatedAt: new Date().toISOString(),
      source: 'local',
    };
  }

  const dow = new Date(date).getDay();
  const rawFreeSlots = clipSlots(
    extractFreeTime(scheduleEvents, rules, dow, fixedStart ?? 8 * 60),
    fixedStart,
    fixedEnd,
  );
  // Subtract locked constraint windows so goals are never placed over them
  const freeSlots = additionalBusyIntervals?.length
    ? subtractIntervals(rawFreeSlots, additionalBusyIntervals)
    : rawFreeSlots;
  const items: PlanItem[] = [];

  // Add fixed events
  const dayEvents = scheduleEvents.filter((e) => e.daysOfWeek.includes(dow));
  for (const ev of dayEvents) {
    items.push({
      id: generateId(),
      startTime: ev.start,
      endTime: ev.end,
      title: ev.title,
      type: 'event',
      eventId: ev.id,
      completed: false,
      notes: `Fixed ${ev.category} block`,
    });
  }

  // Determine day end and reflection slot
  const dayEndMins = freeSlots.length > 0 ? freeSlots[freeSlots.length - 1].end : 22 * 60;
  const reflectionStartMins = dayEndMins - 20;

  // Remove reflection window from free slots
  const reflectionInterval: TimeInterval = { start: reflectionStartMins, end: dayEndMins };
  const workSlots =
    reflectionStartMins > 0
      ? subtractIntervals(freeSlots, [reflectionInterval])
      : freeSlots;

  // Score goals for the one critical item (highest urgency × importance)
  const criticalGoalId =
    goals.length > 0
      ? [...goals]
          .sort((a, b) => urgencyScore(b) * importanceScore(b) - urgencyScore(a) * importanceScore(a))[0].id
      : null;

  // Build per-goal allocation targets
  const targets = goalsToSmartTargets(goals, skillPlans);

  // Adaptation: bias target order so high-energy (deep-work) items are placed first.
  // Applied when distraction_heavy pattern was detected — protects the morning focus window.
  if (hints?.preferHighEnergyFirst) {
    const energyRank = (t: SmartTarget): number =>
      categoryEnergy(t.category) === 'high' ? 0 : categoryEnergy(t.category) === 'medium' ? 1 : 2;
    targets.sort((a, b) => energyRank(a) - energyRank(b));
  }

  // ── Block 2 quality controls ───────────────────────────────────────────────
  // Per-goal session counter (max 2 sessions/day)
  const sessionCount = new Map<string, number>();
  // Daily time cap: schedule at most capMultiplier of available free minutes.
  // Default 0.8. Reduced by AdaptationHints when overload or low_execution detected.
  const totalFreeMinutes = workSlots.reduce((sum, s) => sum + (s.end - s.start), 0);
  const dailyCapMins = Math.floor(totalFreeMinutes * (hints?.capMultiplier ?? 0.8));
  let totalScheduledMins = 0;
  // ──────────────────────────────────────────────────────────────────────────

  let lastEnergy: EnergyLevel | null = null;
  // Adaptation: track whether the first goal/skill item has been placed.
  // Used to cap first-session duration for avoidance_pattern users.
  let firstWorkItemPlaced = false;

  // Detect long fixed block (≥2hrs) — triggers evening rest insertion
  const longBlock = dayEvents.find(
    (ev) => timeToMins(ev.end) - timeToMins(ev.start) >= 120,
  );
  let restBlockInserted = false;

  for (const slot of workSlots) {
    let cursor = slot.start;

    // Minimum slot guard: slots < 30 min become buffer items
    if (slot.end - slot.start < 30) {
      items.push({
        id: generateId(),
        startTime: minsToTime(slot.start),
        endTime: minsToTime(slot.end),
        title: 'Break / Buffer',
        type: 'break',
        completed: false,
        notes: 'Short window — use as buffer or rest',
      });
      continue;
    }

    // Insert recovery block before first evening session after a long fixed event
    if (!restBlockInserted && longBlock && cursor >= 17 * 60) {
      const restLen = 30;
      const restEnd = cursor + restLen;
      if (restEnd <= slot.end) {
        items.push({
          id: generateId(),
          startTime: minsToTime(cursor),
          endTime: minsToTime(restEnd),
          title: 'Rest & Recovery',
          type: 'break',
          completed: false,
          notes: `Recovery after long ${longBlock.title} — recharge before evening work`,
        });
        cursor = restEnd;
        restBlockInserted = true;
      }
    }

    while (cursor + 20 <= slot.end) {
      const remaining = slot.end - cursor;
      const currentEnergy = getEnergyLevel(cursor, energyStyle);

      // Daily cap: stop scheduling once 80 % of free time is used
      if (totalScheduledMins >= dailyCapMins) break;

      // Filter targets that are within the 2-session daily limit
      const availableTargets = targets.filter(
        (t) => (sessionCount.get(t.goalId) ?? 0) < 2,
      );

      // Urgency override: urgency ≥ 9 bypasses energy-window matching
      // (still respects the no-consecutive-HIGH fatigue rule)
      const urgentTarget = availableTargets.find(
        (t) =>
          t.remainingMins >= 20 &&
          t.urgency >= 9 &&
          !(lastEnergy === 'high' && categoryEnergy(t.category) === 'high'),
      );
      const target =
        urgentTarget ?? pickTarget(availableTargets, currentEnergy, lastEnergy, remaining);
      if (!target) break;

      const targetEnergy = categoryEnergy(target.category);
      const idealDuration = sessionDuration(targetEnergy);
      const brkLen = breakDuration(targetEnergy);

      // Fit session into remaining time, also bounded by remaining cap
      let actualDuration = Math.min(
        idealDuration,
        target.remainingMins,
        remaining,
        dailyCapMins - totalScheduledMins,
      );
      // Adaptation: cap first work session duration for avoidance_pattern users.
      // Smaller first task → lower activation energy → builds momentum.
      if (!firstWorkItemPlaced && hints?.firstSessionCapMins != null) {
        actualDuration = Math.min(actualDuration, hints.firstSessionCapMins);
      }
      if (actualDuration < 20) break;

      const isCritical = target.goalId === criticalGoalId && !hasCriticalBeenPlaced(items);

      items.push({
        id: generateId(),
        startTime: minsToTime(cursor),
        endTime: minsToTime(cursor + actualDuration),
        title: target.title,
        type: target.type,
        goalId: target.goalId,
        skillPlanId: target.skillPlanId,
        completed: false,
        isCritical: isCritical ? true : undefined,
        energyRequired: targetEnergy,
        notes: buildNotes(target, cursor, targetEnergy, isCritical),
      });

      lastEnergy = targetEnergy;
      firstWorkItemPlaced = true;
      target.remainingMins -= actualDuration;
      sessionCount.set(target.goalId, (sessionCount.get(target.goalId) ?? 0) + 1);
      totalScheduledMins += actualDuration;
      cursor += actualDuration;

      // Insert break if there's still room for it
      if (cursor + brkLen <= slot.end) {
        items.push({
          id: generateId(),
          startTime: minsToTime(cursor),
          endTime: minsToTime(cursor + brkLen),
          title: targetEnergy === 'high' ? 'Recovery Break' : 'Short Break',
          type: 'break',
          completed: false,
          notes: `${brkLen}min reset — step away, hydrate, move`,
        });
        cursor += brkLen;
      } else {
        break;
      }
    }
  }

  // Reflection block at end of day
  if (reflectionStartMins > 0 && reflectionStartMins < dayEndMins) {
    items.push({
      id: generateId(),
      startTime: minsToTime(reflectionStartMins),
      endTime: minsToTime(dayEndMins),
      title: 'Daily Reflection',
      type: 'break',
      completed: false,
      notes: 'Review the day: wins, obstacles, one adjustment for tomorrow',
    });
  }

  items.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return {
    id: generateId(),
    type: 'daily',
    dateRange: { start: date, end: date },
    items,
    generatedAt: new Date().toISOString(),
    source: 'local',
  };
}

// ─── Weekly plan ──────────────────────────────────────────────────────────────

/**
 * Generates an energy-aware 7-day plan.
 * Drop-in replacement for generateWeeklyPlanItems.
 */
export function generateSmartWeeklyPlan(
  goals: Goal[],
  scheduleEvents: ScheduleEvent[],
  skillPlans: SkillPlan[],
  rules: Rule[],
  startDate: string,         // YYYY-MM-DD
  fixedStart?: number,       // minutes from midnight — planning window start
  fixedEnd?: number,         // minutes from midnight — planning window end
  energyStyle?: EnergyStyle, // user's peak energy preference
): Plan {
  if (!goals.length) {
    return {
      id: generateId(),
      type: 'weekly',
      dateRange: { start: startDate, end: startDate },
      items: [],
      generatedAt: new Date().toISOString(),
      source: 'local',
    };
  }

  // Weekly targets: 5× daily
  const targets = goalsToSmartTargets(goals, skillPlans).map((t) => ({
    ...t,
    remainingMins: t.remainingMins * 5,
  }));

  const items: PlanItem[] = [];
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    const dow = d.getDay();

    const freeSlots = clipSlots(
      extractFreeTime(scheduleEvents, rules, dow, fixedStart ?? 8 * 60),
      fixedStart,
      fixedEnd,
    );
    // Per-day session limit and daily cap (reset each day)
    const daySessionCount = new Map<string, number>();
    const dayFreeMinutes = freeSlots.reduce((sum, s) => sum + (s.end - s.start), 0);
    const dayCapMins = Math.floor(dayFreeMinutes * 0.8);
    let dayScheduledMins = 0;
    let lastEnergy: EnergyLevel | null = null;

    for (const slot of freeSlots) {
      let cursor = slot.start;

      // Minimum slot guard: slots < 30 min become buffer items
      if (slot.end - slot.start < 30) {
        items.push({
          id: generateId(),
          startTime: minsToTime(slot.start),
          endTime: minsToTime(slot.end),
          title: 'Break / Buffer',
          type: 'break',
          completed: false,
        });
        continue;
      }

      while (cursor + 20 <= slot.end) {
        const remaining = slot.end - cursor;
        const currentEnergy = getEnergyLevel(cursor, energyStyle);

        // Daily cap check
        if (dayScheduledMins >= dayCapMins) break;

        // Filter by 2-session daily limit
        const dayAvailableTargets = targets.filter(
          (t) => (daySessionCount.get(t.goalId) ?? 0) < 2,
        );

        // Urgency override
        const urgentTarget = dayAvailableTargets.find(
          (t) =>
            t.remainingMins >= 20 &&
            t.urgency >= 9 &&
            !(lastEnergy === 'high' && categoryEnergy(t.category) === 'high'),
        );
        const target =
          urgentTarget ?? pickTarget(dayAvailableTargets, currentEnergy, lastEnergy, remaining);
        if (!target) break;

        const targetEnergy = categoryEnergy(target.category);
        const idealDuration = sessionDuration(targetEnergy);
        const brkLen = breakDuration(targetEnergy);

        const actualDuration = Math.min(
          idealDuration,
          target.remainingMins,
          remaining,
          dayCapMins - dayScheduledMins,
        );
        if (actualDuration < 20) break;

        items.push({
          id: generateId(),
          startTime: minsToTime(cursor),
          endTime: minsToTime(cursor + actualDuration),
          title: target.title,
          type: target.type,
          goalId: target.goalId,
          skillPlanId: target.skillPlanId,
          completed: false,
          energyRequired: targetEnergy,
          notes: buildNotes(target, cursor, targetEnergy, false),
        });

        lastEnergy = targetEnergy;
        target.remainingMins -= actualDuration;
        daySessionCount.set(target.goalId, (daySessionCount.get(target.goalId) ?? 0) + 1);
        dayScheduledMins += actualDuration;
        cursor += actualDuration;

        if (cursor + brkLen <= slot.end) {
          items.push({
            id: generateId(),
            startTime: minsToTime(cursor),
            endTime: minsToTime(cursor + brkLen),
            title: 'Break',
            type: 'break',
            completed: false,
          });
          cursor += brkLen;
        } else {
          break;
        }
      }
    }
  }

  return {
    id: generateId(),
    type: 'weekly',
    dateRange: { start: startDate, end: end.toISOString().split('T')[0] },
    items,
    generatedAt: new Date().toISOString(),
    source: 'local',
  };
}
