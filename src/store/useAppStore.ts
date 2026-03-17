import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { setAppLanguage } from '../i18n';
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
} from '../types';
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
import { parseFixedWindow } from '../ai/planningEngine';
import { rescheduleRemaining } from '../ai/adaptiveRescheduler';
import { generateId, getTodayDate, getLocalDateStr } from '../lib/utils';
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

  // ── Seed loaded flag ──────────────────────────────────────────────────────
  seedLoaded: boolean;

  // ── Paywall ───────────────────────────────────────────────────────────────
  paywallSeen: boolean;   // true after user dismisses paywall (not necessarily subscribed)

  // ── Actions ───────────────────────────────────────────────────────────────

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

  // Cloud sync
  hydrateFromCloud: (userId: string) => Promise<void>;
  saveProgressSnapshot: (result: AlignmentResult, date: string) => Promise<void>;

  // Paywall
  setPaywallSeen: () => void;

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
      seedLoaded: false,
      paywallSeen: false,

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

      endFocus: (notes) => {
        const { activeFocus, session, isGuestMode, goals } = get();
        if (!activeFocus) return;
        const linkedGoal = goals.find((g) => g.id === activeFocus.goalId);
        const ended: FocusSession = {
          id: activeFocus.id,
          start: activeFocus.startedAt,
          end: new Date().toISOString(),
          goalId: activeFocus.goalId,
          skillPlanId: linkedGoal?.linkedSkillPlanId,
          notes,
          durationMinutes: Math.round(
            (Date.now() - new Date(activeFocus.startedAt).getTime()) / 60000,
          ),
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
        const { goals, scheduleEvents, skillPlans, rules, profile, session, isGuestMode } = get();

        // Archive missed tasks from the PREVIOUS plan before overwriting it.
        // This must happen before set({ controlPlan }) so we read the old plan.
        get().archiveMissedTasksFromPlan(date);

        const { fixedStart, fixedEnd } = parseFixedWindow(
          profile?.fixedScheduleStart,
          profile?.fixedScheduleEnd,
        );
        const plan = generateControlPlan(goals, scheduleEvents, skillPlans, rules, date, undefined, fixedStart, fixedEnd);
        // Clear replan dismissals — new plan = fresh state.
        set({ controlPlan: plan, replanSuggested: false, dismissedReplanForItemIds: [], lastReplanItemId: null });
        if (session && !isGuestMode) {
          planService.upsertDailyPlan(session.user.id, plan).catch(console.warn);
        }

        // Recompute behavioral snapshot with the new plan.
        get().computeDailyDecisionAction(date);
      },

      toggleControlPlanItem: (itemId) => {
        const s = get();
        if (!s.controlPlan) return;
        const updatedItems = s.controlPlan.plan.items.map((i) =>
          i.id === itemId ? { ...i, completed: !i.completed } : i,
        );
        const nextBestAction = computeNextBestAction(updatedItems);
        const updatedPlan: ControlDailyPlan = {
          ...s.controlPlan,
          plan: { ...s.controlPlan.plan, items: updatedItems },
          nextBestAction,
        };
        set({ controlPlan: updatedPlan });
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
        set((s) => ({ distractionLogs: [log, ...s.distractionLogs] }));
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
      archiveEnforcementDay: () =>
        set({ enforcementFiredIds: [], dismissedReplanForItemIds: [], lastReplanItemId: null, replanSuggested: false }),

      setPaywallSeen: () => set({ paywallSeen: true }),

      // ── Cloud sync ───────────────────────────────────────────────────────────

      hydrateFromCloud: async (userId) => {
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
          };
          if (data.profile) patch.profile = data.profile;
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
          seedLoaded: false,
          paywallSeen: false,
          // aiApiKey intentionally preserved
        }),
    }),
    {
      name: 'lifeos-store-v3',
      // session is ephemeral — Supabase manages its own token storage.
      // We restore it from Supabase on every app start via getSession().
      partialize: (state) => {
        const { session, ...rest } = state as AppStore;
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
  useAppStore((s) => ({
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
  }));
