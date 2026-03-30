import { getProfile, dbProfileToLocal } from './profileService';
import { getGoals } from './goalsService';
import { getSkillPlans } from './skillPlansService';
import { getScheduleEvents } from './scheduleService';
import { getRules } from './rulesService';
import { getFocusSessions } from './focusService';
import { getDailyPlan } from './planService';
import { getDistractionLogs } from './distractionService';
import { getReflections } from './reflectionService';
import { getTrialStartedAt } from './usageService';
import type {
  UserProfile,
  Goal,
  SkillPlan,
  ScheduleEvent,
  Rule,
  FocusSession,
  ControlDailyPlan,
  DistractionLog,
  DailyReflection,
} from '../types';

export interface CloudData {
  profile: UserProfile | null;
  goals: Goal[];
  skillPlans: SkillPlan[];
  scheduleEvents: ScheduleEvent[];
  rules: Rule[];
  focusSessions: FocusSession[];
  controlPlan: ControlDailyPlan | null;
  distractionLogs: DistractionLog[];
  reflections: DailyReflection[];
  /** Server-authoritative trial start date from ai_user_tier.trial_started_at */
  trialStartDate: string | null;
}

/**
 * Fetch all user data from Supabase in parallel.
 * Focus sessions and distraction logs are limited to the last 30 days.
 * controlPlan is today's plan only.
 */
export async function hydrateFromCloud(
  userId: string,
  todayDate: string,
): Promise<CloudData> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString();

  const [
    dbProfile,
    goals,
    skillPlans,
    scheduleEvents,
    rules,
    focusSessions,
    controlPlan,
    distractionLogs,
    reflections,
    trialStartDate,
  ] = await Promise.all([
    getProfile(userId),
    getGoals(userId),
    getSkillPlans(userId),
    getScheduleEvents(userId),
    getRules(userId),
    getFocusSessions(userId, since),
    getDailyPlan(userId, todayDate),
    getDistractionLogs(userId, since),
    getReflections(userId),
    getTrialStartedAt(userId),
  ]);

  return {
    profile: dbProfile ? dbProfileToLocal(dbProfile) : null,
    goals,
    skillPlans,
    scheduleEvents,
    rules,
    focusSessions,
    controlPlan,
    distractionLogs,
    reflections,
    trialStartDate,
  };
}
