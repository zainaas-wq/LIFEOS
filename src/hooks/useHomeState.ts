/**
 * useHomeState — consolidated state hook for HomeScreen.
 *
 * Batch 21: Release prep / refactor.
 *
 * Extracts the 29 individual useAppStore selector calls + all derived/computed
 * values from HomeScreen into a single named hook. This reduces HomeScreen to a
 * render-only component and makes the data contract explicit.
 *
 * Design:
 *   - Store slice: one useAppStore call with shallow comparison (Zustand v4 pattern).
 *   - nowMins: owned here (60-second interval timer), avoids a timer in the component.
 *   - Memos: all computed values that depend only on store state + today + nowMins.
 *   - Local UI state (flashMsg, dismissedRisk, etc.) intentionally stays in the component.
 *
 * Render safety:
 *   - shallow prevents re-renders when unrelated store fields change.
 *   - Each memo has the correct dependency array — behavior is identical to the
 *     inline memos that previously lived in HomeScreen.
 */

import { useState, useEffect, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../store/useAppStore';
import { useEntitlements } from '../services/entitlementService';
import {
  computeDayProgress,
  computePressure,
  type PressureLevel,
  type PressureGrade,
} from '../ai/executionEngine';
import { enrichPlanItemsWithStudentLabels } from '../ai/studentScheduler';
import { buildMorningLaunch, buildNightShutdown } from '../ai/ritualEngine';
import { computeAdaptationHints } from '../ai/adaptationEngine';
import { predictDrift } from '../ai/predictiveEngine';
import { computeOutcomeTrend } from '../ai/outcomeEngine';
import { computeStreakData, buildReentryMessage, buildCommitmentSignal } from '../ai/retentionEngine';
import { timeToMins } from '../ai/planGenerator';
import { computeSubscriptionState } from '../lib/trialUtils';
import { getTodayDate } from '../lib/utils';
import type {
  UserProfile,
  DailyReview,
  Goal,
  ControlDailyPlan,
  ActiveFocusSession,
  DailyScheduleEntry,
  FocusSession,
  DayMode,
  DriftEvent,
  DailyDecision,
  PlanItem,
  RecoveryMode,
} from '../types';

// ─── Public interface ─────────────────────────────────────────────────────────

export interface HomeState {
  // ── Store state ────────────────────────────────────────────────────────────
  profile:                UserProfile | null;
  dailyReviews:           DailyReview[];
  goals:                  Goal[];
  controlPlan:            ControlDailyPlan | null;
  activeFocus:            ActiveFocusSession | null;
  taskSkipCount:          number;
  skippedPlanItemIds:     string[];
  dayStreak:              number;
  trialStartDate:         string | null;
  isPro:                  boolean;
  todayScheduleEntry:     DailyScheduleEntry | null;
  focusSessions:          FocusSession[];
  dayMode:                DayMode | null;
  activeDrift:            DriftEvent | null;
  dailyDecision:          DailyDecision | null;

  // ── Store actions ──────────────────────────────────────────────────────────
  setTodayScheduleEntry:    (entry: DailyScheduleEntry) => void;
  endRecoveryEarly:         (id: string) => void;
  recordInteraction:        () => void;
  startFocus:               (session: Parameters<ReturnType<typeof useAppStore>['startFocus']>[0]) => void;
  endFocus:                 () => void;
  toggleControlPlanItem:    (id: string) => void;
  skipNowAction:            () => void;
  skipItem:                 (id: string) => void;
  generateControlPlanAction:(date: string) => void;
  completeHabitToday:       (id: string, date: string) => void;
  restartDay:               () => void;
  dismissActiveDrift:       () => void;
  applyRecoveryAction:      (mode: RecoveryMode) => void;

  // ── Time ──────────────────────────────────────────────────────────────────
  today:                  string;
  nowMins:                number;
  hourFromNow:            number;

  // ── Subscription ──────────────────────────────────────────────────────────
  subState:               ReturnType<typeof computeSubscriptionState>;
  isProUser:              boolean;

  // ── Plan / execution ───────────────────────────────────────────────────────
  planItems:              PlanItem[];
  enrichedItems:          PlanItem[];
  progress:               ReturnType<typeof computeDayProgress>;
  todayFocusMins:         number;
  pressureInfo:           ReturnType<typeof computePressure>;
  pressure:               PressureLevel;
  pressureGrade:          PressureGrade;
  isBuilding:             boolean;
  nextBestAction:         PlanItem | null;
  isAiPlan:               boolean;

  // ── Ritual cards ──────────────────────────────────────────────────────────
  morningLaunch:          ReturnType<typeof buildMorningLaunch>;
  nightShutdown:          ReturnType<typeof buildNightShutdown>;

  // ── Predictive ────────────────────────────────────────────────────────────
  topPrediction:          ReturnType<typeof predictDrift>[number] | null;

  // ── Outcome / retention ───────────────────────────────────────────────────
  outcomeTrend:           ReturnType<typeof computeOutcomeTrend>;
  streakData:             ReturnType<typeof computeStreakData>;
  reentryMessage:         string | null;
  hints:                  ReturnType<typeof computeAdaptationHints>;
  commitmentSignal:       ReturnType<typeof buildCommitmentSignal>;

  // ── Navigation helpers ─────────────────────────────────────────────────────
  lateStartItem:          PlanItem | null;
  effectiveItem:          PlanItem | null;
  isCurrentConstraint:    boolean;
  nextItem:               PlanItem | null;
  allSkipped:             boolean;

  // ── Schedule prompt ────────────────────────────────────────────────────────
  needsScheduleEntry:     boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHomeState(): HomeState {
  const today = getTodayDate();

  // ── nowMins — ticks every 60 s ──────────────────────────────────────────────
  const [nowMins, setNowMins] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowMins(d.getHours() * 60 + d.getMinutes());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const hourFromNow = Math.floor(nowMins / 60);

  // ── Store slice — single subscription, shallow equality ────────────────────
  const slice = useAppStore(
    (s) => ({
      // state
      profile:                 s.profile,
      dailyReviews:            s.dailyReviews,
      goals:                   s.goals,
      controlPlan:             s.controlPlan,
      activeFocus:             s.activeFocus,
      taskSkipCount:           s.taskSkipCount,
      skippedPlanItemIds:      s.skippedPlanItemIds,
      dayStreak:               s.dayStreak,
      trialStartDate:          s.trialStartDate,
      isPro:                   s.profile?.isPro ?? false,
      todayScheduleEntry:      s.todayScheduleEntry,
      focusSessions:           s.focusSessions,
      dayMode:                 s.dayMode,
      activeDrift:             s.activeDrift,
      dailyDecision:           s.dailyDecision,
      // actions (stable refs — shallow always equal)
      setTodayScheduleEntry:    s.setTodayScheduleEntry,
      endRecoveryEarly:         s.endRecoveryEarly,
      recordInteraction:        s.recordInteraction,
      startFocus:               s.startFocus,
      endFocus:                 s.endFocus,
      toggleControlPlanItem:    s.toggleControlPlanItem,
      skipNowAction:            s.skipNowAction,
      skipItem:                 s.skipItem,
      generateControlPlanAction: s.generateControlPlanAction,
      completeHabitToday:       s.completeHabitToday,
      restartDay:               s.restartDay,
      dismissActiveDrift:       s.dismissActiveDrift,
      applyRecoveryAction:      s.applyRecoveryAction,
    }),
    shallow,
  );

  // ── Pro entitlements ───────────────────────────────────────────────────────
  const { isPro: isProUser } = useEntitlements();

  // ── Subscription state ─────────────────────────────────────────────────────
  const subState = computeSubscriptionState(slice.trialStartDate, slice.isPro);

  // ── Plan items ─────────────────────────────────────────────────────────────
  const planItems = slice.controlPlan?.plan.items ?? [];

  const enrichedItems = useMemo(
    () => enrichPlanItemsWithStudentLabels(planItems, slice.goals, today),
    [planItems, slice.goals, today],
  );

  const progress = useMemo(
    () => computeDayProgress(enrichedItems),
    [enrichedItems],
  );

  const todayFocusMins = useMemo(
    () =>
      slice.focusSessions
        .filter((fs) => fs.start.startsWith(today) && !!fs.end)
        .reduce((sum, fs) => sum + (fs.durationMinutes ?? 0), 0),
    [slice.focusSessions, today],
  );

  // ── Pressure ───────────────────────────────────────────────────────────────
  const pressureInfo = useMemo(
    () =>
      computePressure(
        slice.taskSkipCount,
        nowMins,
        enrichedItems,
        timeToMins(slice.profile?.fixedScheduleEnd ?? '22:00'),
      ),
    [slice.taskSkipCount, nowMins, enrichedItems, slice.profile?.fixedScheduleEnd],
  );
  const pressure      = pressureInfo.level;
  const pressureGrade = pressureInfo.grade;

  const isBuilding     = !slice.controlPlan || slice.controlPlan.date !== today;
  const nextBestAction = slice.controlPlan?.nextBestAction ?? null;
  const isAiPlan       = slice.controlPlan?.plan.source === 'ai';

  // ── Ritual cards ───────────────────────────────────────────────────────────
  const morningLaunch = useMemo(() => {
    if (!slice.controlPlan || isBuilding || hourFromNow >= 11) return null;
    const hints = computeAdaptationHints(slice.dailyReviews);
    return buildMorningLaunch(slice.controlPlan, slice.dailyReviews, hints);
  }, [slice.controlPlan, isBuilding, hourFromNow, slice.dailyReviews]);

  const nightShutdown = useMemo(() => {
    if (!slice.controlPlan || isBuilding || hourFromNow < 19 || progress.total === 0) return null;
    return buildNightShutdown(slice.controlPlan, todayFocusMins);
  }, [slice.controlPlan, isBuilding, hourFromNow, progress.total, todayFocusMins]);

  // ── Predictive warning ─────────────────────────────────────────────────────
  const topPrediction = useMemo(() => {
    if (!slice.controlPlan || isBuilding) return null;
    const hints = computeAdaptationHints(slice.dailyReviews);
    const preds = predictDrift(slice.controlPlan, slice.dailyReviews, hints, nowMins);
    const visible = preds.filter((p) => p.confidence !== 'low');
    return visible[0] ?? null;
  }, [slice.controlPlan, isBuilding, slice.dailyReviews, nowMins]);

  // ── Outcome / retention ────────────────────────────────────────────────────
  const outcomeTrend = useMemo(
    () => computeOutcomeTrend(slice.dailyReviews, isProUser ? 30 : 7),
    [slice.dailyReviews, isProUser],
  );

  const streakData = useMemo(
    () => computeStreakData(slice.dailyReviews, today),
    [slice.dailyReviews, today],
  );

  const reentryMessage = streakData.missedDays >= 1
    ? buildReentryMessage(streakData.missedDays)
    : null;

  const hints = useMemo(
    () => computeAdaptationHints(slice.dailyReviews),
    [slice.dailyReviews],
  );

  const commitmentSignal = useMemo(
    () => buildCommitmentSignal(slice.dailyReviews, hints, streakData.currentStreak),
    [slice.dailyReviews, hints, streakData.currentStreak],
  );

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const lateStartItem = useMemo(() => {
    if (nextBestAction || isBuilding) return null;
    return (
      enrichedItems
        .filter((i) => !i.completed && (i.type === 'goal' || i.type === 'skill'))
        .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime))[0] ?? null
    );
  }, [nextBestAction, isBuilding, enrichedItems]);

  const effectiveItem = nextBestAction ?? lateStartItem;

  const isCurrentConstraint =
    !!effectiveItem &&
    effectiveItem.source === 'constraint' &&
    effectiveItem.blockKind === 'constraint';

  const nextItem = useMemo(() => {
    if (!effectiveItem) return null;
    const idx = enrichedItems.findIndex((i) => i.id === effectiveItem.id);
    if (idx === -1) return null;
    return (
      enrichedItems
        .slice(idx + 1)
        .find((i) => !i.completed && (i.type === 'goal' || i.type === 'skill')) ?? null
    );
  }, [effectiveItem, enrichedItems]);

  const allSkipped = useMemo(() => {
    if (nextBestAction || isBuilding) return false;
    const actionable = enrichedItems.filter(
      (i) => (i.type === 'goal' || i.type === 'skill') && !i.completed,
    );
    return actionable.length > 0 && actionable.every((i) => slice.skippedPlanItemIds.includes(i.id));
  }, [nextBestAction, isBuilding, enrichedItems, slice.skippedPlanItemIds]);

  // ── Schedule entry gate ────────────────────────────────────────────────────
  const todayDOW       = new Date(today).getDay();
  const isOffDay       = (slice.profile?.offDays ?? []).includes(todayDOW);
  const entryIsForToday = slice.todayScheduleEntry?.date === today;
  const needsScheduleEntry =
    slice.profile?.scheduleType === 'daily_input' &&
    !entryIsForToday &&
    !isOffDay &&
    !!slice.profile?.userType &&
    slice.profile.userType !== 'flexible';

  return {
    // store state
    profile:                 slice.profile,
    dailyReviews:            slice.dailyReviews,
    goals:                   slice.goals,
    controlPlan:             slice.controlPlan,
    activeFocus:             slice.activeFocus,
    taskSkipCount:           slice.taskSkipCount,
    skippedPlanItemIds:      slice.skippedPlanItemIds,
    dayStreak:               slice.dayStreak,
    trialStartDate:          slice.trialStartDate,
    isPro:                   slice.isPro,
    todayScheduleEntry:      slice.todayScheduleEntry,
    focusSessions:           slice.focusSessions,
    dayMode:                 slice.dayMode,
    activeDrift:             slice.activeDrift,
    dailyDecision:           slice.dailyDecision,
    // actions
    setTodayScheduleEntry:    slice.setTodayScheduleEntry,
    endRecoveryEarly:         slice.endRecoveryEarly,
    recordInteraction:        slice.recordInteraction,
    startFocus:               slice.startFocus,
    endFocus:                 slice.endFocus,
    toggleControlPlanItem:    slice.toggleControlPlanItem,
    skipNowAction:            slice.skipNowAction,
    skipItem:                 slice.skipItem,
    generateControlPlanAction: slice.generateControlPlanAction,
    completeHabitToday:       slice.completeHabitToday,
    restartDay:               slice.restartDay,
    dismissActiveDrift:       slice.dismissActiveDrift,
    applyRecoveryAction:      slice.applyRecoveryAction,
    // time
    today,
    nowMins,
    hourFromNow,
    // subscription
    subState,
    isProUser,
    // plan / execution
    planItems,
    enrichedItems,
    progress,
    todayFocusMins,
    pressureInfo,
    pressure,
    pressureGrade,
    isBuilding,
    nextBestAction,
    isAiPlan,
    // ritual
    morningLaunch,
    nightShutdown,
    // predictive
    topPrediction,
    // outcome / retention
    outcomeTrend,
    streakData,
    reentryMessage,
    hints,
    commitmentSignal,
    // navigation
    lateStartItem,
    effectiveItem,
    isCurrentConstraint,
    nextItem,
    allSkipped,
    // schedule
    needsScheduleEntry,
  };
}
