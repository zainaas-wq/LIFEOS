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
} from '../types';
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

      completeOnboarding: (data) =>
        set({
          profile: {
            ...data,
            id: generateId(),
            onboardingComplete: true,
            isPro: false,
            createdAt: new Date().toISOString(),
          },
        }),

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

      addScheduleEvent: (e) =>
        set((s) => ({
          scheduleEvents: [
            ...s.scheduleEvents,
            { ...e, id: generateId(), createdAt: new Date().toISOString() },
          ],
        })),

      updateScheduleEvent: (id, patch) =>
        set((s) => ({
          scheduleEvents: s.scheduleEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),

      deleteScheduleEvent: (id) =>
        set((s) => ({ scheduleEvents: s.scheduleEvents.filter((e) => e.id !== id) })),

      // ── Goals ────────────────────────────────────────────────────────────────

      addGoal: (g) =>
        set((s) => ({
          goals: [...s.goals, { ...g, id: generateId(), createdAt: new Date().toISOString() }],
        })),

      updateGoal: (id, patch) =>
        set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),

      deleteGoal: (id) =>
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      // ── Skill plans ──────────────────────────────────────────────────────────

      addSkillPlan: (sp) =>
        set((s) => ({
          skillPlans: [
            ...s.skillPlans,
            { ...sp, id: generateId(), createdAt: new Date().toISOString() },
          ],
        })),

      updateSkillPlan: (id, patch) =>
        set((s) => ({
          skillPlans: s.skillPlans.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)),
        })),

      deleteSkillPlan: (id) =>
        set((s) => ({ skillPlans: s.skillPlans.filter((sp) => sp.id !== id) })),

      toggleSkillStep: (planId, stepId) =>
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
        })),

      // ── Rules ────────────────────────────────────────────────────────────────

      addRule: (rule) => {
        const { rules, profile } = get();
        const isPro = profile?.isPro ?? false;
        if (!isPro && rules.filter((r) => r.enabled).length >= FREE_PLAN_RULE_LIMIT) {
          return false;
        }
        set((s) => ({
          rules: [
            ...s.rules,
            { ...rule, id: generateId(), followedToday: false, createdAt: new Date().toISOString() },
          ],
        }));
        return true;
      },

      updateRule: (id, patch) =>
        set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),

      toggleRule: (id) =>
        set((s) => {
          const isPro = s.profile?.isPro ?? false;
          const rule = s.rules.find((r) => r.id === id);
          if (!rule) return s;
          if (!rule.enabled && !isPro) {
            if (s.rules.filter((r) => r.enabled).length >= FREE_PLAN_RULE_LIMIT) return s;
          }
          return { rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)) };
        }),

      toggleRuleFollowed: (id) =>
        set((s) => ({
          rules: s.rules.map((r) => (r.id === id ? { ...r, followedToday: !r.followedToday } : r)),
        })),

      deleteRule: (id) =>
        set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),

      // ── Focus ────────────────────────────────────────────────────────────────

      startFocus: (session) => set({ activeFocus: session }),

      endFocus: (notes) =>
        set((s) => {
          if (!s.activeFocus) return s;
          const ended: FocusSession = {
            id: s.activeFocus.id,
            start: s.activeFocus.startedAt,
            end: new Date().toISOString(),
            goalId: s.activeFocus.goalId,
            notes,
            durationMinutes: Math.round(
              (Date.now() - new Date(s.activeFocus.startedAt).getTime()) / 60000,
            ),
          };
          return { activeFocus: null, focusSessions: [ended, ...s.focusSessions] };
        }),

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

      saveReflection: (date, text) =>
        set((s) => ({
          reflections: [
            ...s.reflections.filter((r) => r.date !== date),
            { id: generateId(), date, text, createdAt: new Date().toISOString() },
          ],
        })),

      getReflectionForDate: (date) => get().reflections.find((r) => r.date === date),

      // ── Control Engine ───────────────────────────────────────────────────────

      generateControlPlanAction: (date) => {
        const { goals, scheduleEvents, skillPlans, rules } = get();
        const plan = generateControlPlan(goals, scheduleEvents, skillPlans, rules, date);
        set({ controlPlan: plan });
      },

      toggleControlPlanItem: (itemId) =>
        set((s) => {
          if (!s.controlPlan) return s;
          const updatedItems = s.controlPlan.plan.items.map((i) =>
            i.id === itemId ? { ...i, completed: !i.completed } : i,
          );
          const nextBestAction = computeNextBestAction(updatedItems);
          return {
            controlPlan: {
              ...s.controlPlan,
              plan: { ...s.controlPlan.plan, items: updatedItems },
              nextBestAction,
            },
          };
        }),

      reschedulePlan: (date) => {
        const { controlPlan, goals, scheduleEvents, rules } = get();
        if (!controlPlan) return;
        const now = new Date();
        const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const rescheduled = rescheduleRemaining(
          controlPlan.plan, t, goals, scheduleEvents, rules, date,
        );
        set({ controlPlan: { ...controlPlan, plan: rescheduled } });
      },

      logDistraction: (note) =>
        set((s) => ({
          distractionLogs: [
            { id: generateId(), timestamp: new Date().toISOString(), note },
            ...s.distractionLogs,
          ],
        })),

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
