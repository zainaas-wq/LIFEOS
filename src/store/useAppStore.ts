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
  MemoryEntry,
  MemoryEntrySource,
  GoalIntelligence,
  Course,
  Assignment,
  Exam,
  Topic,
  Project,
  Milestone,
  ProjectHealth,
  Habit,
} from '../types';
import { analyzeAllGoals } from '../ai/goalIntelligence';
import { computeAllReadiness } from '../ai/readinessEngine';
import { detectAcademicRisks }  from '../ai/academicRiskEngine';
import { computeAllWeakness }             from '../ai/weaknessEngine';
import { computeAllProjectIntelligence, detectProjectRisks } from '../ai/projectIntelligenceEngine';
import type { CourseReadiness }           from '../ai/readinessEngine';
import type { AcademicRisk }             from '../ai/academicRiskEngine';
import type { TopicWeakness }            from '../ai/weaknessEngine';
import type { ProjectIntelligence, ProjectRisk } from '../ai/projectIntelligenceEngine';
import * as goalsService from '../services/goalsService';
import * as memoriesService from '../services/memoriesService';
import { triggerEmbedding } from '../services/embeddingService';
import { rescheduleNudges, scheduleNudge, cancelNudge } from '../services/notificationService';
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
import { generateOpportunityNudge } from '../ai/nudgeEngine';
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
  SEED_COURSES,
  SEED_ASSIGNMENTS,
  SEED_EXAMS,
  SEED_TOPICS,
  SEED_PROJECTS,
  SEED_MILESTONES,
  SEED_MEMORIES,
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

  // ── Memory Engine ─────────────────────────────────────────────────────────
  localMemories: MemoryEntry[];

  // ── Goal Intelligence ─────────────────────────────────────────────────────
  goalIntelligence: Record<string, GoalIntelligence>;

  // ── Student System ────────────────────────────────────────────────────────
  courses:          Course[];
  assignments:      Assignment[];
  exams:            Exam[];
  topics:           Topic[];
  courseReadiness:  Record<string, CourseReadiness>;
  academicRisks:    AcademicRisk[];
  topicWeakness:    Record<string, TopicWeakness>;

  // ── Project System ────────────────────────────────────────────────────────
  projects:             Project[];
  milestones:           Milestone[];
  projectIntelligence:  Record<string, ProjectIntelligence>;
  projectRisks:         ProjectRisk[];

  // ── Coach handoff ─────────────────────────────────────────────────────────
  pendingCoachMessage: string | null;

  // ── Habits ────────────────────────────────────────────────────────────────
  habits: Habit[];

  // ── Seed loaded flag ──────────────────────────────────────────────────────
  seedLoaded: boolean;

  // ── Beta Launch ────────────────────────────────────────────────────────────
  hasSeenWelcome:      boolean;
  walkthroughComplete: boolean;
  analyticsOptOut:     boolean;

  // ── Loading ───────────────────────────────────────────────────────────────
  isHydrating: boolean;

  // ── Phase E — Beta Program ────────────────────────────────────────────────
  betaStats: {
    recommendationsShown:    number;
    recommendationsAccepted: number;
    feedbackSubmitted:       boolean;
    installDate:             string | null;   // ISO — set once on first onboarding
    daysActiveTracked:       number[];        // milestone days fired: [1, 3, 7, 14]
  };

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
  computeSmartNudge: () => NudgeItem | null;

  // Memory Engine
  addLocalMemory: (entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateLocalMemory: (id: string, patch: Partial<MemoryEntry>) => void;
  deleteLocalMemory: (id: string) => void;

  // Goal Intelligence
  computeGoalIntelligence: () => void;

  // Student Intelligence
  computeAcademicIntelligence: () => void;
  // Project Intelligence
  computeProjectIntelligence: () => void;

  // Student System
  addCourse:        (c: Omit<Course, 'id' | 'createdAt'>) => void;
  updateCourse:     (id: string, patch: Partial<Course>) => void;
  deleteCourse:     (id: string) => void;
  addAssignment:    (a: Omit<Assignment, 'id' | 'createdAt' | 'completed'>) => void;
  updateAssignment: (id: string, patch: Partial<Assignment>) => void;
  toggleAssignment: (id: string) => void;
  deleteAssignment: (id: string) => void;
  addExam:          (e: Omit<Exam, 'id' | 'createdAt'>) => void;
  updateExam:       (id: string, patch: Partial<Exam>) => void;
  deleteExam:       (id: string) => void;
  // Topic Intelligence
  addTopic:         (t: Omit<Topic, 'id' | 'createdAt'>) => void;
  deleteTopic:      (id: string) => void;

  // Project System
  addProject:       (p: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProject:    (id: string, patch: Partial<Project>) => void;
  deleteProject:    (id: string) => void;
  addMilestone:     (m: Omit<Milestone, 'id' | 'createdAt'>) => void;
  updateMilestone:  (id: string, patch: Partial<Milestone>) => void;
  toggleMilestone:  (id: string) => void;
  deleteMilestone:  (id: string) => void;
  getProjectHealth: (projectId: string) => ProjectHealth;
  getStalledProjects: () => Project[];

  // Coach handoff
  setPendingCoachMessage: (msg: string | null) => void;

  // Cloud sync
  hydrateFromCloud: (userId: string) => Promise<void>;
  saveProgressSnapshot: (result: AlignmentResult, date: string) => Promise<void>;

  // Reset
  resetAllData: () => void;

  // Beta Launch
  setWelcomeSeen:        () => void;
  setWalkthroughComplete: () => void;
  setAnalyticsOptOut:    (value: boolean) => void;

  // Loading
  setIsHydrating: (v: boolean) => void;

  // Phase E — Beta Program
  setBetaFeedbackSubmitted: () => void;
  trackRecommendationShown: () => void;
  trackRecommendationAccepted: () => void;
  markDayActive: (day: number) => void;
  setInstallDate: (date: string) => void;

  // Habits
  addHabit: (h: Omit<Habit, 'id' | 'createdAt' | 'completedDates'>) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleHabitDate: (id: string, date: string) => void;
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
      localMemories: [],
      goalIntelligence: {},
      courses:          [],
      assignments:      [],
      exams:            [],
      topics:           [],
      courseReadiness:  {},
      academicRisks:    [],
      topicWeakness:    {},
      projects:            [],
      milestones:          [],
      projectIntelligence: {},
      projectRisks:        [],
      pendingCoachMessage: null,
      habits:              [],
      seedLoaded: false,
      hasSeenWelcome:      false,
      walkthroughComplete: false,
      analyticsOptOut:     false,
      isHydrating:         false,
      betaStats: {
        recommendationsShown:    0,
        recommendationsAccepted: 0,
        feedbackSubmitted:       false,
        installDate:             null,
        daysActiveTracked:       [],
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

        // Auto-seed identity memories so the AI has immediate context
        const now = new Date().toISOString();
        const identityMemories: MemoryEntry[] = [];

        if (data.lifeRole) {
          identityMemories.push({
            id: generateId(), createdAt: now, updatedAt: now,
            source: 'note' as MemoryEntrySource,
            title: 'My Life Role',
            content: `I am a ${data.lifeRole}. Main focus: ${data.mainFocus || 'Personal growth'}.`,
            tags: ['identity', 'role'],
          });
        }
        if (data.transformationDirection) {
          identityMemories.push({
            id: generateId(), createdAt: now, updatedAt: now,
            source: 'note' as MemoryEntrySource,
            title: '12-Month Vision',
            content: data.transformationDirection,
            tags: ['vision', 'goals'],
          });
        }
        if ((data as any).mainFrictions?.length) {
          identityMemories.push({
            id: generateId(), createdAt: now, updatedAt: now,
            source: 'note' as MemoryEntrySource,
            title: 'Main Frictions',
            content: `My biggest obstacles: ${((data as any).mainFrictions as string[]).join(', ')}.`,
            tags: ['friction', 'challenges'],
          });
        }

        if (identityMemories.length > 0) {
          set((s) => ({ localMemories: [...identityMemories, ...s.localMemories] }));
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
          profile:        SEED_PROFILE,
          scheduleEvents: SEED_SCHEDULE_EVENTS,
          goals:          SEED_GOALS,
          skillPlans:     SEED_SKILL_PLANS,
          rules:          SEED_RULES,
          focusSessions:  SEED_FOCUS_SESSIONS,
          courses:        SEED_COURSES,
          assignments:    SEED_ASSIGNMENTS,
          exams:          SEED_EXAMS,
          topics:         SEED_TOPICS,
          projects:       SEED_PROJECTS,
          milestones:     SEED_MILESTONES,
          localMemories:  SEED_MEMORIES,
          seedLoaded:     true,
        });
        // Compute intelligence immediately so scores appear on first render
        get().computeAcademicIntelligence();
        get().computeProjectIntelligence();
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

        // Auto-create a goal memory so Coach knows what the user is building
        const now = new Date().toISOString();
        const goalMemory: MemoryEntry = {
          id: generateId(), createdAt: now, updatedAt: now,
          source: 'goal' as MemoryEntrySource,
          title: `Goal: ${newGoal.title}`,
          content: `Category: ${newGoal.category}. Target: ${newGoal.weeklyHoursTarget}h/week.${newGoal.deadline ? ` Deadline: ${newGoal.deadline}.` : ''}`,
          tags: ['goal', newGoal.category],
          linkedGoalId: newGoal.id,
        };
        set((s) => ({ localMemories: [goalMemory, ...s.localMemories] }));
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

        // Re-compute goal + academic intelligence with new session data
        const { goals: gs, controlPlan: cp } = get();
        const newSessions = [ended, ...get().focusSessions.slice(1)];
        set({ goalIntelligence: analyzeAllGoals(gs, newSessions, cp?.plan.items ?? []) });
        get().computeAcademicIntelligence();

        // Auto-create a focus memory so the AI knows what was worked on
        if (ended.durationMinutes && ended.durationMinutes >= 5) {
          const now = new Date().toISOString();
          const dateStr = ended.start.slice(0, 10);
          const focusMemory: MemoryEntry = {
            id: generateId(), createdAt: now, updatedAt: now,
            source: 'focus' as MemoryEntrySource,
            title: `Focus: ${activeFocus.goalTitle} — ${ended.durationMinutes}min`,
            content: notes
              ? `Worked on ${activeFocus.goalTitle} for ${ended.durationMinutes} minutes. Notes: ${notes}`
              : `Worked on ${activeFocus.goalTitle} for ${ended.durationMinutes} minutes.`,
            tags: ['focus', dateStr, ...(linkedGoal ? [linkedGoal.category] : [])],
            linkedGoalId: activeFocus.goalId,
          };
          set((s) => ({ localMemories: [focusMemory, ...s.localMemories] }));
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

        // Auto-create or update a reflection memory for pattern analysis
        const now = new Date().toISOString();
        const existingMemId = get().localMemories.find(
          (m) => m.source === 'reflection' && m.tags.includes(date),
        )?.id;
        if (existingMemId) {
          set((s) => ({
            localMemories: s.localMemories.map((m) =>
              m.id === existingMemId
                ? { ...m, content: text, updatedAt: now }
                : m,
            ),
          }));
        } else {
          const reflectionMemory: MemoryEntry = {
            id: generateId(), createdAt: now, updatedAt: now,
            source: 'reflection' as MemoryEntrySource,
            title: `Reflection — ${date}`,
            content: text,
            tags: ['reflection', date],
          };
          set((s) => ({ localMemories: [reflectionMemory, ...s.localMemories] }));
        }
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
        const { fixedStart, fixedEnd } = parseFixedWindow(
          profile?.fixedScheduleStart,
          profile?.fixedScheduleEnd,
        );
        const plan = generateControlPlan(goals, scheduleEvents, skillPlans, rules, date, undefined, fixedStart, fixedEnd, profile);
        set({ controlPlan: plan });
        if (session && !isGuestMode) {
          planService.upsertDailyPlan(session.user.id, plan).catch(console.warn);
        }
        // Sprint 5: schedule OS notifications for all nudge items
        rescheduleNudges(plan.nudgeSchedule).catch(console.warn);
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

        // At 3 distractions trigger a recovery nudge immediately
        const { distractionLogs, controlPlan, goals, profile } = get();
        const today = new Date().toDateString();
        const todayCount = distractionLogs.filter(
          (d) => new Date(d.timestamp).toDateString() === today,
        ).length + 1; // +1 for the log we just added

        if (todayCount === 3 || todayCount === 5 || todayCount === 8) {
          const now = new Date();
          const nowMins = now.getHours() * 60 + now.getMinutes();
          const items = controlPlan?.plan.items ?? [];
          const nudge = generateOpportunityNudge({
            planItems: items,
            goals,
            profile,
            distractionCount: todayCount,
            nowMins,
          });
          if (nudge) set({ activeNudge: nudge });
        }
      },

      computeSmartNudge: () => {
        const { controlPlan, goals, profile, distractionLogs, exams } = get();
        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const today = now.toDateString();
        const todayStr = now.toISOString().slice(0, 10);
        const distractionCount = distractionLogs.filter(
          (d) => new Date(d.timestamp).toDateString() === today,
        ).length;
        const items = controlPlan?.plan.items ?? [];

        // Blend exam deadlines into goal-like deadline pressure
        const upcomingExam = exams
          .filter((e) => e.date >= todayStr)
          .sort((a, b) => a.date.localeCompare(b.date))[0];

        // Synthesize a virtual goal from the nearest exam so nudge engine can use it
        const examGoals: Goal[] = upcomingExam
          ? [{
              id:                `exam-${upcomingExam.id}`,
              title:             upcomingExam.title,
              category:          'study' as const,
              priority:          1,
              weeklyHoursTarget: 5,
              deadline:          upcomingExam.date,
              createdAt:         upcomingExam.createdAt,
            }]
          : [];

        return generateOpportunityNudge({
          planItems: items,
          goals: [...goals, ...examGoals],
          profile,
          distractionCount,
          nowMins,
        });
      },

      setActiveNudge: (nudge) => set({ activeNudge: nudge }),

      dismissNudge: () => {
        const { activeNudge } = get();
        if (activeNudge) cancelNudge(activeNudge.id).catch(console.warn);
        set({ activeNudge: null });
      },

      snoozeNudge: (mins) => {
        set((s) => {
          if (!s.activeNudge) return s;
          const d = new Date();
          d.setMinutes(d.getMinutes() + mins);
          const h = String(d.getHours()).padStart(2, '0');
          const m = String(d.getMinutes()).padStart(2, '0');
          const snoozed = { ...s.activeNudge, snoozedUntil: `${h}:${m}` };
          // Reschedule OS notification for snoozed time
          scheduleNudge(snoozed).catch(console.warn);
          return { activeNudge: snoozed };
        });
      },

      // ── Memory Engine ────────────────────────────────────────────────────────

      addLocalMemory: (entry) => {
        const now = new Date().toISOString();
        const newEntry: MemoryEntry = {
          ...entry,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ localMemories: [newEntry, ...s.localMemories] }));
        // Sprint 1: persist to Supabase
        const { session, isGuestMode } = get();
        if (session && !isGuestMode) {
          memoriesService.upsertMemory(session.user.id, newEntry)
            .then(() => triggerEmbedding(newEntry.id)) // Sprint 2: generate embedding
            .catch(console.warn);
        }
      },

      updateLocalMemory: (id, patch) => {
        const now = new Date().toISOString();
        set((s) => ({
          localMemories: s.localMemories.map((m) =>
            m.id === id ? { ...m, ...patch, updatedAt: now } : m,
          ),
        }));
        const { session, isGuestMode, localMemories } = get();
        if (session && !isGuestMode) {
          const updated = localMemories.find((m) => m.id === id);
          if (updated) {
            memoriesService.upsertMemory(session.user.id, updated)
              .then(() => triggerEmbedding(id)) // re-embed on content change
              .catch(console.warn);
          }
        }
      },

      deleteLocalMemory: (id) => {
        set((s) => ({ localMemories: s.localMemories.filter((m) => m.id !== id) }));
        const { session, isGuestMode } = get();
        if (session && !isGuestMode) {
          memoriesService.deleteMemory(session.user.id, id).catch(console.warn);
        }
      },

      // ── Goal Intelligence ────────────────────────────────────────────────────

      computeGoalIntelligence: () => {
        const { goals, focusSessions, controlPlan } = get();
        const planItems = controlPlan?.plan.items ?? [];
        const intelligence = analyzeAllGoals(goals, focusSessions, planItems);
        set({ goalIntelligence: intelligence });
      },

      // ── Student Intelligence ─────────────────────────────────────────────────

      computeAcademicIntelligence: () => {
        const { courses, assignments, exams, topics, focusSessions, localMemories, goals } = get();
        const today    = getTodayDate();
        const readiness = computeAllReadiness(courses, exams, assignments, focusSessions, localMemories, goals, today);
        const risks     = detectAcademicRisks(readiness, exams, assignments, today);
        const weakness  = computeAllWeakness(topics, courses, localMemories, exams, today);
        set({ courseReadiness: readiness, academicRisks: risks, topicWeakness: weakness });
        // Proactive risk alert: fire once per calendar day if CRITICAL/HIGH risk exists
        const criticalOrHigh = risks.filter((r) => r.riskLevel === 'critical' || r.riskLevel === 'high');
        if (criticalOrHigh.length > 0) {
          import('../services/notificationService').then(({ scheduleProactiveRiskAlert }) => {
            scheduleProactiveRiskAlert(criticalOrHigh).catch(console.warn);
          }).catch(() => {});
        }
      },

      // ── Student System ───────────────────────────────────────────────────────

      addCourse: (c) => {
        const now = new Date().toISOString();
        const course: Course = { ...c, id: generateId(), createdAt: now };
        set((s) => ({ courses: [...s.courses, course] }));
        get().computeAcademicIntelligence();
      },
      updateCourse: (id, patch) => {
        set((s) => ({ courses: s.courses.map((c) => c.id === id ? { ...c, ...patch } : c) }));
        get().computeAcademicIntelligence();
      },
      deleteCourse: (id) => {
        set((s) => ({
          courses:     s.courses.filter((c) => c.id !== id),
          assignments: s.assignments.filter((a) => a.courseId !== id),
          exams:       s.exams.filter((e) => e.courseId !== id),
          topics:      s.topics.filter((t) => t.courseId !== id),
        }));
        get().computeAcademicIntelligence();
      },

      addAssignment: (a) => {
        const now = new Date().toISOString();
        const assignment: Assignment = { ...a, id: generateId(), createdAt: now, completed: false };
        set((s) => ({ assignments: [...s.assignments, assignment] }));
        get().computeAcademicIntelligence();
        // Schedule due-date reminder
        import('../services/notificationService').then(({ scheduleAssignmentReminder }) => {
          const course = get().courses.find((c) => c.id === a.courseId);
          scheduleAssignmentReminder(assignment.id, assignment.title, assignment.dueDate, course?.name ?? a.courseId).catch(console.warn);
        }).catch(() => {});
      },
      updateAssignment: (id, patch) => {
        set((s) => ({ assignments: s.assignments.map((a) => a.id === id ? { ...a, ...patch } : a) }));
        get().computeAcademicIntelligence();
      },
      toggleAssignment: (id) => {
        set((s) => ({
          assignments: s.assignments.map((a) =>
            a.id === id ? { ...a, completed: !a.completed } : a,
          ),
        }));
        get().computeAcademicIntelligence();
      },
      deleteAssignment: (id) => {
        set((s) => ({ assignments: s.assignments.filter((a) => a.id !== id) }));
        get().computeAcademicIntelligence();
      },

      addExam: (e) => {
        const now = new Date().toISOString();
        const exam: Exam = { ...e, id: generateId(), createdAt: now };
        set((s) => ({ exams: [...s.exams, exam] }));
        get().computeAcademicIntelligence();
        // Schedule exam notification on add
        import('../services/notificationService').then(({ scheduleExamReminder }) => {
          const course = get().courses.find((c) => c.id === e.courseId);
          scheduleExamReminder(exam, course?.name ?? e.courseId).catch(console.warn);
        }).catch(() => {});
      },
      updateExam: (id, patch) => {
        set((s) => ({ exams: s.exams.map((e) => e.id === id ? { ...e, ...patch } : e) }));
        get().computeAcademicIntelligence();
      },
      deleteExam: (id) =>
        set((s) => ({ exams: s.exams.filter((e) => e.id !== id) })),

      // ── Topic Intelligence ────────────────────────────────────────────────────

      addTopic: (t) => {
        const topic: Topic = { ...t, id: generateId(), createdAt: new Date().toISOString() };
        set((s) => ({ topics: [...s.topics, topic] }));
        get().computeAcademicIntelligence();
      },
      deleteTopic: (id) => {
        set((s) => ({ topics: s.topics.filter((t) => t.id !== id) }));
        get().computeAcademicIntelligence();
      },

      // ── Project Intelligence ──────────────────────────────────────────────────

      computeProjectIntelligence: () => {
        const { projects, milestones, focusSessions, localMemories, goals } = get();
        const today       = getTodayDate();
        const intelligence = computeAllProjectIntelligence(projects, milestones, focusSessions, localMemories, goals, today);
        const risks        = detectProjectRisks(intelligence, milestones, today);
        set({ projectIntelligence: intelligence, projectRisks: risks });
        // Proactive stagnation alert — once per day
        const stalledRisks = risks.filter((r) => r.riskLevel === 'critical' || r.riskLevel === 'high');
        if (stalledRisks.length > 0) {
          import('../services/notificationService').then(({ scheduleStagnationAlert }) => {
            scheduleStagnationAlert(stalledRisks).catch(console.warn);
          }).catch(() => {});
        }
      },

      // ── Project System ───────────────────────────────────────────────────────

      addProject: (p) => {
        const now = new Date().toISOString();
        const project: Project = { ...p, id: generateId(), createdAt: now, updatedAt: now };
        set((s) => ({ projects: [...s.projects, project] }));
        get().computeProjectIntelligence();
      },
      updateProject: (id, patch) => {
        const now = new Date().toISOString();
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: now } : p,
          ),
        }));
        get().computeProjectIntelligence();
      },
      deleteProject: (id) => {
        set((s) => ({
          projects:   s.projects.filter((p) => p.id !== id),
          milestones: s.milestones.filter((m) => m.projectId !== id),
        }));
        get().computeProjectIntelligence();
      },

      addMilestone: (m) => {
        const now = new Date().toISOString();
        const milestone: Milestone = { ...m, id: generateId(), createdAt: now };
        set((s) => ({ milestones: [...s.milestones, milestone] }));
        get().computeProjectIntelligence();
      },
      updateMilestone: (id, patch) => {
        set((s) => ({
          milestones: s.milestones.map((m) => m.id === id ? { ...m, ...patch } : m),
        }));
        get().computeProjectIntelligence();
      },
      toggleMilestone: (id) => {
        const now = new Date().toISOString();
        set((s) => ({
          milestones: s.milestones.map((m) => {
            if (m.id !== id) return m;
            const completing = m.status !== 'completed';
            return {
              ...m,
              status:      completing ? 'completed' : 'pending',
              completedAt: completing ? now : undefined,
            };
          }),
        }));
        get().computeProjectIntelligence();
      },
      deleteMilestone: (id) => {
        set((s) => ({ milestones: s.milestones.filter((m) => m.id !== id) }));
        get().computeProjectIntelligence();
      },

      getProjectHealth: (projectId) => {
        const { milestones } = get();
        const ms = milestones.filter((m) => m.projectId === projectId);
        const total     = ms.length;
        const completed = ms.filter((m) => m.status === 'completed');
        const completedCount = completed.length;
        const progress  = total > 0 ? completedCount / total : 0;

        // Days since last completed milestone
        const lastCompleted = completed
          .filter((m) => m.completedAt)
          .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];

        const daysSinceActivity = lastCompleted?.completedAt
          ? Math.floor((Date.now() - new Date(lastCompleted.completedAt).getTime()) / 86_400_000)
          : 999;

        const isStalled = total > 0 && completedCount < total && daysSinceActivity >= 7;
        const stalledReason = isStalled
          ? completedCount === 0
            ? 'No milestones completed yet'
            : `No progress in ${daysSinceActivity} days`
          : undefined;

        return { progress, completedCount, totalCount: total, daysSinceActivity, isStalled, stalledReason };
      },

      getStalledProjects: () => {
        const { projects, milestones } = get();
        return projects.filter((p) => {
          if (p.status !== 'active') return false;
          const ms = milestones.filter((m) => m.projectId === p.id);
          if (!ms.length) return false;
          const completed = ms.filter((m) => m.status === 'completed' && m.completedAt);
          if (completed.length === ms.length) return false; // fully done
          const last = completed.sort((a, b) =>
            new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime(),
          )[0];
          // Use project.createdAt as baseline so brand-new projects aren't counted as stalled
          const lastMs = last?.completedAt
            ? new Date(last.completedAt).getTime()
            : new Date(p.createdAt).getTime();
          const days = Math.floor((Date.now() - lastMs) / 86_400_000);
          return days >= 7;
        });
      },

      setPendingCoachMessage: (msg) => set({ pendingCoachMessage: msg }),

      // ── Cloud sync ───────────────────────────────────────────────────────────

      hydrateFromCloud: async (userId) => {
        set({ isHydrating: true });
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
            const restoredItems = data.controlPlan.plan.items;
            patch.controlPlan = {
              ...data.controlPlan,
              nextBestAction: computeNextBestAction(restoredItems),
              nudgeSchedule:  buildNudgeSchedule(restoredItems),
            };
            // Sprint 5: restore OS notification schedule
            rescheduleNudges(patch.controlPlan.nudgeSchedule).catch(console.warn);
          }

          // Sprint 1: hydrate memories from Supabase + migrate local-only entries
          try {
            const cloudMemories = await memoriesService.getMemories(userId);
            if (cloudMemories.length > 0) {
              const { localMemories } = get();
              const cloudIds  = new Set(cloudMemories.map((m) => m.id));
              const localOnly = localMemories.filter((m) => !cloudIds.has(m.id));
              if (localOnly.length > 0) {
                memoriesService.migrateLocalMemories(userId, localOnly).catch(console.warn);
              }
              patch.localMemories = [...cloudMemories, ...localOnly];
            }
          } catch (memErr) {
            console.warn('[store] memory hydration failed:', memErr);
          }

          set(patch);
          // Compute intelligence immediately so scores are available on first render
          get().computeAcademicIntelligence();
          get().computeProjectIntelligence();
        } catch (e) {
          console.warn('[store] hydrateFromCloud:', e);
        } finally {
          set({ isHydrating: false });
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

      setWelcomeSeen:        () => set({ hasSeenWelcome: true }),
      setWalkthroughComplete: () => set({ walkthroughComplete: true }),
      setAnalyticsOptOut:    (value) => set({ analyticsOptOut: value }),
      setIsHydrating:        (v) => set({ isHydrating: v }),

      // ── Phase E ──────────────────────────────────────────────────────────────

      setBetaFeedbackSubmitted: () =>
        set((s) => ({ betaStats: { ...s.betaStats, feedbackSubmitted: true } })),

      trackRecommendationShown: () =>
        set((s) => ({
          betaStats: {
            ...s.betaStats,
            recommendationsShown: s.betaStats.recommendationsShown + 1,
          },
        })),

      trackRecommendationAccepted: () =>
        set((s) => ({
          betaStats: {
            ...s.betaStats,
            recommendationsAccepted: s.betaStats.recommendationsAccepted + 1,
          },
        })),

      markDayActive: (day) =>
        set((s) => ({
          betaStats: {
            ...s.betaStats,
            daysActiveTracked: s.betaStats.daysActiveTracked.includes(day)
              ? s.betaStats.daysActiveTracked
              : [...s.betaStats.daysActiveTracked, day],
          },
        })),

      setInstallDate: (date) =>
        set((s) => ({
          betaStats: {
            ...s.betaStats,
            installDate: s.betaStats.installDate ?? date,
          },
        })),

      // ── Habits ──────────────────────────────────────────────────────────────

      addHabit: (h) => {
        const now = new Date().toISOString();
        set((s) => ({
          habits: [...s.habits, { ...h, id: generateId(), createdAt: now, completedDates: [] }],
        }));
      },

      updateHabit: (id, patch) => {
        set((s) => ({ habits: s.habits.map((h) => h.id === id ? { ...h, ...patch } : h) }));
      },

      deleteHabit: (id) => {
        set((s) => ({ habits: s.habits.filter((h) => h.id !== id) }));
      },

      toggleHabitDate: (id, date) => {
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== id) return h;
            const has = h.completedDates.includes(date);
            return {
              ...h,
              completedDates: has
                ? h.completedDates.filter((d) => d !== date)
                : [...h.completedDates, date],
            };
          }),
        }));
      },

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
          localMemories: [],
          goalIntelligence: {},
          courses: [],
          assignments: [],
          exams: [],
          projects: [],
          milestones: [],
          pendingCoachMessage: null,
          habits: [],
          seedLoaded: false,
          topics: [],
          courseReadiness: {},
          academicRisks: [],
          topicWeakness: {},
          projectIntelligence: {},
          projectRisks: [],
          hasSeenWelcome:      false,
          walkthroughComplete: false,
          analyticsOptOut:     false,
          isHydrating:         false,
          betaStats: {
            recommendationsShown:    0,
            recommendationsAccepted: 0,
            feedbackSubmitted:       false,
            installDate:             null,
            daysActiveTracked:       [],
          },
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
    memories: s.localMemories.slice(0, 30),
    // Sprint 3: full agent context
    reflections:       s.reflections,
    goalIntelligence:  s.goalIntelligence,
    courses:           s.courses,
    assignments:       s.assignments,
    exams:             s.exams,
    projects:          s.projects,
    milestones:        s.milestones,
    distractionCount:  s.distractionLogs.length,
    energyStyle:       s.profile?.energyStyle,
    workStyle:         s.profile?.workStyle,
    // Phase B: academic intelligence
    courseReadiness:   s.courseReadiness,
    academicRisks:     s.academicRisks,
    // Phase B.5: topic intelligence
    topics:            s.topics,
    topicWeakness:     s.topicWeakness,
    // Phase C: project intelligence
    projectIntelligence: s.projectIntelligence,
    projectRisks:        s.projectRisks,
  }));
