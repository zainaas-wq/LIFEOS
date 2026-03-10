/**
 * LifeOS Control Engine
 *
 * Generates a structured daily plan with nudges, micro-blocks,
 * and "next best action" computation.
 *
 * Wraps src/ai/planGenerator.ts and enriches the output.
 */

import type {
  Goal, SkillPlan, Rule, ScheduleEvent,
  Plan, PlanItem, PlanItemType,
  ControlDailyPlan, NudgeItem, UserPreferences,
} from '../types';
import { generateSmartDailyPlan } from '../ai/planningEngine';
import { timeToMins, minsToTime } from '../ai/planGenerator';
import { generateId } from '../lib/utils';

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_PREFERENCES: UserPreferences = {
  wakeTime: '07:00',
  sleepTime: '22:00',
  focusBlockMins: 50,
  newsLimitMins: 15,
  mobilityBufferMins: 10,
};

// ─── Derive preferences from rules ───────────────────────────────────────────

export function derivePreferences(rules: Rule[]): UserPreferences {
  const prefs = { ...DEFAULT_PREFERENCES };

  for (const r of rules) {
    if (r.type === 'sleep' && r.startTime) {
      // "No screens / sleep after 22:00" → sleepTime
      prefs.sleepTime = r.startTime;
    }
    if (r.type === 'screen' && r.startTime) {
      // "No screens after X" → treat as sleep boundary if > 20:00
      const mins = timeToMins(r.startTime);
      if (mins >= timeToMins('18:00')) prefs.sleepTime = r.startTime;
    }
  }

  return prefs;
}

// ─── Micro-block insertion ────────────────────────────────────────────────────

function insertMicroBlocks(items: PlanItem[], prefs: UserPreferences): PlanItem[] {
  const result: PlanItem[] = [];
  let newsMinutesUsedToday = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Cap news/free blocks
    if (item.type === 'free' && item.title.toLowerCase().includes('news')) {
      const duration = timeToMins(item.endTime) - timeToMins(item.startTime);
      const remaining = prefs.newsLimitMins - newsMinutesUsedToday;
      if (remaining <= 0) continue; // skip excess news blocks
      if (duration > remaining) {
        // Trim the block
        newsMinutesUsedToday += remaining;
        result.push({
          ...item,
          endTime: minsToTime(timeToMins(item.startTime) + remaining),
          title: `News (${remaining} min limit)`,
        });
        continue;
      }
      newsMinutesUsedToday += duration;
    }

    result.push(item);

    // Insert mobility buffer after long focus sessions.
    // Skip if planningEngine already placed a break immediately after this item.
    if ((item.type === 'goal' || item.type === 'skill') && i < items.length - 1) {
      const duration = timeToMins(item.endTime) - timeToMins(item.startTime);
      const nextItem = items[i + 1];
      if (duration >= 45 && nextItem.type !== 'break') {
        const bufferStart = item.endTime;
        const bufferEndMins = timeToMins(bufferStart) + prefs.mobilityBufferMins;
        const nextStart = nextItem.startTime;
        // Only insert if there's room before the next block
        if (bufferEndMins <= timeToMins(nextStart)) {
          result.push({
            id: generateId(),
            startTime: bufferStart,
            endTime: minsToTime(bufferEndMins),
            title: 'Move · Stretch · Reset',
            type: 'break' as PlanItemType,
            completed: false,
          });
        }
      }
    }
  }

  return result;
}

// ─── Next best action ─────────────────────────────────────────────────────────

export function computeNextBestAction(items: PlanItem[], nowMins?: number): PlanItem | null {
  const now = nowMins ?? ((): number => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();

  // Find the first uncompleted goal/skill item that starts within the next 15 min
  // or has already started but not completed
  const actionTypes: PlanItemType[] = ['goal', 'skill'];
  for (const item of items) {
    if (item.completed) continue;
    if (!actionTypes.includes(item.type)) continue;
    const start = timeToMins(item.startTime);
    const end = timeToMins(item.endTime);
    if (start <= now + 15 && end > now) return item;
  }

  // Fallback: next upcoming action
  for (const item of items) {
    if (item.completed) continue;
    if (!actionTypes.includes(item.type)) continue;
    const start = timeToMins(item.startTime);
    if (start > now) return item;
  }

  return null;
}

// ─── Nudge schedule ───────────────────────────────────────────────────────────

function buildNudgeSchedule(items: PlanItem[]): NudgeItem[] {
  const nudges: NudgeItem[] = [];
  const actionTypes: PlanItemType[] = ['goal', 'skill', 'event'];

  for (const item of items) {
    if (!actionTypes.includes(item.type)) continue;

    // "Time to start" nudge at item start
    nudges.push({
      id: `nudge-start-${item.id}`,
      itemId: item.id,
      itemTitle: item.title,
      triggerTime: item.startTime,
      type: 'start',
    });

    // "Missed start" nudge 10 minutes later
    const missedMins = timeToMins(item.startTime) + 10;
    nudges.push({
      id: `nudge-missed-${item.id}`,
      itemId: item.id,
      itemTitle: item.title,
      triggerTime: minsToTime(missedMins),
      type: 'missed',
    });
  }

  return nudges;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateControlPlan(
  goals: Goal[],
  scheduleEvents: ScheduleEvent[],
  skillPlans: SkillPlan[],
  rules: Rule[],
  date: string,
  prefOverrides?: Partial<UserPreferences>,
): ControlDailyPlan {
  const prefs: UserPreferences = {
    ...derivePreferences(rules),
    ...prefOverrides,
  };

  // 1. Generate base plan via smart planning engine
  const basePlan: Plan = generateSmartDailyPlan(goals, scheduleEvents, skillPlans, rules, date);

  // 2. Enrich with micro-blocks
  const enrichedItems = insertMicroBlocks(basePlan.items, prefs);
  const enrichedPlan: Plan = { ...basePlan, items: enrichedItems };

  // 3. Compute next best action
  const nextBestAction = computeNextBestAction(enrichedItems);

  // 4. Build nudge schedule
  const nudgeSchedule = buildNudgeSchedule(enrichedItems);

  return {
    plan: enrichedPlan,
    nextBestAction,
    nudgeSchedule,
    generatedAt: new Date().toISOString(),
    date,
  };
}
