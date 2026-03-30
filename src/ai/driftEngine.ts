/**
 * LifeOS Drift Engine
 *
 * Detects when the user is falling off their plan and surfaces explicit,
 * actionable drift signals to the UI.
 *
 * Responsibilities:
 *   - computeDayMode()      — visible mode strip on Home (ON_TRACK → CRITICAL)
 *   - computeDriftEvent()   — single dominant drift event with recovery options
 *   - computeWhyThisNow()   — per-NowAction explanation card
 *
 * Design:
 *   - Pure logic. No React, no store, no side effects.
 *   - Uses existing PressureInfo, BehaviorState, and DailyDecision.
 *   - Returns the SINGLE most important drift event, not a list.
 */

import { timeToMins } from './planGenerator';
import type {
  PlanItem,
  PressureInfo,
  BehaviorState,
  DailyDecision,
  Goal,
  DistractionLog,
  DayMode,
  DriftType,
  DriftEvent,
  WhyThisNow,
  RecoveryMode,
} from '../types';

// ─── Day Mode ──────────────────────────────────────────────────────────────────

/**
 * Computes the single visible day mode shown on the Home status strip.
 *
 * Priority order (highest wins):
 *   CRITICAL  — pressureGrade ≥ 3 OR driftLevel ≥ 3 OR driftScore ≥ 70
 *   RECOVERY  — in active recovery block OR decision.isInRecoveryMode
 *   DRIFTING  — pressureGrade ≥ 2 OR driftLevel ≥ 2 OR driftScore ≥ 40 OR taskSkipCount ≥ 3
 *   ON_TRACK  — default
 */
export function computeDayMode(
  pressure: PressureInfo,
  behaviorState: BehaviorState,
  dailyDecision: DailyDecision | null,
  taskSkipCount: number,
): DayMode {
  const driftScore = dailyDecision?.driftScore ?? 0;

  if (
    pressure.grade >= 3 ||
    behaviorState.driftLevel >= 3 ||
    driftScore >= 70
  ) {
    return 'CRITICAL';
  }

  if (
    behaviorState.dayState === 'in_recovery' ||
    dailyDecision?.isInRecoveryMode === true
  ) {
    return 'RECOVERY';
  }

  if (
    pressure.grade >= 2 ||
    behaviorState.driftLevel >= 2 ||
    driftScore >= 40 ||
    taskSkipCount >= 3
  ) {
    return 'DRIFTING';
  }

  return 'ON_TRACK';
}

// ─── Drift Event Detection ─────────────────────────────────────────────────────

interface DriftInput {
  pressure: PressureInfo;
  behaviorState: BehaviorState;
  planItems: PlanItem[];
  dailyDecision: DailyDecision | null;
  distractionLogs: DistractionLog[];
  taskSkipCount: number;
  nowMins: number;
  today: string;
}

/**
 * Returns the single most-relevant drift event, or null if user is on track.
 *
 * Only one drift event is shown at a time — the most urgent pattern.
 * Priority:
 *   1. overload      — time constraint is physically impossible
 *   2. late_start    — app opened late with uncompleted past blocks
 *   3. avoidance     — repeated skipping pattern
 *   4. distraction   — high distraction count or prolonged inactivity
 *   5. fragmented_day— low coherence, mixed skips
 */
export function computeDriftEvent(input: DriftInput): DriftEvent | null {
  const {
    pressure,
    behaviorState,
    planItems,
    dailyDecision,
    distractionLogs,
    taskSkipCount,
    nowMins,
    today,
  } = input;

  const todayDistractions = distractionLogs.filter(
    (d) => d.timestamp.startsWith(today),
  ).length;

  const actionable = planItems.filter(
    (i) => !i.completed && (i.type === 'goal' || i.type === 'skill'),
  );
  const completed = planItems.filter(
    (i) => i.completed && (i.type === 'goal' || i.type === 'skill'),
  );

  // ── 1. OVERLOAD — timeRatio severely exceeded ───────────────────────────────
  if (pressure.timeRatio > 1.3 && pressure.remainingMins > 0) {
    const overMinutes = Math.round(
      (pressure.requiredMins - pressure.remainingMins),
    );
    return _makeDrift('overload', overMinutes >= 60 ? 'high' : 'medium', {
      messageKey: 'home.drift_overload_message',
      detailKey: 'home.drift_overload_detail',
      recoveryOptions: ['compress_day', 'critical_only', 'save_day'],
    }, today);
  }

  // ── 2. LATE START — expired plan blocks exist ───────────────────────────────
  if (behaviorState.dayState === 'late_start' || behaviorState.lateStartDetectedAt) {
    const expiredCount = planItems.filter(
      (i) =>
        !i.completed &&
        (i.type === 'goal' || i.type === 'skill') &&
        timeToMins(i.endTime) < nowMins,
    ).length;
    if (expiredCount > 0) {
      return _makeDrift('late_start', expiredCount >= 3 ? 'high' : 'medium', {
        messageKey: 'home.drift_late_start_message',
        detailKey: 'home.drift_late_start_detail',
        recoveryOptions: ['resume_now', 'save_day', 'critical_only'],
      }, today);
    }
  }

  // ── 3. AVOIDANCE — repeated skipping ────────────────────────────────────────
  if (taskSkipCount >= 2) {
    return _makeDrift('avoidance', taskSkipCount >= 4 ? 'high' : 'medium', {
      messageKey: 'home.drift_avoidance_message',
      detailKey: 'home.drift_avoidance_detail',
      recoveryOptions: ['critical_only', 'resume_now', 'save_day'],
    }, today);
  }

  // ── 4. DISTRACTION — high log count or prolonged inactivity ─────────────────
  if (todayDistractions >= 3 || behaviorState.driftLevel >= 3) {
    return _makeDrift('distraction', todayDistractions >= 5 ? 'high' : 'medium', {
      messageKey: 'home.drift_distraction_message',
      detailKey: 'home.drift_distraction_detail',
      recoveryOptions: ['resume_now', 'critical_only'],
    }, today);
  }

  // ── 5. FRAGMENTED DAY — low coherence mid-day ───────────────────────────────
  const totalActionable = completed.length + actionable.length;
  const completionRate = totalActionable > 0 ? completed.length / totalActionable : 1;
  const isMidDay = nowMins >= 720 && nowMins <= 1020; // 12:00 – 17:00
  if (isMidDay && completionRate < 0.25 && taskSkipCount >= 1 && totalActionable >= 3) {
    return _makeDrift('fragmented_day', 'medium', {
      messageKey: 'home.drift_fragmented_message',
      detailKey: 'home.drift_fragmented_detail',
      recoveryOptions: ['save_day', 'critical_only', 'resume_now'],
    }, today);
  }

  // ── No drift ─────────────────────────────────────────────────────────────────
  return null;
}

/**
 * Returns true when a persisted drift event belongs to a previous calendar day.
 * Pure function — no store access. Used by tickBehavior and applyRecoveryAction.
 */
export function isDriftStale(drift: DriftEvent, today: string): boolean {
  return drift.date !== today;
}

function _makeDrift(
  type: DriftType,
  severity: DriftEvent['severity'],
  opts: {
    messageKey: string;
    detailKey: string;
    recoveryOptions: RecoveryMode[];
  },
  today: string,
): DriftEvent {
  return {
    type,
    detectedAt: new Date().toISOString(),
    date: today,
    severity,
    messageKey: opts.messageKey,
    detailKey: opts.detailKey,
    recoveryOptions: opts.recoveryOptions,
    dismissed: false,
  };
}

// ─── Why-This-Now ─────────────────────────────────────────────────────────────

/**
 * Computes the explanation shown below the NowAction card.
 * Answers: why this task, why now, what is at risk.
 *
 * Derives from:
 *   - goal priority + deadline urgency
 *   - daily decision must-do / at-risk
 *   - current pressure level
 *   - isCritical flag
 */
export function computeWhyThisNow(
  item: PlanItem | null,
  goals: Goal[],
  dailyDecision: DailyDecision | null,
  pressure: PressureInfo,
): WhyThisNow | null {
  if (!item) return null;

  const goal = goals.find((g) => g.id === item.goalId);
  const isCritical = !!item.isCritical;
  const isMustDo = dailyDecision?.mustDoItems.includes(item.title) ?? false;

  const isAtRiskGoal = goal
    ? (dailyDecision?.atRiskGoals.some((r) => r.goalId === goal.id) ?? false)
    : false;

  // Deadline urgency
  let daysUntilDeadline: number | null = null;
  if (goal?.deadline) {
    const now = new Date();
    const dl = new Date(goal.deadline);
    daysUntilDeadline = Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  const hasUrgentDeadline = daysUntilDeadline !== null && daysUntilDeadline <= 7;
  const urgencyLevel: WhyThisNow['urgencyLevel'] =
    isCritical || pressure.grade >= 3 ? 'critical' :
    isMustDo || isAtRiskGoal || hasUrgentDeadline ? 'high' :
    'normal';

  // Pick reason key
  let reason: string;
  if (isCritical) {
    reason = 'home.why_critical_task';
  } else if (hasUrgentDeadline && daysUntilDeadline !== null) {
    reason = daysUntilDeadline <= 2
      ? 'home.why_deadline_imminent'
      : 'home.why_deadline_soon';
  } else if (isMustDo) {
    reason = 'home.why_must_do';
  } else if (isAtRiskGoal) {
    reason = 'home.why_at_risk_goal';
  } else if (pressure.grade >= 2) {
    reason = 'home.why_pressure_high';
  } else {
    reason = 'home.why_highest_priority';
  }

  // Pick risk key
  let risk: string;
  if (isCritical) {
    risk = 'home.risk_critical_skip';
  } else if (isAtRiskGoal) {
    risk = 'home.risk_goal_behind';
  } else if (hasUrgentDeadline) {
    risk = 'home.risk_deadline_miss';
  } else if (pressure.grade >= 2) {
    risk = 'home.risk_day_lost';
  } else {
    risk = 'home.risk_momentum_broken';
  }

  return {
    reason,
    risk,
    goalTitle: goal?.title,
    urgencyLevel,
  };
}
