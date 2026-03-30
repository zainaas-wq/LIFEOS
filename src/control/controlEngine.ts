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
  EnergyStyle,
  ConstraintBlock, RecurringTask,
  AdaptationHints,
} from '../types';
import { generateSmartDailyPlan } from '../ai/planningEngine';
import { insertRecoveryBlocks } from '../ai/recoveryEngine';
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

  // P1: Imminent calendar event — time-critical, supersedes goal work
  for (const item of items) {
    if (item.completed || item.type !== 'event') continue;
    const start = timeToMins(item.startTime);
    const end   = timeToMins(item.endTime);
    if (start <= now + 15 && end > now) return item;
  }

  // P2/P3: Goal, skill, or habit (injected as 'goal' type) in current window
  const workTypes: PlanItemType[] = ['goal', 'skill'];
  for (const item of items) {
    if (item.completed) continue;
    if (!workTypes.includes(item.type)) continue;
    const start = timeToMins(item.startTime);
    const end   = timeToMins(item.endTime);
    if (start <= now + 15 && end > now) return item;
  }

  // P4: Next upcoming work item
  for (const item of items) {
    if (item.completed) continue;
    if (!workTypes.includes(item.type)) continue;
    if (timeToMins(item.startTime) > now) return item;
  }

  return null;
}

// ─── Constraint block → PlanItem ──────────────────────────────────────────────

/**
 * Convert a ConstraintBlock (from scheduleInputService) into a pre-placed PlanItem.
 * Recovery blocks (type='appointment' with recoveryType set) render as 'break' items
 * with blockKind='recovery'. Work/class blocks render as 'event' items.
 */
function makeConstraintPlanItem(block: ConstraintBlock): PlanItem {
  const isRecovery = block.type === 'appointment';
  return {
    id:        `constraint-${block.id}`,
    startTime: block.startTime,
    endTime:   block.endTime,
    title:     block.label,
    type:      (isRecovery ? 'break' : 'event') as PlanItemType,
    blockKind: isRecovery ? 'recovery' : 'constraint',
    completed: false,
    source:    'constraint',
  };
}

// ─── Routine injection ────────────────────────────────────────────────────────

function makeRoutineItem(task: RecurringTask, today: string, startMins: number): PlanItem {
  return {
    id:        `habit-${task.id}-${today}`,
    startTime: minsToTime(startMins),
    endTime:   minsToTime(startMins + task.durationMinutes),
    title:     task.title,
    type:      'goal' as PlanItemType,
    goalId:    task.id,  // carries taskId for completion tracking
    completed: false,
    source:    'habit',
  };
}

function injectRoutineItems(
  tasks: RecurringTask[],
  today: string,
  existingItems: PlanItem[],
  dayStart: number,
  dayEnd: number,
): PlanItem[] {
  const due = tasks.filter(t => !t.completedDates.includes(today));
  if (!due.length) return existingItems;

  const result = [...existingItems];
  for (const task of due) {
    const dur       = task.durationMinutes;
    const preferred = task.preferredTime ? timeToMins(task.preferredTime) : dayStart;
    // Re-sort on each iteration so previously placed tasks are visible
    const sorted    = [...result].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
    let placed      = false;

    // Try near preferred time first (within 30 min window)
    for (let i = 0; i <= sorted.length; i++) {
      const gapStart = i === 0 ? dayStart : timeToMins(sorted[i - 1].endTime);
      const gapEnd   = i === sorted.length ? dayEnd : timeToMins(sorted[i].startTime);
      const slot     = Math.max(gapStart, preferred);
      if (slot + dur <= gapEnd && Math.abs(slot - preferred) <= 30) {
        result.push(makeRoutineItem(task, today, slot));
        placed = true;
        break;
      }
    }

    // Fallback: first available gap anywhere in the day
    if (!placed) {
      for (let i = 0; i <= sorted.length; i++) {
        const gapStart = i === 0 ? dayStart : timeToMins(sorted[i - 1].endTime);
        const gapEnd   = i === sorted.length ? dayEnd : timeToMins(sorted[i].startTime);
        if (gapEnd - gapStart >= dur) {
          result.push(makeRoutineItem(task, today, gapStart));
          placed = true;
          break;
        }
      }
    }

    // Last resort: end of day (still surfaces in NowAction fallback)
    if (!placed) {
      result.push(makeRoutineItem(task, today, Math.max(dayStart, dayEnd - dur)));
    }
  }

  return result;
}

// ─── Nudge schedule ───────────────────────────────────────────────────────────

export function buildNudgeSchedule(items: PlanItem[]): NudgeItem[] {
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
  fixedStart?: number,
  fixedEnd?: number,
  energyStyle?: EnergyStyle,
  /**
   * Authoritative locked-time blocks from getTodayConstraints().allBlocks.
   * When provided:
   *  - Their time windows are subtracted from free slots (goals never scheduled over them)
   *  - They are pre-placed as PlanItems in the output (work/class → 'event', recovery → 'break')
   *  - insertRecoveryBlocks() is skipped (recovery already present in allBlocks)
   *  - Pass empty scheduleEvents to avoid double-injecting the same blocks
   */
  constraintBlocks?: ConstraintBlock[],
  /**
   * RecurringTasks from v3 store — injected as routine blocks after goal scheduling.
   */
  recurringTasks?: RecurringTask[],
  /**
   * Review-derived adaptation hints computed by adaptationEngine.
   * When provided, passed through to generateSmartDailyPlan to influence
   * scheduling cap, first-session size, and task ordering.
   */
  hints?: AdaptationHints,
): ControlDailyPlan {
  const prefs: UserPreferences = {
    ...derivePreferences(rules),
    ...prefOverrides,
  };

  const dayStart = fixedStart ?? timeToMins(prefs.wakeTime ?? '07:00');
  const dayEnd   = fixedEnd   ?? timeToMins(prefs.sleepTime ?? '22:00');

  // ── Constraint blocks ─────────────────────────────────────────────────────────
  // Convert to PlanItems and extract busy intervals for the planner.
  const constraintPlanItems: PlanItem[] = constraintBlocks?.map(makeConstraintPlanItem) ?? [];
  const busyIntervals = constraintBlocks?.map((b) => ({
    start: timeToMins(b.startTime),
    end:   timeToMins(b.endTime),
  })) ?? [];

  // 1. Generate base plan via smart planning engine.
  //    Pass busyIntervals so goals are never scheduled during locked constraint windows.
  //    When constraintBlocks is provided, pass empty scheduleEvents to avoid duplicates.
  const eventsForPlanner = constraintBlocks ? [] : scheduleEvents;
  const basePlan: Plan = generateSmartDailyPlan(
    goals, eventsForPlanner, skillPlans, rules, date,
    fixedStart, fixedEnd, energyStyle,
    busyIntervals.length ? busyIntervals : undefined,
    hints,
  );

  // 2. Enrich with micro-blocks
  const enrichedItems = insertMicroBlocks(basePlan.items, prefs);

  // 3. Recovery: use constraint blocks when available; fall back to engine insertion
  const withRecovery = constraintBlocks
    ? enrichedItems  // recovery already included in constraintPlanItems
    : insertRecoveryBlocks(enrichedItems, dayEnd);

  // 4. Inject routines
  const withRoutines = injectRoutineItems(recurringTasks ?? [], date, withRecovery, dayStart, dayEnd);

  // 5. Merge pre-placed constraint PlanItems with goal/routine items, then sort
  const allItems: PlanItem[] = [...constraintPlanItems, ...withRoutines].sort(
    (a, b) => a.startTime.localeCompare(b.startTime),
  );

  const enrichedPlan: Plan = { ...basePlan, items: allItems };

  // 6. Compute next best action and nudge schedule over the full item set
  const nextBestAction = computeNextBestAction(allItems);
  const nudgeSchedule  = buildNudgeSchedule(allItems);

  return {
    plan: enrichedPlan,
    nextBestAction,
    nudgeSchedule,
    generatedAt: new Date().toISOString(),
    date,
  };
}
