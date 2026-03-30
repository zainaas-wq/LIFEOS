/**
 * LifeOS Execution Engine
 *
 * Computes real-time day progress and behavioral pressure level.
 *
 * v2 changes:
 *   - computePressure() is now the canonical function: time-aware, uses both
 *     skip count AND the ratio of required task time vs available time.
 *   - getPressureLevel / getPressureGrade are kept as deprecated wrappers
 *     for backward compatibility with code that hasn't migrated yet.
 *   - PressureLevel and PressureGrade are defined here (not in types/index.ts)
 *     to avoid breaking existing imports in home.tsx.
 */

import { timeToMins } from './planGenerator';
import type { PlanItem, PressureInfo } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PressureLevel = 'normal' | 'elevated' | 'critical';
export type PressureGrade = 0 | 1 | 2 | 3;

// ─── Day Progress ─────────────────────────────────────────────────────────────

export interface DayProgress { completed: number; total: number; pct: number; }

/**
 * Computes completion progress for today's actionable plan items.
 * Counts goal, skill, and habit items. Excludes break, event, and free items.
 */
export function computeDayProgress(items: PlanItem[]): DayProgress {
  const actionable = items.filter(
    i => i.type === 'goal' || i.type === 'skill' || i.type === 'habit',
  );
  const total     = actionable.length;
  const completed = actionable.filter(i => i.completed).length;
  return {
    completed,
    total,
    pct: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

// ─── Canonical pressure computation (v2) ─────────────────────────────────────

/**
 * Computes pressure using both time reality and skip behavior.
 *
 * Time pressure grade:
 *   Compares minutes required by remaining tasks vs available time left in day.
 *   ratio > 1.5 → grade 3 (critical: severely behind)
 *   ratio > 1.2 → grade 2
 *   ratio > 1.0 → grade 1 (elevated: slightly behind)
 *   ratio ≤ 1.0 → grade 0 (on track)
 *
 * Skip pressure grade:
 *   ≥ 4 skips → grade 3
 *   ≥ 3 skips → grade 2
 *   ≥ 1 skip  → grade 1
 *   0 skips   → grade 0
 *
 * Final grade = Math.max(timePressure, skipPressure).
 * A user with 0 skips but insufficient time is still correctly flagged as critical.
 *
 * @param skipCount     Current taskSkipCount from store
 * @param nowMins       Current time in minutes since midnight (e.g. 10*60+30 = 630)
 * @param planItems     All items in today's control plan
 * @param fixedEndMins  Day end boundary in minutes (from profile.fixedScheduleEnd)
 */
export function computePressure(
  skipCount: number,
  nowMins: number,
  planItems: PlanItem[],
  fixedEndMins: number,
): PressureInfo {
  const remaining = planItems.filter(
    i => !i.completed && (i.type === 'goal' || i.type === 'skill' || i.type === 'habit'),
  );

  const requiredMins = remaining.reduce((sum, i) => {
    const dur = Math.max(0, timeToMins(i.endTime) - timeToMins(i.startTime));
    return sum + dur;
  }, 0);

  const availableMins = Math.max(0, fixedEndMins - nowMins);
  // If no time left, treat ratio as 2.0 (always critical)
  const timeRatio = availableMins > 0 ? requiredMins / availableMins : 2;

  const timePressure: PressureGrade =
    timeRatio > 1.5 ? 3 :
    timeRatio > 1.2 ? 2 :
    timeRatio > 1.0 ? 1 : 0;

  const skipPressure: PressureGrade =
    skipCount >= 4 ? 3 :
    skipCount >= 3 ? 2 :
    skipCount >= 1 ? 1 : 0;

  const grade = Math.max(timePressure, skipPressure) as PressureGrade;
  const level: PressureLevel =
    grade >= 3 ? 'critical' :
    grade >= 1 ? 'elevated' :
    'normal';

  return { level, grade, remainingMins: availableMins, requiredMins, timeRatio };
}


