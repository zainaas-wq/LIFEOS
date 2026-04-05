import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import i18n, { setAppLanguage } from '../i18n';
import type {
  UserProfile,
  Task,
  TimeBlock,
  Constraint,
  Rule,
  DailyPlan,
  DailyReflection,
  ScheduleEvent,
  Goal,
  SkillPlan,
  HabitItem,
  RecurringTask,
  RecurringTaskCategory,
  IdentityGoal,
  IdentityGoalType,
  DailyScheduleEntry,
  BehaviorState,
  DayState,
  FocusSession,
  ActiveFocusSession,
  PlanBlock,
  Plan,
  ChatMessage,
  ControlDailyPlan,
  DistractionLog,
  NudgeItem,
  AlignmentResult,
  MissedTask,
  DailyDecision,
  DayMode,
  DriftEvent,
  DriftRecord,
  RecoveryMode,
  DailyReview,
} from '../types';
import { computeDayMode, computeDriftEvent, isDriftStale } from '../ai/driftEngine';
import { computeDailyReview } from '../ai/reviewEngine';
import * as reviewService from '../services/reviewService';
import { applyRecoveryMode } from '../ai/recoveryActions';
import {
  computeDailyDecision,
  extractMissedTasksFromPlan,
} from '../ai/dailyDecisionEngine';
import {
  buildBehavioralNudge,
  getOverdueMustDo,
} from '../ai/enforcementEngine';
import * as goalsService from '../services/goalsService';
import * as skillPlansService from '../services/skillPlansService';
import * as scheduleService from '../services/scheduleService';
import * as rulesService from '../services/rulesService';
import * as focusService from '../services/focusService';
import * as planService from '../services/planService';
import * as distractionService from '../services/distractionService';
import * as reflectionService from '../services/reflectionService';
import * as progressService from '../services/progressService';
import { computeProgressScore } from '../ai/progressEngine';
import { hydrateFromCloud as cloudHydrate } from '../services/syncService';
import { upsertLocalProfile } from '../services/profileService';
import { generateControlPlan, computeNextBestAction, buildNudgeSchedule } from '../control/controlEngine';
import { computeAdaptationHints } from '../ai/adaptationEngine';
import { computeRecoveryStats } from '../ai/metricsEngine';
import { predictDrift, rankRecoveryModes } from '../ai/predictiveEngine';
import { explainPlanIntensity, buildPredictionContext } from '../ai/decisionExplanationEngine';
import {
  computeWeeklyIntelligence,
  computeMonthlyIntelligence,
  getMomentumState,
  buildStrategicRecommendations,
  buildStrategicCoachSummary,
  getWeekStartForIntelligence,
} from '../ai/intelligenceEngine';
import { computeStreakData } from '../ai/retentionEngine';
import { track } from '../services/analyticsService';
import { computePressure } from '../ai/executionEngine';
import { getTodayConstraints } from '../services/scheduleInputService';
import { timeToMins } from '../ai/planGenerator';
import { parseFixedWindow } from '../ai/planningEngine';
import { rescheduleRemaining } from '../ai/adaptiveRescheduler';
import { generateId, getTodayDate, getLocalDateStr, getYesterday } from '../lib/utils';
import { generateDailyPlan } from '../lib/planGenerator';
import { FREE_PLAN_RULE_LIMIT } from '../lib/rulesEngine';
import { generateWeeklyPlan } from '../lib/weeklyPlanner';
import {
  SEED_PROFILE,
  SEED_SCHEDULE_EVENTS,
  SEED_GOALS,
  SEED_SKILL_PLANS,
  SEED_RULES,
  SEED_FOCUS_SESSIONS,
} from '../data/seedData';

// ─── Store shape ──────────────────────────────────────────────────────────────

interface AppStore {
  // ── Auth ──────────────────────────────────────────────────────────────────
  // session is NOT persisted — Supabase manages token storage via its own
  // AsyncStorage keys. We only keep it in memory for routing and API calls.
  session: Session | null;
  isGuestMode: boolean;

  // ── Profile ───────────────────────────────────────────────────────────────
  profile: UserProfile | null;

  // ── Schedule events ───────────────────────────────────────────────────────
  scheduleEvents: ScheduleEvent[];

  // ── Goals + Skill plans ───────────────────────────────────────────────────
  goals: Goal[];
  skillPlans: SkillPlan[];

  // ── Habits (legacy — kept for backward compat + migration source) ────────
  habits: HabitItem[];

  // ── Recurring Tasks (v3 — replaces habits) ────────────────────────────────
  recurringTasks: RecurringTask[];

  // ── Identity Goals (what user wants to become) ────────────────────────────
  identityGoals: IdentityGoal[];

  // ── Daily schedule entry (for daily_input / weekly_known schedule types) ──
  todayScheduleEntry: DailyScheduleEntry | null;

  // ── Behavior state machine (ephemeral — NOT persisted) ────────────────────
  behaviorState: BehaviorState;

  // ── Rules ─────────────────────────────────────────────────────────────────
  rules: Rule[];

  // ── Focus sessions ────────────────────────────────────────────────────────
  focusSessions: FocusSession[];
  activeFocus: ActiveFocusSession | null;

  // ── Plans (new structured) ────────────────────────────────────────────────
  currentPlan: Plan | null;

  // ── Weekly goal blocks (legacy planner UI) ────────────────────────────────
  weeklyPlan: PlanBlock[];
  weeklyPlanGeneratedAt: string | null;
  weeklyPlanSource: 'local' | 'ai' | null;

  // ── AI chat ───────────────────────────────────────────────────────────────
  chatHistory: ChatMessage[];
  aiApiKey: string;

  // ── Legacy daily tasks/plan ───────────────────────────────────────────────
  tasks: Task[];
  timeBlocks: TimeBlock[];
  constraints: Constraint[];
  plans: DailyPlan[];
  reflections: DailyReflection[];

  // ── Control system ────────────────────────────────────────────────────────
  controlPlan: ControlDailyPlan | null;
  distractionLogs: DistractionLog[];
  activeNudge: NudgeItem | null;

  // ── Behavior engine ───────────────────────────────────────────────────────
  missedTasks: MissedTask[];
  dailyDecision: DailyDecision | null;

  // ── Enforcement layer ─────────────────────────────────────────────────────
  replanSuggested: boolean;
  lastReplanItemId: string | null;         // which item triggered the replan card
  dismissedReplanForItemIds: string[];     // item IDs whose replan was dismissed
  enforcementFiredIds: string[];           // nudge IDs fired today (prevents re-firing)

  // ── Execution engine counters ──────────────────────────────────────────────
  taskSkipCount: number;
  taskStreakCount: number;
  skippedPlanItemIds: string[];  // IDs of items the user explicitly skipped this day

  // ── Seed loaded flag ──────────────────────────────────────────────────────
  seedLoaded: boolean;

  // ── Trial / subscription ──────────────────────────────────────────────────
  trialStartDate: string | null;  // ISO timestamp set once on onboarding completion

  // ── Language ──────────────────────────────────────────────────────────────
  appLanguage: string;       // persisted independently of profile
  languageSelected: boolean; // true once user has explicitly chosen a language

  // ── Streak + retention ────────────────────────────────────────────────────
  dayStreak: number;              // consecutive days with ≥1 completed task
  lastCompletionDate: string | null; // YYYY-MM-DD of last task completion
  totalCompletedTasks: number;    // lifetime completed task count (display only)

  // ── Execution system — day mode + drift ───────────────────────────────────
  /**
   * Visible operational mode for Home screen status strip.
   * Recomputed by tickBehavior on every heartbeat.
   */
  dayMode: DayMode;
  /**
   * The currently active drift event (if any).
   * null when user is on track or after dismissal.
   */
  activeDrift: DriftEvent | null;

  /**
   * The recovery mode currently in effect (set by applyRecoveryAction).
   * Persisted — cleared on plan regen and day boundary.
   */
  activeRecoveryMode: RecoveryMode | null;

  /**
   * ISO timestamp of the last recovery application.
   * Persisted — used as a 3-second dedup guard across foreground/background cycles.
   */
  lastRecoveryAppliedAt: string | null;

  /**
   * Per-day audit log of drift events where recovery was applied.
   * Ephemeral — NOT persisted. Cleared on plan regen and day boundary.
   */
  driftHistory: DriftRecord[];

  // ── AI credits (Batch 11) ─────────────────────────────────────────────────
  /**
   * Current AI credit balance from server (ai_user_credits table).
   * Ephemeral — NOT persisted. Refreshed on session change and after each AI call.
   * null = not yet loaded or guest mode.
   */
  aiBalance: number | null;
  aiBalanceLoading: boolean;

  // ── Review ────────────────────────────────────────────────────────────────

  /**
   * Local history of saved daily reviews.
   * Persisted — bounded to last 30 days. Never grows unbounded.
   */
  dailyReviews: DailyReview[];

  /**
   * Today's pre-built review snapshot (stats only — no user text yet).
   * Ephemeral — NOT persisted. Built by buildTodayReview().
   * Cleared after saveDailyReviewAction() or on hard reset.
   */
  pendingReview: DailyReview | null;

  /** Names of services that failed on the last cloud sync (empty = all good). */
  syncErrors: string[];
  /** True while hydrateFromCloud is in flight. */
  isSyncing: boolean;

  // ── Actions ───────────────────────────────────────────────────────────────

  // AI credits (Batch 11)
  refreshAIBalance: () => Promise<void>;

  // Auth
  setSession: (session: Session | null) => void;
  setGuestMode: (value: boolean) => void;

  // Profile
  setProfile: (profile: UserProfile) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  completeOnboarding: (data: Omit<UserProfile, 'id' | 'onboardingComplete' | 'isPro' | 'createdAt'>) => void;
  setLanguage: (lang: string) => void;

  // Seed
  loadSeedData: () => void;

  // Schedule
  addScheduleEvent: (e: Omit<ScheduleEvent, 'id' | 'createdAt'>) => void;
  updateScheduleEvent: (id: string, patch: Partial<ScheduleEvent>) => void;
  deleteScheduleEvent: (id: string) => void;

  // Goals
  addGoal: (g: Omit<Goal, 'id' | 'createdAt'>) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;

  // Habits
  addHabit: (h: Omit<HabitItem, 'id' | 'createdAt' | 'completedDates'>) => void;
  removeHabit: (id: string) => void;
  completeHabitToday: (habitId: string, date: string) => void;

  // Skill plans
  addSkillPlan: (sp: Omit<SkillPlan, 'id' | 'createdAt'>) => void;
  updateSkillPlan: (id: string, patch: Partial<SkillPlan>) => void;
  deleteSkillPlan: (id: string) => void;
  toggleSkillStep: (planId: string, stepId: string) => void;

  // Rules
  addRule: (rule: Omit<Rule, 'id' | 'createdAt' | 'followedToday'>) => boolean;
  updateRule: (id: string, patch: Partial<Rule>) => void;
  toggleRule: (id: string) => void;
  toggleRuleFollowed: (id: string) => void;
  deleteRule: (id: string) => void;

  // Focus
  startFocus: (session: ActiveFocusSession) => void;
  endFocus: (notes?: string) => void;
  /** Save a checkpoint timestamp so partial sessions can be recovered after an app kill. */
  checkpointFocus: () => void;
  /** Silently discard an active session without logging it (used for abandoned/stale sessions). */
  discardFocus: () => void;

  // Plans (new)
  setCurrentPlan: (plan: Plan) => void;
  togglePlanItem: (itemId: string) => void;

  // Weekly plan (legacy planner blocks)
  generateWeeklyPlanAction: () => PlanBlock[];
  generateAIWeeklyPlanAction: () => Promise<PlanBlock[]>;
  togglePlanBlockCompleted: (id: string) => void;
  clearWeeklyPlan: () => void;

  // Chat
  addChatMessage: (msg: ChatMessage) => void;
  clearChatHistory: () => void;
  setAiApiKey: (key: string) => void;

  // Legacy daily tasks
  addTask: (task: Omit<Task, 'id' | 'completed' | 'createdAt'>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;

  addTimeBlock: (block: Omit<TimeBlock, 'id'>) => void;
  deleteTimeBlock: (id: string) => void;

  addConstraint: (constraint: Omit<Constraint, 'id' | 'createdAt'>) => void;
  toggleConstraint: (id: string) => void;
  deleteConstraint: (id: string) => void;

  generatePlan: (date: string) => DailyPlan;
  getPlanForDate: (date: string) => DailyPlan | undefined;

  saveReflection: (date: string, text: string) => void;
  getReflectionForDate: (date: string) => DailyReflection | undefined;

  // Control engine
  generateControlPlanAction: (date: string) => void;
  toggleControlPlanItem: (itemId: string) => void;
  reschedulePlan: (date: string) => void;
  logDistraction: (note?: string) => void;
  setActiveNudge: (nudge: NudgeItem | null) => void;
  dismissNudge: () => void;
  snoozeNudge: (mins: number) => void;

  // Behavior engine
  archiveMissedTasksFromPlan: (date: string) => void;
  markMissedTaskRecovered: (id: string) => void;
  deferMissedTask: (id: string) => void;
  computeDailyDecisionAction: (date: string) => void;

  // Enforcement layer
  checkEnforcementTick: (nowMins: number) => void;
  dismissReplanSuggestion: () => void;
  archiveEnforcementDay: () => void;  // call on new day to reset fired IDs

  // Execution engine
  skipNowAction: () => void;
  skipItem: (itemId: string) => void;
  autoGeneratePlanIfNeeded: (date: string) => void;
  resetStreakCounters: () => void;
  restartDay: () => void;
  loadStarterDay: (date: string) => void;
  /** Extend an active plan item's end time by `minutes`. Local only — no persist. */
  extendPlanItem: (itemId: string, minutes: number) => void;

  // Cloud sync
  hydrateFromCloud: (userId: string) => Promise<void>;
  saveProgressSnapshot: (result: AlignmentResult, date: string) => Promise<void>;

  // Trial
  setTrialStartDate: (date: string) => void;

  // Language
  setLanguageSelected: () => void;

  // Recurring Tasks (v3)
  addRecurringTask: (task: Omit<RecurringTask, 'id' | 'createdAt' | 'completedDates'>) => void;
  removeRecurringTask: (id: string) => void;
  updateRecurringTask: (id: string, patch: Partial<RecurringTask>) => void;
  completeRecurringTaskToday: (id: string, date: string) => void;
  migrateHabitsToRecurringTasks: () => void;

  // Identity Goals
  addIdentityGoal: (type: IdentityGoalType, customLabel?: string) => void;
  removeIdentityGoal: (id: string) => void;
  setIdentityGoals: (goals: IdentityGoal[]) => void;

  // Daily schedule entry (variable schedule support)
  setTodayScheduleEntry: (entry: DailyScheduleEntry) => void;
  clearTodayScheduleEntry: () => void;

  // Day mode + drift
  /** Dismiss the current drift intervention card (user acknowledged). */
  dismissActiveDrift: () => void;
  /**
   * Apply a recovery action to today's control plan.
   * Modifies plan items, recomputes nextBestAction, and sets dayMode to RECOVERY.
   */
  applyRecoveryAction: (mode: RecoveryMode, nowMins: number) => void;

  // Behavior state machine
  /**
   * Higher-level state machine heartbeat.
   * Called every 60s and on app foreground.
   * Computes DayState transitions, updates behaviorState,
   * then delegates to checkEnforcementTick (transition phase).
   */
  tickBehavior: (nowISO: string) => void;
  /** Reset drift clock — call on every user interaction. */
  recordInteraction: () => void;
  /**
   * User tapped "I'm ready" during a recovery block.
   * Marks the recovery plan item as completed (silent — no task counters)
   * and resets behaviorState to in_task.
   * Must NOT use skipItem/skippedPlanItemIds — recovery is not a skipped task.
   */
  endRecoveryEarly: (itemId: string) => void;
  /** @deprecated Use endRecoveryEarly — kept only for behavior state reset in tickBehavior. */
  acknowledgeRecovery: () => void;

  // Review
  /**
   * Builds today's DailyReview from current store state and sets pendingReview.
   * Called automatically by archiveEnforcementDay (before drift/recovery reset).
   * Also callable from the review screen to ensure pendingReview is populated.
   */
  buildTodayReview: () => void;
  /**
   * Saves a DailyReview (with user text merged in) to local store and Supabase.
   * Clears pendingReview. Bounded to last 30 days in local store.
   */
  saveDailyReviewAction: (review: DailyReview) => Promise<void>;
  /** Clears pendingReview without saving (e.g. user dismissed the review screen). */
  clearPendingReview: () => void;

  // Reset
  resetAllData: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      session: null,
      isGuestMode: false,
      profile: null,
      scheduleEvents: [],
      goals: [],
      skillPlans: [],
      habits: [],
      recurringTasks: [],
      identityGoals: [],
      todayScheduleEntry: null,
      behaviorState: {
        dayState: 'idle' as DayState,
        driftLevel: 0,
        lastInteractionTime: null,
        currentConstraintId: null,
        recoveryStartedAt: null,
        recoveryDurationMins: 0,
        lateStartDetectedAt: null,
      },
      rules: [],
      focusSessions: [],
      activeFocus: null,
      currentPlan: null,
      weeklyPlan: [],
      weeklyPlanGeneratedAt: null,
      weeklyPlanSource: null,
      chatHistory: [],
      aiApiKey: '',
      tasks: [],
      timeBlocks: [],
      constraints: [],
      plans: [],
      reflections: [],
      controlPlan: null,
      distractionLogs: [],
      activeNudge: null,
      missedTasks: [],
      dailyDecision: null,
      replanSuggested: false,
      lastReplanItemId: null,
      dismissedReplanForItemIds: [],
      enforcementFiredIds: [],
      taskSkipCount: 0,
      taskStreakCount: 0,
      skippedPlanItemIds: [],
      seedLoaded: false,
      trialStartDate: null,
      appLanguage: 'en',
      languageSelected: false,
      dayStreak: 0,
      lastCompletionDate: null,
      totalCompletedTasks: 0,
      dayMode: 'ON_TRACK' as DayMode,
      activeDrift: null,
      activeRecoveryMode: null,
      lastRecoveryAppliedAt: null,
      driftHistory: [],
      dailyReviews: [],
      pendingReview: null,
      syncErrors: [],
      isSyncing: false,

      // ── AI credits ──────────────────────────────────────────────────────────
      aiBalance: null,
      aiBalanceLoading: false,

      // ── AI credits ──────────────────────────────────────────────────────────

      refreshAIBalance: async () => {
        const { session, isGuestMode } = get();
        if (isGuestMode || !session?.user?.id) return;
        set({ aiBalanceLoading: true });
        try {
          const { fetchAIBalance } = await import('../services/aiCreditsService');
          const b = await fetchAIBalance(session.user.id);
          set({ aiBalance: b?.currentBalance ?? null, aiBalanceLoading: false });
        } catch {
          set({ aiBalanceLoading: false });
        }
      },

      // ── Auth ────────────────────────────────────────────────────────────────

      setSession: (session) => set({ session }),

      setGuestMode: (value) => set({ isGuestMode: value }),

      // ── Profile ─────────────────────────────────────────────────────────────

      setProfile: (profile) => set({ profile }),

      updateProfile: (patch) => {
        set((s) => ({ profile: s.profile ? { ...s.profile, ...patch } : null }));
        const { session, isGuestMode, profile } = get();
        if (session && !isGuestMode && profile) {
          upsertLocalProfile(profile).catch(console.warn);
        }
      },

      completeOnboarding: (data) => {
        // Profile id must match auth.users.id for RLS to work. Use session UUID
        // when available; fall back to generateId() for guest mode.
        const { session, isGuestMode } = get();
        const id = session?.user.id ?? generateId();
        const profile: UserProfile = {
          ...data,
          id,
          onboardingComplete: true,
          isPro: false,
          createdAt: new Date().toISOString(),
        };
        set({ profile });
        if (session && !isGuestMode) {
          upsertLocalProfile(profile).catch(console.warn);
        }
      },

      setLanguage: (lang) => {
        // Persist to profile so the choice survives app restarts
        set((s) => ({
          profile: s.profile ? { ...s.profile, language: lang } : s.profile,
          appLanguage: lang,
        }));
        // Apply i18next language switch + RTL direction
        setAppLanguage(lang as any).catch(console.warn);
        // Sync to cloud if authenticated
        const { session, isGuestMode, profile } = get();
        if (session && !isGuestMode && profile) {
          upsertLocalProfile({ ...profile, language: lang }).catch(console.warn);
        }
      },

      // ── Seed ────────────────────────────────────────────────────────────────

      loadSeedData: () => {
        if (get().seedLoaded) return;
        set({
          profile: SEED_PROFILE,
          scheduleEvents: SEED_SCHEDULE_EVENTS,
          goals: SEED_GOALS,
          skillPlans: SEED_SKILL_PLANS,
          rules: SEED_RULES,
          focusSessions: SEED_FOCUS_SESSIONS,
          seedLoaded: true,
        });
      },

      // ── Schedule events ──────────────────────────────────────────────────────

      addScheduleEvent: (e) => {
        const newEvent: ScheduleEvent = { ...e, id: generateId(), createdAt: new Date().toISOString() };
        set((s) => ({ scheduleEvents: [...s.scheduleEvents, newEvent] }));
        const { session, isGuestMode } = get();
        if (session && !isGuestMode) {
          scheduleService.upsertScheduleEvent(session.user.id, newEvent).catch(console.warn);
        }
      },

      updateScheduleEvent: (id, patch) => {
        set((s) => ({
          scheduleEvents: s.scheduleEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }));
        const { session, isGuestMode, scheduleEvents } = get();
        if (session && !isGuestMode) {
          const updated = scheduleEvents.find((e) => e.id === id);
          if (updated) scheduleService.upsertScheduleEvent(session.user.id, updated).catch(console.warn);
        }
      },

      deleteScheduleEvent: (id) => {
        set((s) => ({ scheduleEvents: s.scheduleEvents.filter((e) => e.id !== id) }));
        const { session, isGuestMode } = get();
        if (session && !isGuestMode) {
          scheduleService.deleteScheduleEvent(session.user.id, id).catch(console.warn);
        }
      },

      // ── Goals ────────────────────────────────────────────────────────────────

      addGoal: (g) => {
        const newGoal: Goal = { ...g, id: generateId(), createdAt: new Date().toISOString() };
        set((s) => ({ goals: [...s.goals, newGoal] }));
        const { session, isGuestMode } = get();
        if (session && !isGuestMode) {
          goalsService.upsertGoal(session.user.id, newGoal).catch(console.warn);
        }
      },

      updateGoal: (id, patch) => {
        set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
        const { session, isGuestMode, goals } = get();
        if (session && !isGuestMode) {
          const updated = goals.find((g) => g.id === id);
          if (updated) goalsService.upsertGoal(session.user.id, updated).catch(console.warn);
        }
      },

      deleteGoal: (id) => {
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }));
        const { session, isGuestMode } = get();
        if (session && !isGuestMode) {
          goalsService.deleteGoal(session.user.id, id).catch(console.warn);
        }
      },

      // ── Habits (local-only) ───────────────────────────────────────────────

      addHabit: (h) => {
        const newHabit: HabitItem = {
          ...h,
          id: generateId(),
          completedDates: [],
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ habits: [...s.habits, newHabit] }));
      },

      removeHabit: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),

      completeHabitToday: (habitId, date) => set((s) => ({
        habits: s.habits.map((h) =>
          h.id === habitId && !h.completedDates.includes(date)
            ? { ...h, completedDates: [...h.completedDates, date] }
            : h,
        ),
      })),

      // ── Skill plans ──────────────────────────────────────────────────────────

      addSkillPlan: (sp) => {
        const newSp: SkillPlan = { ...sp, id: generateId(), createdAt: new Date().toISOString() };
        set((s) => ({ skillPlans: [...s.skillPlans, newSp] }));
        const { session, isGuestMode } = get();
        if (session && !isGuestMode) {
          skillPlansService.upsertSkillPlan(session.user.id, newSp).catch(console.warn);
        }
      },

      updateSkillPlan: (id, patch) => {
        set((s) => ({
          skillPlans: s.skillPlans.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)),
        }));
        const { session, isGuestMode, skillPlans } = get();
        if (session && !isGuestMode) {
          const updated = skillPlans.find((sp) => sp.id === id);
          if (updated) skillPlansService.upsertSkillPlan(session.user.id, updated).catch(console.warn);
        }
      },

      deleteSkillPlan: (id) => {
        set((s) => ({ skillPlans: s.skillPlans.filter((sp) => sp.id !== id) }));
        const { session, isGuestMode } = get();
        if (session && !isGuestMode) {
          skillPlansService.deleteSkillPlan(session.user.id, id).catch(console.warn);
        }
      },

      toggleSkillStep: (planId, stepId) => {
        set((s) => ({
          skillPlans: s.skillPlans.map((sp) =>
            sp.id === planId
              ? {
                  ...sp,
                  steps: sp.steps.map((step) =>
                    step.id === stepId ? { ...step, completed: !step.completed } : step,
                  ),
                }
              : sp,
          ),
        }));
        const { session, isGuestMode, skillPlans } = get();
        if (session && !isGuestMode) {
          const updated = skillPlans.find((sp) => sp.id === planId);
          if (updated) skillPlansService.upsertSkillPlan(session.user.id, updated).catch(console.warn);
        }
      },

      // ── Rules ────────────────────────────────────────────────────────────────

      addRule: (rule) => {
        const { rules, profile, session, isGuestMode } = get();
        const isPro = profile?.isPro ?? false;
        if (!isPro && rules.filter((r) => r.enabled).length >= FREE_PLAN_RULE_LIMIT) {
          return false;
        }
        const newRule: Rule = {
          ...rule,
          id: generateId(),
          followedToday: false,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ rules: [...s.rules, newRule] }));
        if (session && !isGuestMode) {
          rulesService.upsertRule(session.user.id, newRule).catch(console.warn);
        }
        return true;
      },

      updateRule: (id, patch) => {
        set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
        const { session, isGuestMode, rules } = get();
        if (session && !isGuestMode) {
          const updated = rules.find((r) => r.id === id);
          if (updated) rulesService.upsertRule(session.user.id, updated).catch(console.warn);
        }
      },

      toggleRule: (id) => {
        const s = get();
        const isPro = s.profile?.isPro ?? false;
        const rule = s.rules.find((r) => r.id === id);
        if (!rule) return;
        if (!rule.enabled && !isPro) {
          if (s.rules.filter((r) => r.enabled).length >= FREE_PLAN_RULE_LIMIT) return;
        }
        const updated = { ...rule, enabled: !rule.enabled };
        set((st) => ({
          rules: st.rules.map((r) => (r.id === id ? updated : r)),
        }));
        if (s.session && !s.isGuestMode) {
          rulesService.upsertRule(s.session.user.id, updated).catch(console.warn);
        }
      },

      toggleRuleFollowed: (id) => {
        set((s) => ({
          rules: s.rules.map((r) => (r.id === id ? { ...r, followedToday: !r.followedToday } : r)),
        }));
        const { session, isGuestMode, rules } = get();
        if (session && !isGuestMode) {
          const updated = rules.find((r) => r.id === id);
          if (updated) rulesService.upsertRule(session.user.id, updated).catch(console.warn);
        }
      },

      deleteRule: (id) => {
        set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
        const { session, isGuestMode } = get();
        if (session && !isGuestMode) {
          rulesService.deleteRule(session.user.id, id).catch(console.warn);
        }
      },

      // ── Focus ────────────────────────────────────────────────────────────────

      startFocus: (session) => set({ activeFocus: session }),

      checkpointFocus: () => {
        const { activeFocus } = get();
        if (!activeFocus) return;
        set({ activeFocus: { ...activeFocus, lastCheckpointAt: new Date().toISOString() } });
      },

      discardFocus: () => set({ activeFocus: null }),

      endFocus: (notes) => {
        const { activeFocus, session, isGuestMode, goals } = get();
        if (!activeFocus) return;
        const linkedGoal = goals.find((g) => g.id === activeFocus.goalId);
        // Use lastCheckpointAt as the effective end time if available, so we never
        // log time that wasn't actually tracked (e.g. app was killed for 2 hours mid-session).
        const effectiveEndMs = activeFocus.lastCheckpointAt
          ? new Date(activeFocus.lastCheckpointAt).getTime()
          : Date.now();
        const durationMinutes = Math.max(
          1,
          Math.round((effectiveEndMs - new Date(activeFocus.startedAt).getTime()) / 60000),
        );
        const ended: FocusSession = {
          id: activeFocus.id,
          start: activeFocus.startedAt,
          end: new Date(effectiveEndMs).toISOString(),
          goalId: activeFocus.goalId,
          skillPlanId: linkedGoal?.linkedSkillPlanId,
          notes,
          durationMinutes,
        };
        set((s) => ({ activeFocus: null, focusSessions: [ended, ...s.focusSessions] }));
        if (session && !isGuestMode) {
          focusService.insertFocusSession(session.user.id, ended).catch(console.warn);
        }
      },

      // ── Plans (new) ──────────────────────────────────────────────────────────

      setCurrentPlan: (plan) => set({ currentPlan: plan }),

      togglePlanItem: (itemId) =>
        set((s) =>
          s.currentPlan
            ? {
                currentPlan: {
                  ...s.currentPlan,
                  items: s.currentPlan.items.map((i) =>
                    i.id === itemId ? { ...i, completed: !i.completed } : i,
                  ),
                },
              }
            : s,
        ),

      // ── Weekly plan (legacy blocks) ──────────────────────────────────────────

      generateWeeklyPlanAction: () => {
        const { goals, scheduleEvents, rules } = get();
        const blocks = generateWeeklyPlan(goals, scheduleEvents, rules);
        set({ weeklyPlan: blocks, weeklyPlanGeneratedAt: new Date().toISOString(), weeklyPlanSource: 'local' });
        return blocks;
      },

      generateAIWeeklyPlanAction: async () => {
        // AI-enhanced weekly generation routes through the Coach (ai.tsx) tab.
        // The planner button falls back to local smart scheduling for now.
        const { goals, scheduleEvents, rules } = get();
        const blocks = generateWeeklyPlan(goals, scheduleEvents, rules);
        set({ weeklyPlan: blocks, weeklyPlanGeneratedAt: new Date().toISOString(), weeklyPlanSource: 'ai' });
        return blocks;
      },

      togglePlanBlockCompleted: (id) =>
        set((s) => ({
          weeklyPlan: s.weeklyPlan.map((b) => (b.id === id ? { ...b, completed: !b.completed } : b)),
        })),

      clearWeeklyPlan: () =>
        set({ weeklyPlan: [], weeklyPlanGeneratedAt: null, weeklyPlanSource: null }),

      // ── Chat ─────────────────────────────────────────────────────────────────

      addChatMessage: (msg) =>
        set((s) => ({ chatHistory: [...s.chatHistory, msg] })),

      clearChatHistory: () => set({ chatHistory: [] }),

      setAiApiKey: (key) => set({ aiApiKey: key }),

      // ── Legacy daily tasks ───────────────────────────────────────────────────

      addTask: (task) =>
        set((s) => ({
          tasks: [
            ...s.tasks,
            { ...task, id: generateId(), completed: false, createdAt: new Date().toISOString() },
          ],
        })),

      toggleTask: (id) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)) })),

      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      updateTask: (id, patch) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

      addTimeBlock: (block) =>
        set((s) => ({ timeBlocks: [...s.timeBlocks, { ...block, id: generateId() }] })),

      deleteTimeBlock: (id) =>
        set((s) => ({ timeBlocks: s.timeBlocks.filter((b) => b.id !== id) })),

      addConstraint: (constraint) =>
        set((s) => ({
          constraints: [
            ...s.constraints,
            { ...constraint, id: generateId(), createdAt: new Date().toISOString() },
          ],
        })),

      toggleConstraint: (id) =>
        set((s) => ({
          constraints: s.constraints.map((c) => (c.id === id ? { ...c, active: !c.active } : c)),
        })),

      deleteConstraint: (id) =>
        set((s) => ({ constraints: s.constraints.filter((c) => c.id !== id) })),

      generatePlan: (date) => {
        const { tasks, timeBlocks, constraints, profile } = get();
        const plan = generateDailyPlan({
          tasks: tasks.filter((t) => t.date === date),
          timeBlocks: timeBlocks.filter((b) => b.date === date),
          constraints,
          date,
          mainFocus: profile?.mainFocus ?? '',
        });
        set((s) => ({ plans: [...s.plans.filter((p) => p.date !== date), plan] }));
        return plan;
      },

      getPlanForDate: (date) => get().plans.find((p) => p.date === date),

      saveReflection: (date, text) => {
        const existing = get().reflections.find((r) => r.date === date);
        const reflection = existing
          ? { ...existing, text }
          : { id: generateId(), date, text, createdAt: new Date().toISOString() };
        set((s) => ({
          reflections: [
            ...s.reflections.filter((r) => r.date !== date),
            reflection,
          ],
        }));
        const { session, isGuestMode, controlPlan, rules, distractionLogs, profile } = get();
        if (session && !isGuestMode) {
          // 1. Persist the reflection text
          reflectionService.upsertReflection(session.user.id, reflection).catch(console.warn);

          // 2. Compute a progress snapshot and persist it atomically with the reflection.
          //    hasReflection is always true here since we just saved it.
          const planItems = (controlPlan?.plan.items ?? []).filter(
            (i) => i.type !== 'break' && i.type !== 'event',
          );
          const distractionCount = distractionLogs.filter(
            (d) => d.timestamp.startsWith(date),
          ).length;
          const result = computeProgressScore({
            planItems,
            rules,
            criticalActionCompleted:
              controlPlan?.plan.items.some((i) => !!i.isCritical && i.completed) ?? false,
            hasReflection: true,
            distractionCount,
            seriousnessScore: profile?.seriousnessScore ?? 7,
          });
          progressService
            .saveProgressSnapshot(session.user.id, date, result, distractionCount)
            .catch(console.warn);
        }
      },

      getReflectionForDate: (date) => get().reflections.find((r) => r.date === date),

      // ── Control Engine ───────────────────────────────────────────────────────

      generateControlPlanAction: (date) => {
        const { goals, scheduleEvents, skillPlans, rules, recurringTasks, profile, todayScheduleEntry, session, isGuestMode } = get();

        // For daily_input users who haven't entered today's schedule yet:
        // block plan generation. The home screen will show a schedule prompt.
        // Plan generates only after the user submits their hours.
        if (
          profile?.scheduleType === 'daily_input' &&
          !todayScheduleEntry &&
          profile?.userType !== 'flexible'
        ) {
          return;
        }

        // Archive missed tasks from the PREVIOUS plan before overwriting it.
        // This must happen before set({ controlPlan }) so we read the old plan.
        get().archiveMissedTasksFromPlan(date);

        // Compute today's locked constraint blocks (work/class + recovery) via
        // the schedule input service. This is the authoritative source for locked time.
        const constraints = getTodayConstraints(
          profile,
          scheduleEvents,
          recurringTasks,
          todayScheduleEntry,
          date,
        );

        const { fixedStart, fixedEnd } = parseFixedWindow(
          profile?.fixedScheduleStart,
          profile?.fixedScheduleEnd,
        );

        // Compute adaptation hints from saved review history.
        // These bias the planner toward smaller load / different task order
        // when recurring execution problems are detected.
        const adaptationHints = computeAdaptationHints(get().dailyReviews);

        // Pass constraintBlocks + recurringTasks directly to the engine.
        // The engine will:
        //  - pre-place constraint PlanItems in the output
        //  - subtract their time windows from free slots
        //  - inject activeRecurringTasks as routines (bypasses legacy habits)
        const plan = generateControlPlan(
          goals,
          scheduleEvents,
          skillPlans,
          rules,
          date,
          undefined,
          fixedStart,
          fixedEnd,
          profile?.energyStyle,
          constraints.allBlocks.length ? constraints.allBlocks : undefined,
          constraints.activeRecurringTasks.length ? constraints.activeRecurringTasks : undefined,
          adaptationHints,
        );
        // Clear replan dismissals + drift — new plan = fresh state.
        set({
          controlPlan: plan,
          replanSuggested: false, dismissedReplanForItemIds: [], lastReplanItemId: null, skippedPlanItemIds: [],
          activeDrift: null,           // stale drift from old plan must not persist
          activeRecoveryMode: null,    // recovery context tied to old plan — reset
          driftHistory: [],            // ephemeral audit log — reset with plan
        });
        track('plan_generated', {
          date,
          item_count:      plan.plan.items.length,
          goal_count:      goals.length,
          has_adaptation:  adaptationHints.reviewCount > 0 ? 1 : 0,
          cap_multiplier:  adaptationHints.capMultiplier,
        });
        if (session && !isGuestMode) {
          planService.upsertDailyPlan(session.user.id, plan).catch(console.warn);
        }

        // Recompute behavioral snapshot with the new plan.
        get().computeDailyDecisionAction(date);
      },

      toggleControlPlanItem: (itemId) => {
        const s = get();
        if (!s.controlPlan) return;
        const wasCompleted = s.controlPlan.plan.items.find(i => i.id === itemId)?.completed ?? false;
        const isNowCompleted = !wasCompleted;
        const updatedItems = s.controlPlan.plan.items.map((i) =>
          i.id === itemId ? { ...i, completed: !i.completed } : i,
        );
        // Exclude skipped items from NBA so they don't resurface after toggle
        const skipped = new Set(s.skippedPlanItemIds ?? []);
        const nextBestAction = computeNextBestAction(updatedItems.filter(i => !skipped.has(i.id)));
        const updatedPlan: ControlDailyPlan = {
          ...s.controlPlan,
          plan: { ...s.controlPlan.plan, items: updatedItems },
          nextBestAction,
        };
        set({
          controlPlan: updatedPlan,
          ...(isNowCompleted ? {
            taskStreakCount: s.taskStreakCount + 1,
            taskSkipCount: 0,
            lastCompletionDate: getTodayDate(),
            totalCompletedTasks: s.totalCompletedTasks + 1,
          } : {}),
        });
        if (isNowCompleted) {
          const completedItem = updatedItems.find((i) => i.id === itemId);
          track('task_completed', {
            date:        getTodayDate(),
            item_type:   completedItem?.type ?? 'goal',
            is_critical: completedItem?.isCritical ? 1 : 0,
            streak:      s.taskStreakCount + 1,
          });
        }
        if (s.session && !s.isGuestMode) {
          // Update single item — cheaper than re-saving the whole plan
          const item = updatedItems.find((i) => i.id === itemId);
          if (item) {
            planService
              .updatePlanItemCompletion(s.session.user.id, itemId, item.completed)
              .catch(console.warn);
          }
        }
      },

      reschedulePlan: (date) => {
        const { controlPlan, goals, scheduleEvents, rules, profile, session, isGuestMode } = get();
        if (!controlPlan) return;
        const now = new Date();
        const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const { fixedStart, fixedEnd } = parseFixedWindow(
          profile?.fixedScheduleStart,
          profile?.fixedScheduleEnd,
        );
        const rescheduled = rescheduleRemaining(
          controlPlan.plan, t, goals, scheduleEvents, rules, date, fixedStart, fixedEnd,
        );
        const updatedPlan = { ...controlPlan, plan: rescheduled };
        set({ controlPlan: updatedPlan });
        if (session && !isGuestMode) {
          planService.upsertDailyPlan(session.user.id, updatedPlan).catch(console.warn);
        }
      },

      logDistraction: (note) => {
        const log = { id: generateId(), timestamp: new Date().toISOString(), note };
        // Prepend new entry and cap at 200 to prevent unbounded AsyncStorage growth
        set((s) => ({ distractionLogs: [log, ...s.distractionLogs].slice(0, 200) }));
        const { session, isGuestMode } = get();
        if (session && !isGuestMode) {
          distractionService.insertDistractionLog(session.user.id, log).catch(console.warn);
        }
      },

      setActiveNudge: (nudge) => set({ activeNudge: nudge }),

      dismissNudge: () => set({ activeNudge: null }),

      snoozeNudge: (mins) =>
        set((s) => {
          if (!s.activeNudge) return s;
          const d = new Date();
          d.setMinutes(d.getMinutes() + mins);
          const h = String(d.getHours()).padStart(2, '0');
          const m = String(d.getMinutes()).padStart(2, '0');
          return {
            activeNudge: { ...s.activeNudge, snoozedUntil: `${h}:${m}` },
          };
        }),

      // ── Behavior Engine ──────────────────────────────────────────────────────

      archiveMissedTasksFromPlan: (date) => {
        const { controlPlan, missedTasks, goals } = get();
        // Only archive when the stored plan is for a DIFFERENT (past) date.
        if (!controlPlan || controlPlan.date >= date) return;

        const goalTitles: Record<string, string> = {};
        for (const g of goals) goalTitles[g.id] = g.title;

        const newMissed = extractMissedTasksFromPlan(
          controlPlan,
          controlPlan.date,
          missedTasks,
          goalTitles,
        );
        if (newMissed.length > 0) {
          set((s) => ({ missedTasks: [...newMissed, ...s.missedTasks] }));
        }
      },

      markMissedTaskRecovered: (id) => {
        set((s) => ({
          missedTasks: s.missedTasks.map((t) =>
            t.id === id ? { ...t, status: 'recovered' } : t,
          ),
        }));
        // P0 fix: recompute decision so recovery banner + carryover list update immediately
        get().computeDailyDecisionAction(getTodayDate());
      },

      deferMissedTask: (id) => {
        set((s) => ({
          missedTasks: s.missedTasks.map((t) =>
            t.id === id ? { ...t, status: 'deferred' } : t,
          ),
        }));
        // P0 fix: same — reflect the change immediately
        get().computeDailyDecisionAction(getTodayDate());
      },

      computeDailyDecisionAction: (date) => {
        const { goals, focusSessions, missedTasks, controlPlan } = get();
        const decision = computeDailyDecision(
          date,
          goals,
          focusSessions,
          missedTasks,
          controlPlan,
        );
        set({ dailyDecision: decision });
      },

      // ── Enforcement tick ─────────────────────────────────────────────────────

      checkEnforcementTick: (nowMins) => {
        const {
          dailyDecision,
          controlPlan,
          activeNudge,
          enforcementFiredIds,
          dismissedReplanForItemIds,
          replanSuggested,
        } = get();

        // Never interrupt an already-active nudge — let the user dismiss first.
        if (activeNudge) return;

        const firedSet  = new Set(enforcementFiredIds);
        const hours     = Math.floor(nowMins / 60);
        const mins      = nowMins % 60;
        const nowStr    = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

        // ── 1. Schedule-based nudges (formerly in planner.tsx interval) ──────
        //    Runs centrally so nudges appear on every tab, not just planner.
        if (controlPlan) {
          for (const nudge of controlPlan.nudgeSchedule) {
            if (nudge.triggerTime !== nowStr) continue;
            if (nudge.snoozedUntil && nudge.snoozedUntil > nowStr) continue;
            const item = controlPlan.plan.items.find((i) => i.id === nudge.itemId);
            if (item?.completed) continue;
            if (firedSet.has(nudge.id)) continue;
            firedSet.add(nudge.id);
            set({ activeNudge: nudge, enforcementFiredIds: Array.from(firedSet) });
            return; // one nudge at a time
          }
        }

        // ── 2. Overdue must-do → replan suggestion ───────────────────────────
        //    P0 fix: respects dismissed items — won't bounce every 60 seconds.
        const mustDoTitles   = dailyDecision?.mustDoItems ?? [];
        const overdueMustDo  = getOverdueMustDo(mustDoTitles, controlPlan, nowMins);
        if (overdueMustDo && !replanSuggested) {
          const dismissedSet = new Set(dismissedReplanForItemIds);
          if (!dismissedSet.has(overdueMustDo.id)) {
            set({ replanSuggested: true, lastReplanItemId: overdueMustDo.id });
          }
        }

        // ── 3. Behavioral nudges (drift, missed critical, must-do urgent) ─────
        const nudge = buildBehavioralNudge(dailyDecision, controlPlan, nowMins, firedSet);
        if (nudge) {
          firedSet.add(nudge.id);
          set({ activeNudge: nudge, enforcementFiredIds: Array.from(firedSet) });
        }

        // ── 4. Skip pressure nudge — fires once when ≥2 skips, no completions ─
        const { taskSkipCount } = get();
        const skipNudgeId = 'skip-pressure-today';
        if (taskSkipCount >= 2 && !firedSet.has(skipNudgeId) && !get().activeNudge) {
          const skipNudge: NudgeItem = {
            id:          skipNudgeId,
            itemId:      'skip',
            itemTitle:   "What's actually blocking you? Your coach can help.",
            triggerTime: nowStr,
            type:        'checkin',
          };
          firedSet.add(skipNudgeId);
          set({ activeNudge: skipNudge, enforcementFiredIds: Array.from(firedSet) });
        }
      },

      // P0 fix: records which item triggered this dismissal — won't resurface
      // for that item until the day resets or the plan is regenerated.
      dismissReplanSuggestion: () => {
        const { lastReplanItemId, dismissedReplanForItemIds } = get();
        set({
          replanSuggested: false,
          dismissedReplanForItemIds: lastReplanItemId
            ? [...dismissedReplanForItemIds, lastReplanItemId]
            : dismissedReplanForItemIds,
          lastReplanItemId: null,
        });
      },

      // Called when a new day begins (from tabs layout on mount with date mismatch).
      archiveEnforcementDay: () => {
        // Build today's review BEFORE clearing drift/recovery state so the
        // review captures the day's actual audit data, not the cleared state.
        get().buildTodayReview();

        const { lastCompletionDate, dayStreak } = get();
        const yesterday = getYesterday();
        const newStreak = lastCompletionDate === yesterday ? dayStreak + 1 : 0;
        set({
          enforcementFiredIds: [], dismissedReplanForItemIds: [], lastReplanItemId: null,
          replanSuggested: false, taskSkipCount: 0, taskStreakCount: 0, skippedPlanItemIds: [],
          dayStreak: newStreak,
          activeDrift: null,           // clear yesterday's drift on day boundary
          activeRecoveryMode: null,    // recovery context is per-day — reset
          lastRecoveryAppliedAt: null, // dedup guard — reset for new day
          driftHistory: [],            // ephemeral audit log — reset for new day
          dayMode: 'ON_TRACK' as DayMode, // reset mode; tickBehavior will recompute
        });
        track('day_archived', {
          date:   yesterday,
          streak: newStreak,
        });
      },

      // Skip a specific item by ID — adds to skippedPlanItemIds and recomputes NBA
      skipItem: (itemId) => {
        const { controlPlan } = get();
        if (!controlPlan) return;
        const skippedItem = controlPlan.plan.items.find((i) => i.id === itemId);
        const newSkipped = [...(get().skippedPlanItemIds ?? []), itemId];
        const remaining = controlPlan.plan.items.filter(i => !newSkipped.includes(i.id));
        const nextBestAction = computeNextBestAction(remaining);
        set(s => ({
          controlPlan: { ...controlPlan, nextBestAction },
          taskSkipCount: s.taskSkipCount + 1,
          taskStreakCount: 0,
          skippedPlanItemIds: newSkipped,
        }));
        track('task_skipped', {
          date:       getTodayDate(),
          item_type:  skippedItem?.type ?? 'goal',
          skip_count: (get().taskSkipCount), // already incremented by set above
        });
      },

      skipNowAction: () => {
        const { controlPlan } = get();
        if (!controlPlan?.nextBestAction) return;
        get().skipItem(controlPlan.nextBestAction.id);
      },

      autoGeneratePlanIfNeeded: (date) => {
        const { controlPlan } = get();
        // Only regenerate if: no plan, plan is for a different date, OR plan has no items
        // (three conditions prevent overwriting a user-edited plan on the same day)
        const needsGeneration =
          !controlPlan ||
          controlPlan.date !== date ||
          controlPlan.plan.items.length === 0;
        if (needsGeneration) get().generateControlPlanAction(date);
      },

      extendPlanItem: (itemId, minutes) => {
        const { controlPlan, skippedPlanItemIds } = get();
        if (!controlPlan) return;
        const updatedItems = controlPlan.plan.items.map((item) => {
          if (item.id !== itemId) return item;
          const [h, m] = item.endTime.split(':').map(Number);
          const totalMins = h * 60 + m + minutes;
          const newH = Math.floor(totalMins / 60) % 24;
          const newM = totalMins % 60;
          return {
            ...item,
            endTime: `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`,
          };
        });
        const skipped = new Set(skippedPlanItemIds ?? []);
        const nextBestAction = computeNextBestAction(updatedItems.filter((i) => !skipped.has(i.id)));
        set({
          controlPlan: {
            ...controlPlan,
            plan: { ...controlPlan.plan, items: updatedItems },
            nextBestAction,
          },
        });
      },

      resetStreakCounters: () => set({ taskSkipCount: 0, taskStreakCount: 0 }),

      // Restore all skipped items and recompute NBA from the full item list
      restartDay: () => {
        const { controlPlan } = get();
        if (!controlPlan) return;
        const nextBestAction = computeNextBestAction(controlPlan.plan.items);
        set({ skippedPlanItemIds: [], taskSkipCount: 0, taskStreakCount: 0,
              controlPlan: { ...controlPlan, nextBestAction } });
      },

      // First-time experience: if no goals and no routines exist, seed a minimal
      // starter day so the user sees an actionable plan immediately.
      loadStarterDay: (date) => {
        const { goals, habits, recurringTasks } = get();
        if (goals.length > 0 || habits.length > 0 || recurringTasks.length > 0) return;
        const now = new Date().toISOString();
        const t = i18n.t.bind(i18n);
        const starterGoals: Goal[] = [
          { id: generateId(), title: t('starter.goal_morning'),  category: 'health',  priority: 1, weeklyHoursTarget: 3.5, createdAt: now },
          { id: generateId(), title: t('starter.goal_deepwork'), category: 'career',  priority: 1, weeklyHoursTarget: 10,  createdAt: now },
          { id: generateId(), title: t('starter.goal_learning'), category: 'skill',   priority: 2, weeklyHoursTarget: 5,   createdAt: now },
        ];
        // Seed as RecurringTask (v3) — compatible with controlEngine via cast
        const starterTask: RecurringTask = {
          id: generateId(),
          title: t('starter.habit_stretch'),
          durationMinutes: 10,
          category: 'body' as RecurringTaskCategory,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          skipOnOffDays: false,
          preferredTime: '07:00',
          completedDates: [],
          createdAt: now,
        };
        set({ goals: starterGoals, recurringTasks: [starterTask] });
        get().generateControlPlanAction(date);
      },

      // ── Trial & Language ─────────────────────────────────────────────────────

      setTrialStartDate: (date) => set({ trialStartDate: date }),

      setLanguageSelected: () => set({ languageSelected: true }),

      // ── Day Mode + Drift ─────────────────────────────────────────────────────

      dismissActiveDrift: () =>
        set((s) =>
          s.activeDrift
            ? { activeDrift: { ...s.activeDrift, dismissed: true } }
            : s,
        ),

      applyRecoveryAction: (mode, nowMins) => {
        const s = get();
        if (!s.controlPlan) return;

        // 3-second dedup guard — prevents double-fire on fast double-tap or
        // rapid foreground/background cycles within the same recovery session.
        if (s.lastRecoveryAppliedAt) {
          const msSince = Date.now() - new Date(s.lastRecoveryAppliedAt).getTime();
          if (msSince < 3000) return;
        }

        const nowISO = new Date().toISOString();
        const today = nowISO.slice(0, 10);

        const newItems = applyRecoveryMode(
          mode,
          s.controlPlan.plan.items,
          s.dailyDecision,
          nowMins,
        );
        const skipped = new Set(s.skippedPlanItemIds ?? []);
        const nextBestAction = computeNextBestAction(
          newItems.filter((i) => !skipped.has(i.id)),
        );

        // Append to audit log if there was an active drift event
        const newHistoryEntry: DriftRecord | null = s.activeDrift
          ? {
              type: s.activeDrift.type,
              severity: s.activeDrift.severity,
              detectedAt: s.activeDrift.detectedAt,
              date: today,
              recoveryApplied: mode,
            }
          : null;

        // Keep decision layer in sync — marks isInRecoveryMode: true
        const updatedDecision = s.dailyDecision
          ? { ...s.dailyDecision, isInRecoveryMode: true }
          : null;

        set({
          controlPlan: {
            ...s.controlPlan,
            plan: { ...s.controlPlan.plan, items: newItems },
            nextBestAction,
          },
          dayMode: 'RECOVERY' as DayMode,
          activeDrift: null,
          activeRecoveryMode: mode,
          lastRecoveryAppliedAt: nowISO,
          driftHistory: newHistoryEntry
            ? [...s.driftHistory, newHistoryEntry]
            : s.driftHistory,
          ...(updatedDecision ? { dailyDecision: updatedDecision } : {}),
        });
        track('recovery_applied', {
          date:       today,
          mode,
          drift_type: s.activeDrift?.type ?? null,
          severity:   s.activeDrift?.severity ?? null,
        });
      },

      // ── Recurring Tasks (v3) ─────────────────────────────────────────────────

      addRecurringTask: (task) => {
        const newTask: RecurringTask = {
          ...task,
          id: generateId(),
          completedDates: [],
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ recurringTasks: [...s.recurringTasks, newTask] }));
      },

      removeRecurringTask: (id) =>
        set((s) => ({ recurringTasks: s.recurringTasks.filter((t) => t.id !== id) })),

      updateRecurringTask: (id, patch) =>
        set((s) => ({
          recurringTasks: s.recurringTasks.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
          ),
        })),

      completeRecurringTaskToday: (id, date) =>
        set((s) => ({
          recurringTasks: s.recurringTasks.map((t) =>
            t.id === id && !t.completedDates.includes(date)
              ? { ...t, completedDates: [...t.completedDates, date] }
              : t,
          ),
        })),

      /**
       * One-time migration: copy legacy HabitItem[] → RecurringTask[].
       * Safe to call multiple times — no-op if recurringTasks already populated.
       * Called from _layout.tsx on first boot after upgrade.
       */
      migrateHabitsToRecurringTasks: () => {
        const { habits, recurringTasks } = get();
        if (recurringTasks.length > 0 || habits.length === 0) return;
        const migrated: RecurringTask[] = habits.map((h) => ({
          id: h.id,
          title: h.title,
          durationMinutes: h.durationMinutes,
          category: 'body' as RecurringTaskCategory,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          skipOnOffDays: false,
          preferredTime: h.preferredTime,
          completedDates: h.completedDates,
          createdAt: h.createdAt,
          updatedAt: h.updatedAt,
        }));
        set({ recurringTasks: migrated });
      },

      // ── Identity Goals ────────────────────────────────────────────────────────

      addIdentityGoal: (type, customLabel) => {
        const newGoal: IdentityGoal = {
          id: generateId(),
          type,
          customLabel,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ identityGoals: [...s.identityGoals, newGoal] }));
      },

      removeIdentityGoal: (id) =>
        set((s) => ({ identityGoals: s.identityGoals.filter((g) => g.id !== id) })),

      setIdentityGoals: (goals) => set({ identityGoals: goals }),

      // ── Daily schedule entry ──────────────────────────────────────────────────

      setTodayScheduleEntry: (entry) => set({ todayScheduleEntry: entry }),

      clearTodayScheduleEntry: () => set({ todayScheduleEntry: null }),

      // ── Behavior State Machine ────────────────────────────────────────────────

      /**
       * Higher-level state machine heartbeat.
       * Computes dayState from the current plan + time, updates behaviorState,
       * then delegates to checkEnforcementTick (existing enforcement logic
       * preserved during transition phase — DO NOT remove until parity confirmed).
       */
      tickBehavior: (nowISO) => {
        const { controlPlan, behaviorState } = get();
        const now = new Date(nowISO);
        const nowMins = now.getHours() * 60 + now.getMinutes();

        if (!controlPlan) {
          // No plan — keep idle, still run enforcement tick
          get().checkEnforcementTick(nowMins);
          return;
        }

        const items = controlPlan.plan.items;
        const skipped = new Set(get().skippedPlanItemIds);

        // Find the plan item whose time window contains nowMins
        const currentItem = items.find((item) => {
          const start = timeToMins(item.startTime);
          const end   = timeToMins(item.endTime);
          return nowMins >= start && nowMins < end;
        });

        const isConstraint = currentItem?.blockKind === 'constraint';
        const isRecovery   = currentItem?.blockKind === 'recovery';
        const isTask       = !!currentItem && !isConstraint && !isRecovery && !currentItem.completed;

        // Drift: only accumulates when in a task window, not in constraint/recovery
        const lastInteraction = behaviorState.lastInteractionTime;
        const inactiveMins = lastInteraction
          ? (now.getTime() - new Date(lastInteraction).getTime()) / 60_000
          : Infinity;

        let newDriftLevel: BehaviorState['driftLevel'] = 0;
        if (isTask && !skipped.has(currentItem.id)) {
          if      (inactiveMins > 90) newDriftLevel = 4;
          else if (inactiveMins > 60) newDriftLevel = 3;
          else if (inactiveMins > 40) newDriftLevel = 2;
          else if (inactiveMins > 20) newDriftLevel = 1;
        }

        // Compute day state
        let newDayState: DayState = 'idle';

        if (isConstraint) {
          newDayState = 'in_constraint';
        } else if (isRecovery) {
          newDayState = 'in_recovery';
        } else if (isTask) {
          newDayState = newDriftLevel > 0 ? 'drifting' : 'in_task';
        } else if (items.filter((i) => !skipped.has(i.id)).every((i) => i.completed)) {
          newDayState = 'blocked';
        } else {
          // Late-start detection: first item should have started > 90 min ago
          const firstItem = items[0];
          if (
            firstItem &&
            nowMins > timeToMins(firstItem.startTime) + 90 &&
            behaviorState.dayState === 'idle' &&
            !behaviorState.lateStartDetectedAt
          ) {
            newDayState = 'late_start';
          }
        }

        // Recovery window tracking
        const enteringRecovery = isRecovery && behaviorState.dayState !== 'in_recovery';
        const recoveryStartedAt = enteringRecovery
          ? nowISO
          : (isRecovery ? behaviorState.recoveryStartedAt : null);
        const recoveryDurationMins = isRecovery && currentItem
          ? timeToMins(currentItem.endTime) - timeToMins(currentItem.startTime)
          : 0;

        const newBehaviorState: BehaviorState = {
          ...behaviorState,
          dayState: newDayState,
          driftLevel: newDriftLevel,
          currentConstraintId: isConstraint ? (currentItem?.id ?? null) : null,
          recoveryStartedAt,
          recoveryDurationMins,
          lateStartDetectedAt:
            newDayState === 'late_start' && !behaviorState.lateStartDetectedAt
              ? nowISO
              : behaviorState.lateStartDetectedAt,
        };

        // ── Compute DayMode and DriftEvent from fresh state ───────────────────
        const { taskSkipCount, dailyDecision, distractionLogs, profile } = get();
        const fixedEndMins = timeToMins(profile?.fixedScheduleEnd ?? '22:00');
        const pressureInfo = computePressure(taskSkipCount, nowMins, items, fixedEndMins);

        const newDayMode: DayMode = computeDayMode(
          pressureInfo,
          newBehaviorState,
          dailyDecision,
          taskSkipCount,
        );

        const today = nowISO.slice(0, 10);

        // Clear stale drift from a previous calendar day before any further checks
        const currentActiveDrift = (() => {
          const d = get().activeDrift;
          if (d && isDriftStale(d, today)) { set({ activeDrift: null }); return null; }
          return d;
        })();

        // Suppress new drift events for 10 minutes after recovery was applied —
        // gives the re-planned schedule time to settle before re-triggering.
        const { activeRecoveryMode: arm, lastRecoveryAppliedAt: lraa } = get();
        const suppressDrift =
          arm !== null &&
          lraa !== null &&
          Date.now() - new Date(lraa).getTime() < 10 * 60 * 1000;

        // Only recompute drift if: not suppressed AND no active/undismissed drift
        const shouldRecomputeDrift =
          !suppressDrift && (!currentActiveDrift || currentActiveDrift.dismissed);

        const rawDrift = shouldRecomputeDrift
          ? computeDriftEvent({
              pressure: pressureInfo,
              behaviorState: newBehaviorState,
              planItems: items,
              dailyDecision,
              distractionLogs,
              taskSkipCount,
              nowMins,
              today,
            })
          : currentActiveDrift;

        // Adaptation: rank recovery options by past effectiveness + predicted drift type.
        // Uses predictiveEngine.rankRecoveryModes for personalised, explainable ordering.
        const newDrift = (() => {
          if (!rawDrift || rawDrift.recoveryOptions.length === 0) return rawDrift;
          const reviews            = get().dailyReviews;
          const recoveryStats      = computeRecoveryStats(reviews);
          const hintsForRanking    = computeAdaptationHints(reviews);
          const cpForRanking       = get().controlPlan;
          const nowMinsForRanking  = (() => {
            const d = new Date();
            return d.getHours() * 60 + d.getMinutes();
          })();
          const topPrediction = cpForRanking
            ? (predictDrift(cpForRanking, reviews, hintsForRanking, nowMinsForRanking)[0] ?? null)
            : null;
          const ranked = rankRecoveryModes(rawDrift.recoveryOptions, recoveryStats, topPrediction);
          return { ...rawDrift, recoveryOptions: ranked };
        })();

        // ── Recovery mode auto-exit ──────────────────────────────────────────
        // If recovery mode was applied, exit it automatically when either:
        //   a) 24 hours have passed since it was applied (stale), or
        //   b) user has completed ≥ 70% of non-constraint, non-recovery tasks.
        // This prevents users getting stuck in RECOVERY all day.
        const { lastRecoveryAppliedAt, dailyDecision: ddForRecovery } = get();
        if (ddForRecovery?.isInRecoveryMode && lastRecoveryAppliedAt) {
          const hoursSince =
            (Date.now() - new Date(lastRecoveryAppliedAt).getTime()) / 3_600_000;
          const taskItems = items.filter(
            (i) => i.blockKind !== 'constraint' && i.blockKind !== 'recovery',
          );
          const completedCount = taskItems.filter((i) => i.completed).length;
          const completionPct  = taskItems.length > 0 ? completedCount / taskItems.length : 0;
          if (hoursSince >= 24 || completionPct >= 0.7) {
            set({ dailyDecision: { ...ddForRecovery, isInRecoveryMode: false } });
          }
        }

        set((s) => ({
          behaviorState: newBehaviorState,
          dayMode: newDayMode,
          activeDrift: newDrift,
        }));

        // Track new drift events (not re-fire of the same ongoing drift)
        if (newDrift && newDrift.id !== currentActiveDrift?.id) {
          track('drift_detected', {
            date:       today,
            drift_type: newDrift.type,
            severity:   newDrift.severity,
          });
        }

        // Delegate to existing enforcement tick (transition phase — keep until parity confirmed)
        get().checkEnforcementTick(nowMins);
      },

      recordInteraction: () =>
        set((s) => ({
          behaviorState: {
            ...s.behaviorState,
            lastInteractionTime: new Date().toISOString(),
            driftLevel: 0,
          },
          // Clear dismissed drift so next tick can detect fresh patterns
          activeDrift: s.activeDrift?.dismissed ? null : s.activeDrift,
        })),

      acknowledgeRecovery: () =>
        set((s) => ({
          behaviorState: {
            ...s.behaviorState,
            dayState: 'in_task',
            recoveryStartedAt: null,
            recoveryDurationMins: 0,
          },
        })),

      endRecoveryEarly: (itemId) => {
        const s = get();
        if (!s.controlPlan) return;
        // Mark recovery item as completed — silent path:
        //   - does NOT increment taskStreakCount or totalCompletedTasks
        //   - does NOT add to skippedPlanItemIds
        //   - does NOT touch taskSkipCount or pressure
        const updatedItems = s.controlPlan.plan.items.map((i) =>
          i.id === itemId ? { ...i, completed: true } : i,
        );
        const skipped = new Set(s.skippedPlanItemIds ?? []);
        const nextBestAction = computeNextBestAction(
          updatedItems.filter(i => !skipped.has(i.id)),
        );
        set({
          controlPlan: {
            ...s.controlPlan,
            plan: { ...s.controlPlan.plan, items: updatedItems },
            nextBestAction,
          },
          // Atomically reset behavior state — recovery is done
          behaviorState: {
            ...s.behaviorState,
            dayState: 'in_task' as DayState,
            recoveryStartedAt: null,
            recoveryDurationMins: 0,
          },
        });
      },

      // ── Review ───────────────────────────────────────────────────────────────

      buildTodayReview: () => {
        const s = get();
        const today = getTodayDate();
        const planItems = s.controlPlan?.plan.items ?? [];
        const criticalDone = planItems.some((i) => !!i.isCritical && i.completed);
        const distractionCount = s.distractionLogs.filter(
          (d) => d.timestamp.startsWith(today),
        ).length;
        // Compute alignment score so it is included in the review snapshot.
        const alignmentResult = computeProgressScore({
          planItems: planItems.filter((i) => i.type !== 'break' && i.type !== 'event'),
          rules: s.rules,
          criticalActionCompleted: criticalDone,
          hasReflection: false,
          distractionCount,
          seriousnessScore: s.profile?.seriousnessScore ?? 7,
        });
        const review = computeDailyReview({
          date: today,
          planItems,
          distractionLogs: s.distractionLogs,
          driftHistory: s.driftHistory,
          activeRecoveryMode: s.activeRecoveryMode,
          taskSkipCount: s.taskSkipCount,
          alignmentScore: alignmentResult.score,
        });
        set({ pendingReview: review });
      },

      saveDailyReviewAction: async (review) => {
        const { session, isGuestMode, dailyReviews } = get();
        // Merge into local store — replace existing entry for this date, keep last 30.
        const updated = [
          ...dailyReviews.filter((r) => r.date !== review.date),
          review,
        ]
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-30);
        set({ dailyReviews: updated, pendingReview: null });
        track('review_saved', {
          date:             review.date,
          completion_rate:  review.totalCount > 0
            ? Math.round((review.completedCount / review.totalCount) * 100) / 100
            : 1,
          focus_minutes:    review.focusMinutes,
          alignment_score:  review.alignmentScore ?? null,
          had_reflection:   review.reflectionText ? 1 : 0,
          system_takeaway:  review.systemTakeaway ?? null,
          drift_count:      review.driftTypes.length,
          recovery_used:    review.recoveryUsed ? 1 : 0,
        });
        // ── Retention analytics: streak events ──────────────────────────────
        if (review.completedCount > 0) {
          const streakData = computeStreakData(updated, review.date);
          if (streakData.recoveryBoostApplied) {
            track('streak_recovered', {
              streak: streakData.currentStreak,
              missed_days: streakData.missedDays,
            });
          } else if (streakData.currentStreak > 1) {
            track('streak_continued', {
              streak: streakData.currentStreak,
            });
          }
        }
        // Sync to Supabase — fire and forget.
        if (session && !isGuestMode) {
          reviewService.saveDailyReview(session.user.id, review).catch(console.warn);
        }
      },

      clearPendingReview: () => set({ pendingReview: null }),

      // ── Cloud sync ───────────────────────────────────────────────────────────

      hydrateFromCloud: async (userId) => {
        set({ isSyncing: true, syncErrors: [] });
        try {
          const today = getTodayDate();
          const data = await cloudHydrate(userId, today);
          const patch: Partial<AppStore> = {
            goals: data.goals,
            skillPlans: data.skillPlans,
            scheduleEvents: data.scheduleEvents,
            rules: data.rules,
            focusSessions: data.focusSessions,
            distractionLogs: data.distractionLogs,
            reflections: data.reflections,
            syncErrors: data.syncErrors,
            isSyncing: false,
          };
          if (data.profile) patch.profile = data.profile;
          // Prefer server-authoritative trial start date over local AsyncStorage value.
          // Guards against reinstall / resetAllData giving a second free trial.
          if (data.trialStartDate) patch.trialStartDate = data.trialStartDate;
          if (data.controlPlan) {
            // getDailyPlan returns nextBestAction:null and nudgeSchedule:[].
            // Recompute both from the restored items so the Planner and Home
            // tabs show the correct state immediately after sign-in.
            const restoredItems = data.controlPlan.plan.items;
            patch.controlPlan = {
              ...data.controlPlan,
              nextBestAction: computeNextBestAction(restoredItems),
              nudgeSchedule: buildNudgeSchedule(restoredItems),
            };
          }
          set(patch);
        } catch (e) {
          console.warn('[store] hydrateFromCloud:', e);
          set({ isSyncing: false, syncErrors: ['sync'] });
        }
      },

      saveProgressSnapshot: async (result, date) => {
        const { session, isGuestMode, distractionLogs } = get();
        if (!session || isGuestMode) return;
        // Use `date` (not getTodayDate()) so historical snapshots count the
        // correct day's distractions rather than today's.
        const distractionCount = distractionLogs.filter(
          (d) => getLocalDateStr(new Date(d.timestamp)) === date,
        ).length;
        progressService
          .saveProgressSnapshot(session.user.id, date, result, distractionCount)
          .catch(console.warn);
      },

      // ── Reset ────────────────────────────────────────────────────────────────

      resetAllData: () =>
        set({
          session: null,
          isGuestMode: false,
          profile: null,
          scheduleEvents: [],
          goals: [],
          skillPlans: [],
          rules: [],
          focusSessions: [],
          activeFocus: null,
          currentPlan: null,
          weeklyPlan: [],
          weeklyPlanGeneratedAt: null,
          weeklyPlanSource: null,
          chatHistory: [],
          tasks: [],
          timeBlocks: [],
          constraints: [],
          plans: [],
          reflections: [],
          controlPlan: null,
          distractionLogs: [],
          activeNudge: null,
          missedTasks: [],
          dailyDecision: null,
          replanSuggested: false,
          lastReplanItemId: null,
          dismissedReplanForItemIds: [],
          enforcementFiredIds: [],
          taskSkipCount: 0,
          taskStreakCount: 0,
          skippedPlanItemIds: [],
          seedLoaded: false,
          trialStartDate: null,
          dayStreak: 0,
          lastCompletionDate: null,
          totalCompletedTasks: 0,
          // v3 behavior OS — reset identity + schedule entry; keep recurringTasks
          // (user-defined routines survive a soft reset, matching habits behavior)
          identityGoals: [],
          todayScheduleEntry: null,
          behaviorState: {
            dayState: 'idle' as DayState,
            driftLevel: 0,
            lastInteractionTime: null,
            currentConstraintId: null,
            recoveryStartedAt: null,
            recoveryDurationMins: 0,
            lateStartDetectedAt: null,
          },
          // aiApiKey intentionally preserved
          dayMode: 'ON_TRACK' as DayMode,
          activeDrift: null,
          activeRecoveryMode: null,
          lastRecoveryAppliedAt: null,
          driftHistory: [],
          dailyReviews: [],
          pendingReview: null,
        }),
    }),
    {
      name: 'lifeos-store-v3',
      // session is ephemeral — Supabase manages its own token storage.
      // We restore it from Supabase on every app start via getSession().
      // taskSkipCount / taskStreakCount are intra-day ephemeral — not persisted.
      partialize: (state) => {
        // session       — ephemeral; Supabase manages token storage
        // taskSkip*     — intra-day ephemeral counters
        // behaviorState — recomputed by tickBehavior on every session start
        // driftHistory  — per-day ephemeral audit log; not needed across restarts
        const {
          session,
          taskSkipCount,
          taskStreakCount,
          skippedPlanItemIds,
          behaviorState,
          driftHistory,
          pendingReview,    // ephemeral — built fresh each session
          ...rest
        } = state as AppStore;
        return rest as AppStore;
      },
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          if (typeof window === 'undefined') return Promise.resolve(null);
          return AsyncStorage.getItem(name);
        },
        setItem: (name, value) => {
          if (typeof window === 'undefined') return Promise.resolve();
          return AsyncStorage.setItem(name, value);
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return Promise.resolve();
          return AsyncStorage.removeItem(name);
        },
      })),
    },
  ),
);

// ─── Selectors ────────────────────────────────────────────────────────────────

export const useTodayTasks = () => {
  const tasks = useAppStore((s) => s.tasks);
  const today = getTodayDate();
  return tasks.filter((t) => t.date === today);
};

export const useTodayPlan = () => {
  const plans = useAppStore((s) => s.plans);
  const today = getTodayDate();
  return plans.find((p) => p.date === today);
};

export const useTodayReflection = () => {
  const reflections = useAppStore((s) => s.reflections);
  const today = getTodayDate();
  return reflections.find((r) => r.date === today);
};

export const useAIContext = () =>
  useAppStore((s) => {
    // Derive review-based coaching signals for the last 3 days.
    const recentReviews = [...s.dailyReviews]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);
    const lastTakeaways = recentReviews
      .map((r) => r.systemTakeaway)
      .filter((t): t is string => !!t);
    const hints = computeAdaptationHints(s.dailyReviews);

    // Predictive signals — top 2 risks for today
    const nowMinsCtx = (() => {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    })();
    const predictions = s.controlPlan
      ? predictDrift(s.controlPlan, s.dailyReviews, hints, nowMinsCtx).slice(0, 2)
      : [];

    // Plan intensity explanation
    const actionableCount = s.controlPlan?.plan.items.filter(
      (i) => i.type === 'goal' || i.type === 'skill',
    ).length ?? 0;
    const planExpl = explainPlanIntensity(hints, actionableCount);

    // Batch 19: Strategic intelligence — weekly + monthly trajectory
    const today        = getTodayDate();
    const weekStart    = getWeekStartForIntelligence(today);
    const siWeekly     = computeWeeklyIntelligence(s.dailyReviews, weekStart);
    const siMonthly    = computeMonthlyIntelligence(s.dailyReviews, today);
    const siMomentum   = getMomentumState(siWeekly);
    const siRecs       = buildStrategicRecommendations(siWeekly, siMonthly);
    const siSummary    = buildStrategicCoachSummary(siWeekly, siMonthly, siRecs);

    return {
      goals: s.goals,
      skillPlans: s.skillPlans,
      rules: s.rules,
      scheduleEvents: s.scheduleEvents,
      mainFocus: s.profile?.mainFocus,
      biggestDistraction: s.profile?.biggestDistraction,
      fixedScheduleStart: s.profile?.fixedScheduleStart,
      fixedScheduleEnd: s.profile?.fixedScheduleEnd,
      focusSessions: s.focusSessions,
      currentPlan: s.controlPlan?.plan,
      todayDate: getTodayDate(),
      // Behavioral signals for coach context
      missedTasksCount: s.missedTasks.filter((t) => t.status === 'pending').length,
      driftScore: s.dailyDecision?.driftScore ?? 0,
      isInRecoveryMode: s.dailyDecision?.isInRecoveryMode ?? false,
      // Review-derived coaching signals — injected into coach system context
      reviewSignals: {
        recentPatterns:           lastTakeaways,
        adaptationRationale:      hints.rationale,
        preferredRecoveryModes:   hints.preferredRecoveryModes,
        reviewCount:              s.dailyReviews.length,
      },
      // Predictive + explanation signals — Batch 8 additions
      predictionSignals: {
        /** Top 2 predicted risks for today (riskType, confidence, headline, rationale). */
        topRisks: predictions.map((p) => ({
          riskType:   p.riskType,
          confidence: p.confidence,
          headline:   p.headline,
          rationale:  p.rationale,
        })),
        /** Plain-text summary of predictions for coach system prompt injection. */
        predictionContext: buildPredictionContext(predictions),
        /** Why today's plan is lighter/heavier — structured explanation. */
        planExplanation: {
          decision:   planExpl.decision,
          reason:     planExpl.reason,
          signal:     planExpl.signal,
          confidence: planExpl.confidence,
        },
      },
      // Batch 19: Strategic intelligence — injected at rich depth by orchestrationEngine
      strategicIntelligence: {
        weekly:          siWeekly,
        monthly:         siMonthly,
        momentumState:   siMomentum,
        recommendations: siRecs,
        coachSummary:    siSummary,
      },
    };
  });
