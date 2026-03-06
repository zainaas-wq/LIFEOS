import type { Goal, PlanBlock, PlanBlockType, ScheduleEvent, Rule } from '../types';
import { generateId } from './utils';

// ─── Internal types ───────────────────────────────────────────────────────────

interface Interval {
  start: number; // minutes from midnight
  end: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Subtract busy intervals from a base interval set.
 * Returns only gaps >= minLen minutes.
 */
function freeSlots(
  base: Interval[],
  busy: Interval[],
  minLen = 25,
): Interval[] {
  let slots = [...base];
  for (const b of busy) {
    slots = slots.flatMap((s) => {
      if (b.start >= s.end || b.end <= s.start) return [s]; // no overlap
      const parts: Interval[] = [];
      if (b.start > s.start) parts.push({ start: s.start, end: b.start });
      if (b.end < s.end) parts.push({ start: b.end, end: s.end });
      return parts;
    });
  }
  return slots.filter((s) => s.end - s.start >= minLen);
}

function categoryToBlockType(cat: Goal['category']): PlanBlockType {
  if (cat === 'health') return 'rest';
  if (cat === 'study') return 'study';
  return 'skill'; // covers 'skill' and 'life'
}

/**
 * Detect if a "no screens after 9 PM" rule is active.
 */
function detectNoScreensRule(rules: Rule[]): boolean {
  return rules.some(
    (r) =>
      r.enabled &&
      (r.type === 'screen' ||
        /no.*(screen|phone|device)/i.test(r.title) ||
        /9\s*pm/i.test(r.title) ||
        /21:00/i.test(r.title)),
  );
}

// ─── Main algorithm ───────────────────────────────────────────────────────────

/**
 * Generates a full 7-day PlanBlock[] by:
 * 1. Computing free intervals per day (08:00–22:00 minus schedule events)
 * 2. Applying rule constraints (e.g. no blocks after 21:00)
 * 3. Greedily allocating 25 or 50-min sessions to goals ordered by priority,
 *    with 5 or 10-min breaks between sessions
 */
export function generateWeeklyPlan(
  goals: Goal[],
  scheduleEvents: ScheduleEvent[],
  rules: Rule[],
): PlanBlock[] {
  if (!goals.length) return [];

  const DAY_START = 8 * 60; // 08:00
  const noScreens = detectNoScreensRule(rules);
  const DAY_END = noScreens ? 21 * 60 : 22 * 60;

  // Minutes needed and allocated per goal
  const needed: Record<string, number> = {};
  const allocated: Record<string, number> = {};
  for (const g of goals) {
    needed[g.id] = Math.round(g.weeklyHoursTarget * 60);
    allocated[g.id] = 0;
  }

  // Sort goals: lowest priority number = highest priority; tie-break by most hours
  const sorted = [...goals].sort((a, b) =>
    a.priority !== b.priority
      ? a.priority - b.priority
      : needed[b.id] - needed[a.id],
  );

  const blocks: PlanBlock[] = [];

  for (let day = 0; day < 7; day++) {
    // Busy intervals from schedule events
    const busy: Interval[] = scheduleEvents
      .filter((e) => e.daysOfWeek.includes(day))
      .map((e) => ({ start: timeToMins(e.start), end: timeToMins(e.end) }))
      .sort((a, b) => a.start - b.start);

    const free = freeSlots([{ start: DAY_START, end: DAY_END }], busy);

    for (const slot of free) {
      let cursor = slot.start;

      while (cursor + 25 <= slot.end) {
        // Pick the highest-priority goal that still needs time this week
        const goal = sorted.find((g) => allocated[g.id] < needed[g.id]);
        if (!goal) break;

        const slotLeft = slot.end - cursor;
        const goalLeft = needed[goal.id] - allocated[goal.id];

        // Session sizing: prefer 50-min deep work, fall back to 25-min Pomodoro
        const sessionMins = slotLeft >= 60 && goalLeft >= 50 ? 50 : 25;
        const breakMins = sessionMins === 50 ? 10 : 5;

        if (cursor + sessionMins > slot.end) break;

        blocks.push({
          id: generateId(),
          dayOfWeek: day,
          startTime: minsToTime(cursor),
          endTime: minsToTime(cursor + sessionMins),
          type: categoryToBlockType(goal.category),
          goalId: goal.id,
          focusMode: false,
          completed: false,
          createdAt: new Date().toISOString(),
        });

        allocated[goal.id] += sessionMins;
        cursor += sessionMins + breakMins;
      }
    }
  }

  return blocks;
}

/**
 * Returns a summary of allocated vs needed minutes per goal.
 */
export function getGoalAllocation(
  goals: Goal[],
  blocks: PlanBlock[],
): Array<{ goal: Goal; allocatedMins: number; neededMins: number; pct: number }> {
  return goals.map((g) => {
    const allocatedMins = blocks
      .filter((b) => b.goalId === g.id)
      .reduce((sum, b) => {
        const dur = timeToMins(b.endTime) - timeToMins(b.startTime);
        return sum + dur;
      }, 0);
    const neededMins = Math.round(g.weeklyHoursTarget * 60);
    const pct = neededMins > 0 ? Math.min(100, Math.round((allocatedMins / neededMins) * 100)) : 0;
    return { goal: g, allocatedMins, neededMins, pct };
  });
}
