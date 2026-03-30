/**
 * LifeOS Recovery Actions Engine
 *
 * Transforms the active control plan in response to user-triggered recovery.
 * Each action modifies the plan items array and returns a new items array.
 * The store replaces controlPlan.plan.items and recomputes nextBestAction.
 *
 * Design:
 *   - Pure logic. No React, no store, no side effects.
 *   - Never mutates input arrays.
 *   - Returns the modified items[] — caller rebuilds the plan.
 *   - Each action has a clear invariant: NEVER removes critical items.
 */

import { timeToMins, minsToTime } from './planGenerator';
import type { PlanItem, DailyDecision, RecoveryMode } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isActionable(i: PlanItem): boolean {
  return i.type === 'goal' || i.type === 'skill' || i.type === 'habit';
}

function isSafe(i: PlanItem): boolean {
  // Never remove constraint, recovery, or reward blocks
  return i.type !== 'event' && i.blockKind !== 'constraint' && i.blockKind !== 'recovery';
}

function durationOf(i: PlanItem): number {
  return Math.max(5, timeToMins(i.endTime) - timeToMins(i.startTime));
}

// ─── 1. Save My Day ────────────────────────────────────────────────────────────

/**
 * Keeps critical item + top-2 must-do items. Marks everything else completed
 * (hidden from nextBestAction). Constraints and recovery blocks are preserved.
 *
 * Use when: overload, fragmented_day, late_start with many expired items.
 */
export function applySaveMyDay(
  items: PlanItem[],
  dailyDecision: DailyDecision | null,
  nowMins: number,
): PlanItem[] {
  const mustDoTitles = new Set(dailyDecision?.mustDoItems ?? []);

  // Priority: isCritical first, then must-do titles, then earliest start
  const keep = new Set<string>();

  // Always keep the critical item
  const critical = items.find((i) => i.isCritical && !i.completed && isActionable(i));
  if (critical) keep.add(critical.id);

  // Keep up to 2 must-do items (not already in keep)
  let mustDoAdded = 0;
  for (const item of items) {
    if (keep.has(item.id)) continue;
    if (!item.completed && isActionable(item) && mustDoTitles.has(item.title)) {
      keep.add(item.id);
      mustDoAdded++;
      if (mustDoAdded >= 2) break;
    }
  }

  // If nothing kept yet, keep first remaining actionable item
  if (keep.size === 0) {
    const first = items.find((i) => !i.completed && isActionable(i));
    if (first) keep.add(first.id);
  }

  return items.map((item) => {
    // Always preserve constraints, recovery blocks, and already-completed items
    if (item.completed) return item;
    if (!isSafe(item)) return item;
    if (!isActionable(item)) return item; // breaks, buffers, events untouched
    if (keep.has(item.id)) return item;
    // Defer: mark as completed so nextBestAction skips it
    // The timeline will dim these items (they show as completed)
    return { ...item, completed: true, notes: (item.notes ?? '') + '[deferred_by_recovery]' };
  });
}

// ─── 2. Critical Only ─────────────────────────────────────────────────────────

/**
 * Strips the day to ONE item: the isCritical task, or the first must-do.
 * All other actionable items are deferred (marked completed).
 *
 * Use when: avoidance, extreme overload, user is overwhelmed.
 */
export function applyCriticalOnly(
  items: PlanItem[],
  mustDoTitles: string[],
): PlanItem[] {
  // Find the one item to keep
  const critical = items.find((i) => i.isCritical && !i.completed && isActionable(i));
  const mustDoSet = new Set(mustDoTitles);
  const mustDo = !critical
    ? items.find((i) => !i.completed && isActionable(i) && mustDoSet.has(i.title))
    : null;
  const keepItem = critical ?? mustDo ?? items.find((i) => !i.completed && isActionable(i));

  return items.map((item) => {
    if (item.completed) return item;
    if (!isSafe(item)) return item;
    if (!isActionable(item)) return item;
    if (keepItem && item.id === keepItem.id) return item;
    return { ...item, completed: true, notes: (item.notes ?? '') + '[deferred_by_recovery]' };
  });
}

// ─── 3. Resume From Now ───────────────────────────────────────────────────────

/**
 * Shifts all incomplete items to start from nowMins (or first available gap).
 * Preserves relative order, durations, and spacing.
 * Constraints are never shifted.
 *
 * Use when: late_start, distraction recovery, user returning mid-day.
 */
export function applyResumeFromNow(
  items: PlanItem[],
  nowMins: number,
): PlanItem[] {
  // Round up to next 5-minute boundary
  const startFrom = Math.ceil(nowMins / 5) * 5;

  // Sort all items by original start time
  const sorted = [...items].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));

  let cursor = startFrom;
  const result: PlanItem[] = [];

  for (const item of sorted) {
    // Constraints keep their original times
    if (item.blockKind === 'constraint' || item.type === 'event') {
      result.push(item);
      // Advance cursor past this constraint if it would overlap
      const constraintEnd = timeToMins(item.endTime);
      if (constraintEnd > cursor) cursor = constraintEnd;
      continue;
    }

    // Completed items keep original times (they're already done)
    if (item.completed) {
      result.push(item);
      continue;
    }

    const dur = durationOf(item);
    const newStart = cursor;
    const newEnd = cursor + dur;

    // Cap at 23:59 (1439 mins)
    if (newStart >= 1439) {
      // No time left — defer
      result.push({
        ...item,
        completed: true,
        notes: (item.notes ?? '') + '[deferred_by_recovery]',
      });
      continue;
    }

    result.push({
      ...item,
      startTime: minsToTime(newStart),
      endTime: minsToTime(Math.min(newEnd, 1439)),
    });

    cursor = Math.min(newEnd + 5, 1439); // 5 min gap between items
  }

  return result;
}

// ─── 4. Compress Day ──────────────────────────────────────────────────────────

/**
 * Reduces all incomplete session durations by ~30% (minimum 15 min).
 * Repacks them starting from nowMins so the timeline is achievable.
 * Constraints and recovery blocks are NOT compressed.
 *
 * Use when: overload with moderate deficit (timeRatio 1.1–1.5).
 */
export function applyCompressDay(
  items: PlanItem[],
  nowMins: number,
): PlanItem[] {
  const COMPRESSION = 0.7; // keep 70% of original duration
  const MIN_SESSION = 15;  // never compress below 15 min

  // First pass: compress durations on future incomplete actionable items
  const compressed = items.map((item) => {
    if (item.completed) return item;
    if (!isActionable(item)) return item;
    if (item.blockKind === 'constraint') return item;
    // Only compress items that haven't started yet
    if (timeToMins(item.startTime) < nowMins) return item;

    const dur = durationOf(item);
    const newDur = Math.max(MIN_SESSION, Math.round(dur * COMPRESSION));
    return {
      ...item,
      endTime: minsToTime(timeToMins(item.startTime) + newDur),
      sizingMode: 'condensed' as const,
      minViableDuration: MIN_SESSION,
    };
  });

  // Second pass: repack from nowMins (same logic as resumeFromNow)
  return applyResumeFromNow(compressed, nowMins);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Single entry point — apply a recovery mode to the current plan items.
 * Returns modified items[]; caller handles store update + nextBestAction recompute.
 */
export function applyRecoveryMode(
  mode: RecoveryMode,
  items: PlanItem[],
  dailyDecision: DailyDecision | null,
  nowMins: number,
): PlanItem[] {
  switch (mode) {
    case 'save_day':
      return applySaveMyDay(items, dailyDecision, nowMins);
    case 'critical_only':
      return applyCriticalOnly(items, dailyDecision?.mustDoItems ?? []);
    case 'resume_now':
      return applyResumeFromNow(items, nowMins);
    case 'compress_day':
      return applyCompressDay(items, nowMins);
  }
}
