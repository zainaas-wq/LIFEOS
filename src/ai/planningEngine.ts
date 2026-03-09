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
} from '../types';
import {
  extractFreeTime,
  timeToMins,
  minsToTime,
  subtractIntervals,
  type TimeInterval,
} from './planGenerator';

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

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Energy level for a given start time (minutes from midnight). */
export function getEnergyLevel(startMins: number): EnergyLevel {
  if (startMins < 12 * 60) return 'high';   // 06:00–12:00
  if (startMins < 17 * 60) return 'medium'; // 12:00–17:00
  return 'low';                              // 17:00–22:00
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

/** Urgency score (1–10) based on deadline proximity. */
export function urgencyScore(goal: Goal): number {
  let score = 4; // default: no deadline
  if (goal.deadline) {
    const today = new Date();
    const deadline = new Date(goal.deadline);
    const daysLeft = Math.max(0, Math.floor((deadline.getTime() - today.getTime()) / 86400000));
    if (daysLeft < 14) score = 10;
    else if (daysLeft < 30) score = 7;
    else if (daysLeft < 60) score = 5;
    else score = 4;
  }
  // Assume slightly behind weekly target → +2
  return Math.min(score + 2, 10);
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
): Plan {
  if (!goals.length) {
    return {
      id: uid(),
      type: 'daily',
      dateRange: { start: date, end: date },
      items: [],
      generatedAt: new Date().toISOString(),
      source: 'local',
    };
  }

  const dow = new Date(date).getDay();
  const freeSlots = extractFreeTime(scheduleEvents, rules, dow);
  const items: PlanItem[] = [];

  // Add fixed events
  const dayEvents = scheduleEvents.filter((e) => e.daysOfWeek.includes(dow));
  for (const ev of dayEvents) {
    items.push({
      id: uid(),
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

  let lastEnergy: EnergyLevel | null = null;

  // Detect long fixed block (≥2hrs) — triggers evening rest insertion
  const longBlock = dayEvents.find(
    (ev) => timeToMins(ev.end) - timeToMins(ev.start) >= 120,
  );
  let restBlockInserted = false;

  for (const slot of workSlots) {
    let cursor = slot.start;

    // Insert recovery block before first evening session after a long fixed event
    if (!restBlockInserted && longBlock && cursor >= 17 * 60) {
      const restLen = 30;
      const restEnd = cursor + restLen;
      if (restEnd <= slot.end) {
        items.push({
          id: uid(),
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
      const currentEnergy = getEnergyLevel(cursor);

      const target = pickTarget(targets, currentEnergy, lastEnergy, remaining);
      if (!target) break;

      const targetEnergy = categoryEnergy(target.category);
      const idealDuration = sessionDuration(targetEnergy);
      const brkLen = breakDuration(targetEnergy);

      // Fit session into remaining time
      const actualDuration = Math.min(
        idealDuration,
        target.remainingMins,
        remaining,
      );
      if (actualDuration < 20) break;

      const isCritical = target.goalId === criticalGoalId && !hasCriticalBeenPlaced(items);

      items.push({
        id: uid(),
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
      target.remainingMins -= actualDuration;
      cursor += actualDuration;

      // Insert break if there's still room for it
      if (cursor + brkLen <= slot.end) {
        items.push({
          id: uid(),
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
      id: uid(),
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
    id: uid(),
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
  startDate: string, // YYYY-MM-DD
): Plan {
  if (!goals.length) {
    return {
      id: uid(),
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

    const freeSlots = extractFreeTime(scheduleEvents, rules, dow);
    let lastEnergy: EnergyLevel | null = null;

    for (const slot of freeSlots) {
      let cursor = slot.start;

      while (cursor + 20 <= slot.end) {
        const remaining = slot.end - cursor;
        const currentEnergy = getEnergyLevel(cursor);

        const target = pickTarget(targets, currentEnergy, lastEnergy, remaining);
        if (!target) break;

        const targetEnergy = categoryEnergy(target.category);
        const idealDuration = sessionDuration(targetEnergy);
        const brkLen = breakDuration(targetEnergy);

        const actualDuration = Math.min(idealDuration, target.remainingMins, remaining);
        if (actualDuration < 20) break;

        items.push({
          id: uid(),
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
        cursor += actualDuration;

        if (cursor + brkLen <= slot.end) {
          items.push({
            id: uid(),
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
    id: uid(),
    type: 'weekly',
    dateRange: { start: startDate, end: end.toISOString().split('T')[0] },
    items,
    generatedAt: new Date().toISOString(),
    source: 'local',
  };
}
