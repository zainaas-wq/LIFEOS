/**
 * scheduleInputService.ts
 *
 * Single source of truth for today's constraint blocks.
 *
 * Priority order — schedule-type-aware:
 *
 * daily_input:
 *   A. todayScheduleEntry — used exclusively; no fallback if absent
 *      (absence = system should prompt user for today's hours)
 *
 * weekly_known:
 *   A. Explicit manual override for today (todayScheduleEntry.date === today)
 *   B. Recurring ScheduleEvent records (category: 'work'|'class', recurring: true)
 *   C. profile.fixedScheduleStart/End (only if nothing stronger exists)
 *
 * fixed:
 *   A. Recurring ScheduleEvent records
 *   B. profile.fixedScheduleStart/End fallback
 *
 * noWorkToday on any date-specific entry suppresses all constraint sources for that date.
 * Profile fallback NEVER overrides a real daily entry (A).
 *
 * Off-day handling:
 *   offDays suppresses ONLY the routine/task layer (activeRecurringTasks).
 *   Locked constraints (work, class, appointment, manually entered blocks) are
 *   NEVER erased by offDays — users may have real work shifts on rest days.
 *
 * Recovery blocks are returned as real ConstraintBlock records alongside
 * the work/class blocks so they appear in the timeline and are visible
 * to the behavior state machine.
 *
 * In worker_student mode, work + study blocks are merged with deterministic
 * overlap resolution. Any resolved overlaps are reported as OverlapWarning[].
 *
 * Off-day handling:
 *   - If today is in profile.offDays → return empty workBlocks + recoveryBlocks
 *   - If skipTasksOnOffDays = true → recurring tasks with skipOnOffDays = true
 *     are excluded from activeRecurringTasks
 */

import type {
  UserProfile,
  ScheduleEvent,
  ConstraintBlock,
  DailyScheduleEntry,
  RecurringTask,
  UserType,
  ScheduleType,
  RecoveryType,
} from '../types';
import { generateId } from '../lib/utils';
import i18n from '../i18n';

// ─── Output types ──────────────────────────────────────────────────────────────

/**
 * Describes how a constraint overlap was resolved in worker_student mode.
 * Exposed for debugging and future coach messaging ("Your study block was
 * pushed back because it overlapped with your work shift").
 */
export interface OverlapWarning {
  block1Id: string;
  block1Label: string;
  block2Id: string;
  block2Label: string;
  /** The resolution applied. */
  resolution:
    | 'block2_delayed'   // block2 start pushed back to block1.endTime
    | 'block2_trimmed'   // block2 end truncated (not used yet — reserved)
    | 'block2_skipped';  // block2 fully contained within block1 — dropped
  originalBlock2Start: string;  // "HH:MM" before resolution
  adjustedBlock2Start: string;  // "HH:MM" after resolution
}

/**
 * Full result from getTodayConstraints().
 *
 * workBlocks    — locked work/class blocks for today
 * recoveryBlocks— recovery blocks appended after qualifying work/class blocks;
 *                 these are REAL plan blocks, not inferred later
 * allBlocks     — workBlocks + recoveryBlocks merged and sorted by startTime;
 *                 pass this to the planning engine as the locked time set
 * activeRecurringTasks — recurring tasks active today (day-of-week + off-day filtered)
 * isOffDay      — true when today is in profile.offDays
 * overlapWarnings — non-empty only in worker_student mode when overlaps were found
 */
export interface TodayConstraintsResult {
  workBlocks: ConstraintBlock[];
  recoveryBlocks: ConstraintBlock[];
  allBlocks: ConstraintBlock[];
  activeRecurringTasks: RecurringTask[];
  isOffDay: boolean;
  overlapWarnings: OverlapWarning[];
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute today's constraint blocks and active recurring tasks.
 *
 * @param profile           User profile (may be null for guests)
 * @param scheduleEvents    All persisted ScheduleEvent records
 * @param recurringTasks    All RecurringTask records (v3) or [] for legacy users
 * @param todayScheduleEntry  Explicit day-specific schedule input, if any
 * @param dateStr           YYYY-MM-DD string for today
 */
export function getTodayConstraints(
  profile: UserProfile | null,
  scheduleEvents: ScheduleEvent[],
  recurringTasks: RecurringTask[],
  todayScheduleEntry: DailyScheduleEntry | null,
  dateStr: string,
): TodayConstraintsResult {
  const dayOfWeek = parseDayOfWeek(dateStr);
  const userType   = resolveUserType(profile);
  const schedType  = resolveScheduleType(profile);
  const offDays    = profile?.offDays ?? [];
  const skipOnOff  = profile?.skipTasksOnOffDays ?? false;

  // ── 1. Off-day check ────────────────────────────────────────────────────────
  const isOffDay = offDays.includes(dayOfWeek);

  // ── 2. Recurring task filter ────────────────────────────────────────────────
  const activeRecurringTasks = filterRecurringTasks(
    recurringTasks, dayOfWeek, isOffDay, skipOnOff,
  );

  // ── 3. Flexible → no constraints ────────────────────────────────────────────
  // NOTE: isOffDay does NOT suppress locked constraints (work, class, appointments,
  // manually entered daily blocks). offDays only suppresses the routines/task layer —
  // already handled above via filterRecurringTasks(). The user may have a real work
  // shift on a day they consider a "rest day" from personal tasks.
  if (userType === 'flexible') {
    return empty(activeRecurringTasks, isOffDay);
  }

  // ── 4. Build raw work + study blocks (before overlap resolution) ─────────────
  const overlapWarnings: OverlapWarning[] = [];

  const rawWorkBlocks: ConstraintBlock[] =
    (userType === 'worker' || userType === 'worker_student')
      ? buildWorkBlocks(schedType, profile, scheduleEvents, todayScheduleEntry, dateStr, dayOfWeek)
      : [];

  const rawStudyBlocks: ConstraintBlock[] =
    (userType === 'student' || userType === 'worker_student')
      ? buildStudyBlocks(schedType, scheduleEvents, todayScheduleEntry, dateStr, dayOfWeek)
      : [];

  // ── 5. Merge + overlap resolution ───────────────────────────────────────────
  let mergedConstraints: ConstraintBlock[];

  if (userType === 'worker_student') {
    // Sort combined set, then resolve any overlaps deterministically.
    const combined = [...rawWorkBlocks, ...rawStudyBlocks].sort(byStart);
    mergedConstraints = resolveOverlaps(combined, overlapWarnings);
  } else {
    // Single-type user — just sort (no overlap possible from same source)
    mergedConstraints = [...rawWorkBlocks, ...rawStudyBlocks].sort(byStart);
  }

  // ── 6. Append recovery blocks ────────────────────────────────────────────────
  // Recovery blocks are clamped to not overlap the next constraint block.
  const recoveryBlocks = buildRecoveryBlocks(mergedConstraints);

  // ── 7. Final merged set sorted by start time ─────────────────────────────────
  const allBlocks = [...mergedConstraints, ...recoveryBlocks].sort(byStart);

  return {
    workBlocks: mergedConstraints,
    recoveryBlocks,
    allBlocks,
    activeRecurringTasks,
    isOffDay,
    overlapWarnings,
  };
}

// ─── Work block builder ────────────────────────────────────────────────────────

/**
 * Schedule-type-aware priority chain:
 *
 * daily_input
 *   A. todayScheduleEntry (if date matches) → use it exclusively; no fallback
 *      — if entry absent: return [] (system will prompt user for today's hours)
 *      — noWorkToday = true: return []
 *
 * weekly_known
 *   A. Explicit manual override for TODAY (todayScheduleEntry.date === today)
 *   B. Recurring ScheduleEvents with category 'work' for this day
 *   C. profile.fixedScheduleStart/End (only if nothing stronger exists)
 *
 * fixed
 *   A. Recurring ScheduleEvents with category 'work'
 *   B. profile.fixedScheduleStart/End fallback
 *
 * In all cases: noWorkToday on a date-specific entry is an explicit suppression
 * that takes priority over everything else for that date.
 */
function buildWorkBlocks(
  schedType: ScheduleType,
  profile: UserProfile | null,
  scheduleEvents: ScheduleEvent[],
  todayEntry: DailyScheduleEntry | null,
  dateStr: string,
  dayOfWeek: number,
): ConstraintBlock[] {
  const entryIsForToday = todayEntry?.date === dateStr;
  const entryHasWork    = !!todayEntry?.workStart && !!todayEntry?.workEnd;
  const entryNoWork     = entryIsForToday && !!todayEntry!.noWorkToday;

  // ── daily_input: explicit entry only — no fallback to recurring/profile ───────
  if (schedType === 'daily_input') {
    if (!entryIsForToday) return [];   // entry not yet provided; caller should prompt
    if (entryNoWork)      return [];   // user said "no work today"
    if (entryHasWork)     return [makeWorkBlock(todayEntry!.workStart!, todayEntry!.workEnd!, [dayOfWeek])];
    return [];                         // entry exists but no work hours set
  }

  // ── For weekly_known / fixed: noWorkToday override suppresses all sources ─────
  if (entryNoWork) return [];

  // ── weekly_known Priority A: explicit manual override for today ───────────────
  if (schedType === 'weekly_known' && entryIsForToday && entryHasWork) {
    return [makeWorkBlock(todayEntry!.workStart!, todayEntry!.workEnd!, [dayOfWeek])];
  }

  // ── Priority B: recurring ScheduleEvents (both weekly_known + fixed) ──────────
  const workEvents = scheduleEvents.filter(
    (e) => e.category === 'work' && e.recurring && e.daysOfWeek.includes(dayOfWeek),
  );
  if (workEvents.length > 0) {
    return workEvents.map((e) => makeWorkBlock(e.start, e.end, [dayOfWeek]));
  }

  // ── Priority C: profile fixedSchedule fallback ────────────────────────────────
  // Only applies when scheduleType = 'fixed'; never used for weekly_known since
  // recurring ScheduleEvents (B) should always be present for weekly_known users.
  if (profile?.fixedScheduleStart && profile?.fixedScheduleEnd) {
    return [makeWorkBlock(profile.fixedScheduleStart, profile.fixedScheduleEnd, [dayOfWeek])];
  }

  return [];
}

// ─── Study block builder ───────────────────────────────────────────────────────

/**
 * Same schedule-type-aware chain as buildWorkBlocks, but for class/study:
 *
 * daily_input  — todayScheduleEntry only; no fallback
 * weekly_known — A: explicit override today, B: class ScheduleEvents
 * fixed        — A: class ScheduleEvents (no profile fallback for study)
 *
 * noWorkToday suppresses study blocks for that date across all schedule types.
 */
function buildStudyBlocks(
  schedType: ScheduleType,
  scheduleEvents: ScheduleEvent[],
  todayEntry: DailyScheduleEntry | null,
  dateStr: string,
  dayOfWeek: number,
): ConstraintBlock[] {
  const entryIsForToday = todayEntry?.date === dateStr;
  const entryHasStudy   = !!todayEntry?.studyStart && !!todayEntry?.studyEnd;
  const entryNoWork     = entryIsForToday && !!todayEntry!.noWorkToday;

  // ── daily_input: explicit entry only — no fallback ───────────────────────────
  if (schedType === 'daily_input') {
    if (!entryIsForToday) return [];
    if (entryNoWork)      return [];
    if (entryHasStudy)    return [makeStudyBlock(todayEntry!.studyStart!, todayEntry!.studyEnd!, [dayOfWeek])];
    return [];
  }

  // ── noWorkToday override suppresses study blocks for weekly_known / fixed ─────
  if (entryNoWork) return [];

  // ── weekly_known Priority A: explicit manual override for today ───────────────
  if (schedType === 'weekly_known' && entryIsForToday && entryHasStudy) {
    return [makeStudyBlock(todayEntry!.studyStart!, todayEntry!.studyEnd!, [dayOfWeek])];
  }

  // ── Priority B: recurring ScheduleEvents (both weekly_known + fixed) ──────────
  const classEvents = scheduleEvents.filter(
    (e) => e.category === 'class' && e.recurring && e.daysOfWeek.includes(dayOfWeek),
  );
  if (classEvents.length > 0) {
    return classEvents.map((e) => makeStudyBlock(e.start, e.end, [dayOfWeek]));
  }

  // No profile fallback for study (no fixedStudyStart/End equivalent in profile)
  return [];
}

// ─── Overlap resolution ────────────────────────────────────────────────────────

/**
 * Deterministic overlap resolution for worker_student mode.
 *
 * Rules:
 *   1. Sort blocks by startTime (already done by caller).
 *   2. For each block, check if it overlaps the previous output block.
 *   3. If block2 is fully contained in block1 → skip block2, emit warning.
 *   4. If block2 partially overlaps block1 → delay block2 to start at block1.endTime.
 *   5. A block delayed to start at or after its own original endTime is also skipped.
 *
 * The "preserve locked constraint" rule means we never shorten block1 —
 * we always adjust block2 forward.
 */
function resolveOverlaps(
  sorted: ConstraintBlock[],
  warnings: OverlapWarning[],
): ConstraintBlock[] {
  if (sorted.length <= 1) return sorted;

  const result: ConstraintBlock[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];

    if (curr.startTime >= prev.endTime) {
      // No overlap — accept as-is
      result.push(curr);
      continue;
    }

    // ── Overlap detected ──────────────────────────────────────────────────────

    if (curr.endTime <= prev.endTime) {
      // curr is fully contained inside prev — skip it
      warnings.push({
        block1Id: prev.id,
        block1Label: prev.label,
        block2Id: curr.id,
        block2Label: curr.label,
        resolution: 'block2_skipped',
        originalBlock2Start: curr.startTime,
        adjustedBlock2Start: prev.endTime,
      });
      continue;
    }

    // Partial overlap — delay curr to start immediately after prev ends
    const adjustedStart = prev.endTime;

    // If delaying makes curr's duration zero or negative, skip it
    if (adjustedStart >= curr.endTime) {
      warnings.push({
        block1Id: prev.id,
        block1Label: prev.label,
        block2Id: curr.id,
        block2Label: curr.label,
        resolution: 'block2_skipped',
        originalBlock2Start: curr.startTime,
        adjustedBlock2Start: adjustedStart,
      });
      continue;
    }

    warnings.push({
      block1Id: prev.id,
      block1Label: prev.label,
      block2Id: curr.id,
      block2Label: curr.label,
      resolution: 'block2_delayed',
      originalBlock2Start: curr.startTime,
      adjustedBlock2Start: adjustedStart,
    });

    result.push({ ...curr, id: generateId(), startTime: adjustedStart });
  }

  return result;
}

// ─── Recovery block builder ────────────────────────────────────────────────────

/**
 * Append a recovery block after each qualifying constraint block.
 *
 * Recovery blocks are:
 *   - Returned as real ConstraintBlock records (visible in timeline + behaviorState)
 *   - Clamped to not overlap the next constraint block (safe truncation)
 *   - Silently dropped when the next constraint starts immediately (back-to-back shifts)
 *
 * Recovery durations (from ConstraintBlock.recoveryDurationMins):
 *   work  → 60 min (meal + rest)
 *   class → 30 min (recharge)
 */
function buildRecoveryBlocks(constraints: ConstraintBlock[]): ConstraintBlock[] {
  const recovery: ConstraintBlock[] = [];

  for (let i = 0; i < constraints.length; i++) {
    const block = constraints[i];
    if (!block.requiresRecoveryAfter || block.recoveryDurationMins <= 0) continue;

    const recStartMins = toMins(block.endTime);
    let   recEndMins   = recStartMins + block.recoveryDurationMins;

    // Clamp: do not overlap the next constraint block
    const nextBlock = constraints[i + 1] ?? null;
    if (nextBlock) {
      const nextStartMins = toMins(nextBlock.startTime);
      if (recEndMins > nextStartMins) {
        recEndMins = nextStartMins;
      }
    }

    // Drop silently if constraints are back-to-back (zero recovery time)
    if (recEndMins <= recStartMins) continue;

    const isWork          = block.type === 'work';
    const recoveryLabel   = isWork
      ? i18n.t('recovery.meal_after_work')
      : i18n.t('recovery.recharge');
    const recoveryType: RecoveryType = isWork ? 'meal_recovery' : 'recharge';

    recovery.push({
      id: generateId(),
      // 'appointment' is used for recovery blocks — ConstraintBlock.type does not
      // have a 'recovery' member yet. The planning engine identifies recovery blocks
      // by recoveryType being non-null on a post-constraint slot.
      type: 'appointment',
      label: recoveryLabel,
      startTime: fromMins(recStartMins),
      endTime:   fromMins(recEndMins),
      daysOfWeek: block.daysOfWeek,
      requiresRecoveryAfter: false,
      recoveryDurationMins:  0,
      recoveryType,
    });
  }

  return recovery;
}

// ─── Recurring task filter ─────────────────────────────────────────────────────

/**
 * Returns the subset of recurring tasks active on `dayOfWeek`.
 *
 * A task is excluded when:
 *   1. `task.daysOfWeek` is non-empty and does not include `dayOfWeek`
 *   2. Today is an off-day AND `skipTasksOnOffDays = true` AND `task.skipOnOffDays = true`
 *
 * Empty `task.daysOfWeek` means "every day" — task is never excluded by rule 1.
 */
function filterRecurringTasks(
  tasks: RecurringTask[],
  dayOfWeek: number,
  isOffDay: boolean,
  skipTasksOnOffDays: boolean,
): RecurringTask[] {
  return tasks.filter((task) => {
    // Rule 1: day-of-week filter
    const activeDays = task.daysOfWeek.length > 0 ? task.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
    if (!activeDays.includes(dayOfWeek)) return false;

    // Rule 2: off-day suppression
    if (isOffDay && skipTasksOnOffDays && task.skipOnOffDays) return false;

    return true;
  });
}

// ─── Factory helpers ───────────────────────────────────────────────────────────

function makeWorkBlock(
  startTime: string,
  endTime: string,
  daysOfWeek: number[],
): ConstraintBlock {
  return {
    id: generateId(),
    type: 'work',
    label: i18n.t('schedule.work_block_label'),
    startTime,
    endTime,
    daysOfWeek,
    requiresRecoveryAfter: true,
    recoveryDurationMins:  60,
    recoveryType:          'meal_recovery',
  };
}

function makeStudyBlock(
  startTime: string,
  endTime: string,
  daysOfWeek: number[],
): ConstraintBlock {
  return {
    id: generateId(),
    type: 'class',
    label: i18n.t('schedule.study_block_label'),
    startTime,
    endTime,
    daysOfWeek,
    requiresRecoveryAfter: true,
    recoveryDurationMins:  30,
    recoveryType:          'recharge',
  };
}

// ─── Resolution helpers ────────────────────────────────────────────────────────

/**
 * Derive UserType from profile, falling back to a safe default.
 * Bridges legacy UserMode values to the new UserType union.
 */
function resolveUserType(profile: UserProfile | null): UserType {
  if (!profile) return 'flexible';

  // v3 field takes precedence
  if (profile.userType) return profile.userType;

  // Legacy UserMode → UserType bridge
  if (profile.userMode === 'employee') return 'worker';
  if (profile.userMode === 'student')  return 'student';

  // If the user has a fixed window set, treat as worker (legacy onboarding)
  if (profile.fixedScheduleStart && profile.fixedScheduleEnd) return 'worker';

  return 'flexible';
}

function resolveScheduleType(profile: UserProfile | null): ScheduleType {
  return profile?.scheduleType ?? 'fixed';
}

// ─── Time utilities (local — not exported to avoid duplication) ───────────────

/** "HH:MM" → total minutes from midnight */
function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

/** Total minutes from midnight → "HH:MM" */
function fromMins(mins: number): string {
  const clamped = Math.max(0, Math.min(mins, 23 * 60 + 59));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parse day-of-week (0=Sun…6=Sat) from a YYYY-MM-DD string. */
function parseDayOfWeek(dateStr: string): number {
  // Append noon to avoid timezone shifts on date-only strings
  const d = new Date(`${dateStr}T12:00:00`);
  if (isNaN(d.getTime())) return 0;  // guard: malformed dateStr → Sunday fallback
  return d.getDay();
}

/** Comparator for sorting ConstraintBlocks by startTime ascending. */
function byStart(a: ConstraintBlock, b: ConstraintBlock): number {
  return a.startTime.localeCompare(b.startTime);
}

/** Empty result helper. */
function empty(
  activeRecurringTasks: RecurringTask[],
  isOffDay: boolean,
): TodayConstraintsResult {
  return {
    workBlocks:           [],
    recoveryBlocks:       [],
    allBlocks:            [],
    activeRecurringTasks,
    isOffDay,
    overlapWarnings:      [],
  };
}
