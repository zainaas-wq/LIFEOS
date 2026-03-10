/**
 * LifeOS Local Plan Generator
 *
 * Deterministic algorithm that:
 * 1. Extracts free time from a day's schedule (minus events + rule constraints)
 * 2. Allocates goal/skill sessions into those slots, respecting priorities
 * 3. Returns structured Plan / PlanItem arrays
 *
 * This is Phase 1 — no AI API required.
 */

import type {
  ScheduleEvent,
  Goal,
  SkillPlan,
  Rule,
  Plan,
  PlanItem,
  PlanItemType,
} from '../types';
import { generateId } from '../lib/utils';

// ─── Internal ─────────────────────────────────────────────────────────────────

export interface TimeInterval {
  start: number; // minutes from midnight
  end: number;
}

export function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Subtract busy intervals from a base window.
 * Returns free intervals ≥ minLen minutes.
 */
export function subtractIntervals(
  base: TimeInterval[],
  busy: TimeInterval[],
  minLen = 20,
): TimeInterval[] {
  let free = [...base];
  for (const b of busy) {
    free = free.flatMap((s) => {
      if (b.start >= s.end || b.end <= s.start) return [s];
      const parts: TimeInterval[] = [];
      if (b.start > s.start) parts.push({ start: s.start, end: b.start });
      if (b.end < s.end) parts.push({ start: b.end, end: s.end });
      return parts;
    });
  }
  return free.filter((s) => s.end - s.start >= minLen);
}

// ─── Free-time extraction ─────────────────────────────────────────────────────

function getDayEnd(rules: Rule[]): number {
  // Look for a sleep or screen rule that sets a curfew
  for (const r of rules) {
    if (!r.enabled) continue;
    if ((r.type === 'sleep' || r.type === 'screen') && r.startTime) {
      const t = timeToMins(r.startTime);
      if (t >= 18 * 60 && t <= 23 * 60) return t; // sensible evening curfew
    }
  }
  return 22 * 60; // default 22:00
}

/**
 * Extracts free time intervals for a given day of week.
 * Exported so tests can call it directly.
 */
export function extractFreeTime(
  scheduleEvents: ScheduleEvent[],
  rules: Rule[],
  dayOfWeek: number, // 0 = Sun … 6 = Sat
  dayStart = 8 * 60, // 08:00
): TimeInterval[] {
  const dayEnd = getDayEnd(rules);

  const busy: TimeInterval[] = scheduleEvents
    .filter((e) => e.daysOfWeek.includes(dayOfWeek))
    .map((e) => ({ start: timeToMins(e.start), end: timeToMins(e.end) }))
    .sort((a, b) => a.start - b.start);

  return subtractIntervals([{ start: dayStart, end: dayEnd }], busy);
}

// ─── Plan generation ──────────────────────────────────────────────────────────

interface AllocationTarget {
  id: string;
  title: string;
  category: Goal['category'];
  priority: number;
  remainingMins: number; // how many minutes still need to be scheduled
  type: PlanItemType;
  goalId?: string;
  skillPlanId?: string;
}

function goalsToTargets(goals: Goal[], skillPlans: SkillPlan[]): AllocationTarget[] {
  const targets: AllocationTarget[] = [];

  for (const g of goals) {
    const sp = skillPlans.find((s) => s.id === g.linkedSkillPlanId);
    const weeklyMins = g.weeklyHoursTarget * 60;

    if (sp) {
      targets.push({
        id: g.id,
        title: sp.title,
        category: g.category,
        priority: g.priority,
        remainingMins: weeklyMins,
        type: g.category === 'study' ? 'skill' : 'goal',
        goalId: g.id,
        skillPlanId: sp.id,
      });
    } else {
      targets.push({
        id: g.id,
        title: g.title,
        category: g.category,
        priority: g.priority,
        remainingMins: weeklyMins,
        type: g.category === 'study' ? 'goal' : 'goal',
        goalId: g.id,
      });
    }
  }

  return targets.sort((a, b) => a.priority - b.priority);
}

function preferredSessionLength(category: Goal['category'], slotMins: number): number {
  // study: 50-min deep work preferred in mornings; 25-min elsewhere
  // health: 30–60 min
  // skill/career: 50 min
  // life: 25 min
  if (slotMins < 25) return 0;
  if (category === 'health') return Math.min(60, slotMins);
  if (slotMins >= 55) return 50;
  return 25;
}

/**
 * Generates a weekly plan for the coming 7 days.
 */
export function generateWeeklyPlanItems(
  goals: Goal[],
  scheduleEvents: ScheduleEvent[],
  skillPlans: SkillPlan[],
  rules: Rule[],
  startDate: string, // YYYY-MM-DD, the Monday (or today)
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

  const targets = goalsToTargets(goals, skillPlans);
  const items: PlanItem[] = [];
  const BREAK_MINS = 5;

  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    const dow = d.getDay();

    const freeSlots = extractFreeTime(scheduleEvents, rules, dow);

    for (const slot of freeSlots) {
      let cursor = slot.start;

      while (cursor + 25 <= slot.end) {
        // Pick highest-priority goal still needing time
        const target = targets.find((t) => t.remainingMins > 0);
        if (!target) break;

        const slotLeft = slot.end - cursor;
        const sessionMins = preferredSessionLength(target.category, slotLeft);
        if (sessionMins === 0) break;

        const actualSession = Math.min(sessionMins, target.remainingMins);
        if (cursor + actualSession > slot.end) break;

        items.push({
          id: generateId(),
          startTime: minsToTime(cursor),
          endTime: minsToTime(cursor + actualSession),
          title: target.title,
          type: target.type,
          goalId: target.goalId,
          skillPlanId: target.skillPlanId,
          completed: false,
        });

        target.remainingMins -= actualSession;
        cursor += actualSession;

        // Visible break between sessions
        if (cursor + BREAK_MINS <= slot.end) {
          items.push({
            id: generateId(),
            startTime: minsToTime(cursor),
            endTime: minsToTime(cursor + BREAK_MINS),
            title: 'Short Break',
            type: 'break' as PlanItemType,
            completed: false,
          });
          cursor += BREAK_MINS;
        }
      }
    }
  }

  const endStr = end.toISOString().split('T')[0];
  return {
    id: generateId(),
    type: 'weekly',
    dateRange: { start: startDate, end: endStr },
    items,
    generatedAt: new Date().toISOString(),
    source: 'local',
  };
}

/**
 * Generates a daily plan for a specific date.
 */
export function generateDailyPlanItems(
  goals: Goal[],
  scheduleEvents: ScheduleEvent[],
  skillPlans: SkillPlan[],
  rules: Rule[],
  date: string, // YYYY-MM-DD
): Plan {
  const dow = new Date(date).getDay();
  const freeSlots = extractFreeTime(scheduleEvents, rules, dow);
  const targets = goalsToTargets(goals, skillPlans);
  const items: PlanItem[] = [];
  const BREAK_MINS = 5;

  // Add scheduled events as fixed items
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
    });
  }

  for (const slot of freeSlots) {
    let cursor = slot.start;

    while (cursor + 25 <= slot.end) {
      const target = targets.find((t) => t.remainingMins > 0);
      if (!target) break;

      const slotLeft = slot.end - cursor;
      const sessionMins = preferredSessionLength(target.category, slotLeft);
      if (sessionMins === 0) break;

      const actualSession = Math.min(sessionMins, target.remainingMins, slotLeft);
      if (cursor + actualSession > slot.end) break;

      items.push({
        id: generateId(),
        startTime: minsToTime(cursor),
        endTime: minsToTime(cursor + actualSession),
        title: target.title,
        type: target.type,
        goalId: target.goalId,
        skillPlanId: target.skillPlanId,
        completed: false,
      });

      target.remainingMins -= actualSession;
      cursor += actualSession;

      // Visible break between sessions
      if (cursor + BREAK_MINS <= slot.end) {
        items.push({
          id: generateId(),
          startTime: minsToTime(cursor),
          endTime: minsToTime(cursor + BREAK_MINS),
          title: 'Short Break',
          type: 'break' as PlanItemType,
          completed: false,
        });
        cursor += BREAK_MINS;
      }
    }

    // Insert a break item if there's a gap
    if (cursor < slot.end && slot.end - cursor >= 10) {
      items.push({
        id: generateId(),
        startTime: minsToTime(cursor),
        endTime: minsToTime(slot.end),
        title: 'Break / Buffer',
        type: 'break',
        completed: false,
      });
    }
  }

  // Sort by startTime
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
