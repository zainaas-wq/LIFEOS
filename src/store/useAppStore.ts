import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
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
} from '../types';
import * as goalsService from '../services/goalsService';
import * as skillPlansService from '../services/skillPlansService';
import * as scheduleService from '../services/scheduleService';
import * as rulesService from '../services/rulesService';
import * as focusService from '../services/focusService';
import * as planService from '../services/planService';
import * as distractionService from '../services/distractionService';
import * as reflectionService from '../services/reflectionService';
import * as progressService from '../services/progressService';
import { hydrateFromCloud as cloudHydrate } from '../services/syncService';
import { upsertLocalProfile } from '../services/profileService';
import { generateControlPlan, computeNextBestAction } from '../control/controlEngine';
import { rescheduleRemaining } from '../ai/adaptiveRescheduler';
import { generateId, getTodayDate } from '../lib/utils';
import { generateDailyPlan } from '../lib/planGenerator';
import { FREE_PLAN_RULE_LIMIT } from '../lib/rulesEngine';
import { generateWeeklyPlan } from '../lib/weeklyPlanner';
import { generateAIWeeklyPlan } from '../lib/aiPlanner';
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

  // ── Seed loaded flag ──────────────────────────────────────────────────────
  seedLoaded: boolean;

  // ── Actions ───────────────────────────────────────────────────────────────

  // Auth
  setSession: (session: Session | null) => void;
  setGuestMode: (value: boolean) => void;

  // Profile
  setProfile: (profile: UserProfile) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  completeOnboarding: (data: Omit<UserProfile, 'id' | 'onboardingComplete' | 'isPro' | 'createdAt'>) => void;

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

  // Cloud sync
  hydrateFromCloud: (userId: string) => Promise<void>;
  saveProgressSnapshot: (result: AlignmentResult, date: string) => Promise<void>;

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
      seedLoaded: false,

      // ── Auth ────────────────────────────────────────────────────────────────

      setSession: (session) => set({ session }),

      setGuestMode: (value) => set({ isGuestMode: value }),

      // ── Profile ─────────────────────────────────────────────────────────────

      setProfile: (profile) => set({ profile }),

      updateProfile: (patch) =>
        set((s) => ({ profile: s.profile ? { ...s.profile, ...patch } : null })),

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
        const { activeFocus, session, isGuestMode } = get();
        if (!activeFocus) return;
        const ended: FocusSession = {
          id: activeFocus.id,
          start: activeFocus.startedAt,
          end: new Date().toISOString(),
          goalId: activeFocus.goalId,
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
        const { goals, scheduleEvents, rules, profile, aiApiKey } = get();
        if (!aiApiKey) throw new Error('No API key. Go to Settings → AI Planner.');
        const blocks = await generateAIWeeklyPlan({
          goals, scheduleEvents, rules, apiKey: aiApiKey, mainFocus: profile?.mainFocus,
        });
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
        const { session, isGuestMode } = get();
        if (session && !isGuestMode) {
          reflectionService.upsertReflection(session.user.id, reflection).catch(console.warn);
        }
      },

      getReflectionForDate: (date) => get().reflections.find((r) => r.date === date),

      // ── Control Engine ───────────────────────────────────────────────────────

      generateControlPlanAction: (date) => {
        const { goals, scheduleEvents, skillPlans, rules, session, isGuestMode } = get();
        const plan = generateControlPlan(goals, scheduleEvents, skillPlans, rules, date);
        set({ controlPlan: plan });
        if (session && !isGuestMode) {
          planService.upsertDailyPlan(session.user.id, plan).catch(console.warn);
        }
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
        const { controlPlan, goals, scheduleEvents, rules, session, isGuestMode } = get();
        if (!controlPlan) return;
        const now = new Date();
        const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const rescheduled = rescheduleRemaining(
          controlPlan.plan, t, goals, scheduleEvents, rules, date,
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
          if (data.controlPlan) patch.controlPlan = data.controlPlan;
          set(patch);
        } catch (e) {
          console.warn('[store] hydrateFromCloud:', e);
        }
      },

      saveProgressSnapshot: async (result, date) => {
        const { session, isGuestMode, distractionLogs } = get();
        if (!session || isGuestMode) return;
        const today = getTodayDate();
        const distractionCount = distractionLogs.filter(
          (d) => d.timestamp.startsWith(today),
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
          seedLoaded: false,
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
    focusSessions: s.focusSessions,
    currentPlan: s.controlPlan?.plan,
    todayDate: getTodayDate(),
  }));
