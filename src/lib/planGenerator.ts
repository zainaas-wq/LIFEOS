import type { Task, TimeBlock, Constraint, DailyPlan, ScheduleItem } from '../types';
import { generateId } from './utils';

interface GeneratePlanInput {
  tasks: Task[];
  timeBlocks: TimeBlock[];
  constraints: Constraint[];
  date: string;
  mainFocus: string;
}

/**
 * Local plan generator — schedules tasks into available time blocks
 * while respecting constraints.
 *
 * Algorithm:
 * 1. Parse and sort time blocks chronologically
 * 2. Mark constraint windows as blocked
 * 3. Sort tasks: high → medium → low priority, then by duration (shorter first)
 * 4. Greedily fit tasks into available slots
 * 5. Identify critical action = first uncompleted high-priority task
 *    (or first task if none are high priority)
 */
export function generateDailyPlan(input: GeneratePlanInput): DailyPlan {
  const { tasks, timeBlocks, constraints, date, mainFocus } = input;

  const todayTasks = tasks
    .filter((t) => t.date === date && !t.completed)
    .sort(sortByPriority);

  const sortedBlocks = [...timeBlocks]
    .filter((b) => b.date === date)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const activeConstraints = constraints.filter((c) => c.active);

  const schedule: ScheduleItem[] = [];

  // ── Build blocked intervals from constraints ───────────────────────────────
  const blocked: Array<{ start: number; end: number; label: string }> = [];
  for (const c of activeConstraints) {
    if (c.startTime && c.endTime) {
      blocked.push({
        start: timeToMinutes(c.startTime),
        end: timeToMinutes(c.endTime),
        label: c.description,
      });
      schedule.push({
        startTime: c.startTime,
        endTime: c.endTime,
        label: `🚫 ${c.description}`,
        type: 'blocked',
      });
    }
  }

  // ── Schedule tasks into blocks ─────────────────────────────────────────────
  const taskQueue = [...todayTasks];
  const scheduledTaskIds = new Set<string>();

  for (const block of sortedBlocks) {
    let cursor = timeToMinutes(block.startTime);
    const blockEnd = timeToMinutes(block.endTime);

    while (cursor < blockEnd && taskQueue.length > 0) {
      const task = taskQueue[0];
      const taskEnd = cursor + task.durationMinutes;

      // Check if slot overlaps any constraint
      const isBlocked = blocked.some(
        (b) => cursor < b.end && taskEnd > b.start
      );

      if (isBlocked || taskEnd > blockEnd) {
        // Try adding a break and moving forward, or skip this block
        if (taskEnd > blockEnd) break;
        cursor += 15; // step over blocked period
        continue;
      }

      schedule.push({
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(taskEnd),
        label: task.title,
        taskId: task.id,
        type: 'task',
      });

      scheduledTaskIds.add(task.id);
      taskQueue.shift();
      cursor = taskEnd;

      // Add a short break after each task (if there's room)
      if (cursor + 5 <= blockEnd && taskQueue.length > 0) {
        schedule.push({
          startTime: minutesToTime(cursor),
          endTime: minutesToTime(cursor + 5),
          label: 'Short break',
          type: 'break',
        });
        cursor += 5;
      }
    }
  }

  // ── Determine critical action ──────────────────────────────────────────────
  const criticalAction = deriveCriticalAction(todayTasks, mainFocus);

  // ── Sort final schedule chronologically ───────────────────────────────────
  schedule.sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );

  return {
    id: generateId(),
    date,
    criticalAction,
    schedule,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortByPriority(a: Task, b: Task): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  if (order[a.priority] !== order[b.priority]) {
    return order[a.priority] - order[b.priority];
  }
  return a.durationMinutes - b.durationMinutes;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function deriveCriticalAction(tasks: Task[], mainFocus: string): string {
  if (tasks.length === 0) {
    return mainFocus
      ? `Focus on: ${mainFocus}`
      : 'Define your most important task for today.';
  }

  const highPriority = tasks.find((t) => t.priority === 'high');
  const target = highPriority ?? tasks[0];

  return target.title;
}
