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
  /** Names of services that failed to load — non-empty means partial data */
  syncErrors: string[];
}

/**
 * Fetch all user data from Supabase in parallel.
 *
 * Uses Promise.allSettled so a single failing service (e.g. network blip on
 * one table) never kills the entire hydration. Each rejected promise is logged
 * and a sensible default (null / []) is used instead.
 *
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

  const results = await Promise.allSettled([
    getProfile(userId),                    // 0
    getGoals(userId),                      // 1
    getSkillPlans(userId),                 // 2
    getScheduleEvents(userId),             // 3
    getRules(userId),                      // 4
    getFocusSessions(userId, since),       // 5
    getDailyPlan(userId, todayDate),       // 6
    getDistractionLogs(userId, since),     // 7
    getReflections(userId),                // 8
    getTrialStartedAt(userId),             // 9
  ]);

  const serviceNames = [
    'profile', 'goals', 'skillPlans', 'scheduleEvents',
    'rules', 'focusSessions', 'controlPlan', 'distractionLogs',
    'reflections', 'trialStartDate',
  ];

  const syncErrors: string[] = [];

  function unwrap<T>(result: PromiseSettledResult<T>, name: string, fallback: T): T {
    if (result.status === 'fulfilled') return result.value;
    console.warn(`[syncService] ${name} failed:`, (result as PromiseRejectedResult).reason);
    syncErrors.push(name);
    return fallback;
  }

  const dbProfile      = unwrap(results[0], serviceNames[0], null);
  const goals          = unwrap(results[1], serviceNames[1], [] as Goal[]);
  const skillPlans     = unwrap(results[2], serviceNames[2], [] as SkillPlan[]);
  const scheduleEvents = unwrap(results[3], serviceNames[3], [] as ScheduleEvent[]);
  const rules          = unwrap(results[4], serviceNames[4], [] as Rule[]);
  const focusSessions  = unwrap(results[5], serviceNames[5], [] as FocusSession[]);
  const controlPlan    = unwrap(results[6], serviceNames[6], null as ControlDailyPlan | null);
  const distractionLogs= unwrap(results[7], serviceNames[7], [] as DistractionLog[]);
  const reflections    = unwrap(results[8], serviceNames[8], [] as DailyReflection[]);
  const trialStartDate = unwrap(results[9], serviceNames[9], null as string | null);

  if (syncErrors.length > 0) {
    console.warn('[syncService] partial sync — failed services:', syncErrors.join(', '));
  }

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
    syncErrors,
  };
}
