// ─── Primitive unions ─────────────────────────────────────────────────────────

export type EventCategory = 'class' | 'work' | 'health' | 'personal' | 'social' | 'other';
export type GoalCategory  = 'study' | 'skill' | 'health' | 'life' | 'career';
export type RuleType      = 'screen' | 'focus' | 'sleep' | 'study';
export type SkillLevel    = 'beginner' | 'intermediate' | 'advanced';
export type PlanType      = 'daily' | 'weekly';
export type PlanItemType  = 'goal' | 'skill' | 'break' | 'event' | 'free';
export type ChatRole      = 'user' | 'assistant';

// ─── LifeOS 2.0 identity unions ───────────────────────────────────────────────

export type LifeRole =
  | 'student'
  | 'employee'
  | 'freelancer'
  | 'shift-worker'
  | 'creator'
  | 'other';

export type EnergyStyle =
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'flexible';

export type WorkStyle =
  | 'deep'         // 60–90 min sessions
  | 'balanced'     // 45 min sessions
  | 'short-bursts' // 20–25 min sessions

export type RestStyle =
  | 'active'
  | 'passive'
  | 'social'
  | 'solo';

// ─── User Profile ─────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name?: string;
  mainFocus: string;
  biggestDistraction: string;
  habitToRemove: string;
  habitToBuild: string;
  seriousnessScore: number; // 1–10, kept for internal scoring compatibility
  onboardingComplete: boolean;
  isPro: boolean;
  createdAt: string;

  // ── LifeOS 2.0 identity fields (all optional — backward compatible) ────────
  lifeRole?: LifeRole;
  energyStyle?: EnergyStyle;
  workStyle?: WorkStyle;
  selectedTrackTypes?: string[];     // e.g. ['music', 'coding', 'fitness']
  mainFrictions?: string[];          // e.g. ['phone', 'social_media']
  preferredRestStyle?: RestStyle;
  transformationDirection?: string;  // 12-month vision text
  language?: string;                 // 'en' | 'ar' | 'he' | ...
  fixedScheduleStart?: string;       // "HH:MM" — captured in onboarding
  fixedScheduleEnd?: string;         // "HH:MM" — captured in onboarding
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export interface ScheduleEvent {
  id: string;
  title: string;
  start: string;          // "HH:MM"
  end: string;            // "HH:MM"
  category: EventCategory;
  location?: string;
  notes?: string;
  recurring: boolean;
  daysOfWeek: number[];   // 0 = Sun … 6 = Sat
  createdAt: string;
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export interface Goal {
  id: string;
  title: string;
  category: GoalCategory;
  priority: number;           // 1 = highest
  weeklyHoursTarget: number;
  deadline?: string;          // YYYY-MM-DD
  linkedSkillPlanId?: string;
  createdAt: string;
}

// ─── LifeTrack (product name for Goal — extends with display enrichment) ──────

/**
 * LifeTrack is the product-layer name for a Goal.
 * All Goal fields are preserved for full backward compatibility with
 * planningEngine, progressEngine, Supabase services, and store actions.
 * New fields are optional — existing Goal records are valid LifeTracks.
 */
export interface LifeTrack extends Goal {
  trackType?: string;       // 'music' | 'coding' | 'fitness' | ... | 'custom'
  trackEmoji?: string;      // display enrichment (e.g. '🎵')
  monthlyTarget?: string;   // 30-day system milestone description
  coachNote?: string;       // last AI coach observation for this track
}

// ─── Skill Plans ──────────────────────────────────────────────────────────────

export interface SkillPlanStep {
  id: string;
  title: string;
  completed: boolean;
  durationMinutes?: number;
}

export interface SkillPlan {
  id: string;
  title: string;
  level: SkillLevel;
  weeklyTargetHours: number;
  steps: SkillPlanStep[];
  goalId?: string;
  createdAt: string;
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export interface Rule {
  id: string;
  title: string;
  enabled: boolean;
  type: RuleType;
  startTime?: string;     // "HH:MM" — when the rule activates each day
  endTime?: string;       // "HH:MM" — when it deactivates
  daysOfWeek?: number[];  // undefined/empty → applies every day
  followedToday?: boolean;
  createdAt: string;
}

// ─── Focus Sessions ───────────────────────────────────────────────────────────

export interface FocusSession {
  id: string;
  start: string;           // ISO timestamp
  end?: string;            // ISO timestamp (undefined = still running)
  goalId?: string;
  skillPlanId?: string;
  notes?: string;
  durationMinutes?: number; // computed
}

export interface ActiveFocusSession {
  id: string;
  goalId?: string;
  goalTitle: string;
  startedAt: string;       // ISO
  durationMinutes: number;
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export interface PlanItem {
  id: string;
  startTime: string;    // "HH:MM"
  endTime: string;      // "HH:MM"
  title: string;
  type: PlanItemType;
  goalId?: string;
  skillPlanId?: string;
  eventId?: string;
  notes?: string;
  completed: boolean;
  isCritical?: boolean;
  energyRequired?: 'high' | 'medium' | 'low';
}

export interface Plan {
  id: string;
  type: PlanType;
  dateRange: { start: string; end: string }; // YYYY-MM-DD
  items: PlanItem[];
  generatedAt: string;
  source: 'local' | 'ai';
}

// ─── Control System ───────────────────────────────────────────────────────────

export type NudgeType = 'start' | 'missed' | 'checkin';

export interface NudgeItem {
  id: string;
  itemId: string;         // references PlanItem.id
  itemTitle: string;
  triggerTime: string;    // "HH:MM"
  type: NudgeType;
  snoozedUntil?: string;  // "HH:MM" if snoozed
}

export interface DistractionLog {
  id: string;
  timestamp: string;      // ISO
  note?: string;
}

export interface UserPreferences {
  wakeTime: string;             // "HH:MM"
  sleepTime: string;            // "HH:MM"
  focusBlockMins: number;
  newsLimitMins: number;
  mobilityBufferMins: number;
}

export interface ControlDailyPlan {
  plan: Plan;
  nextBestAction: PlanItem | null;
  nudgeSchedule: NudgeItem[];
  generatedAt: string;
  date: string;
}

// ─── AI / Chat ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  plan?: Plan;             // optionally embedded structured plan
}

// ─── Coach session ────────────────────────────────────────────────────────────

/**
 * Represents a discrete coaching session in the Coach tab.
 * Uses the existing ChatMessage shape for messages.
 * Not yet wired into store state — defined here for type-safe future use.
 */
export interface CoachSession {
  id: string;
  date: string;                // YYYY-MM-DD
  messages: ChatMessage[];
  intent?: string;             // 'plan_day' | 'recover' | 'strategy' | 'free'
  planGenerated?: boolean;
}

// ─── Onboarding identity (new 8-step builder) ─────────────────────────────────

/**
 * Data collected by the LifeOS 2.0 onboarding flow.
 * Maps to UserProfile fields after completion.
 * seriousnessScore kept as internal field — not surfaced as a product concept.
 */
export interface OnboardingIdentity {
  lifeRole: LifeRole;
  fixedScheduleStart?: string;       // "HH:MM"
  fixedScheduleEnd?: string;         // "HH:MM"
  energyStyle: EnergyStyle;
  workStyle: WorkStyle;
  selectedTrackTypes: string[];      // up to 5
  mainFrictions: string[];           // up to 3
  preferredRestStyle?: RestStyle;
  transformationDirection: string;
  // Internal scoring — not displayed as a product metric
  seriousnessScore: number;          // 1–10, drives planning engine weights
}

// ─── Legacy planner compat (kept for existing planner tab) ───────────────────

export type PlanBlockType = 'study' | 'skill' | 'rest';

export interface PlanBlock {
  id: string;
  dayOfWeek: number;
  startTime: string;    // "HH:MM"
  endTime: string;      // "HH:MM"
  type: PlanBlockType;
  goalId?: string;
  note?: string;
  focusMode: boolean;
  completed: boolean;
  createdAt: string;
}

// ─── Legacy daily task/plan (kept for planner Daily mode) ────────────────────

export interface Task {
  id: string;
  title: string;
  durationMinutes: number;
  priority: 'high' | 'medium' | 'low';
  completed: boolean;
  scheduledStart?: string;
  scheduledEnd?: string;
  date: string;
  createdAt: string;
}

export interface TimeBlock {
  id: string;
  startTime: string;
  endTime: string;
  label: string;
  date: string;
}

export interface Constraint {
  id: string;
  description: string;
  startTime?: string;
  endTime?: string;
  active: boolean;
  createdAt: string;
}

export interface ScheduleItem {
  startTime: string;
  endTime: string;
  label: string;
  taskId?: string;
  type: 'task' | 'break' | 'blocked';
}

export interface DailyPlan {
  id: string;
  date: string;
  criticalAction: string;
  schedule: ScheduleItem[];
  generatedAt: string;
}

export interface DailyReflection {
  id: string;
  date: string;
  text: string;
  createdAt: string;
}

// ─── Behavior Engine — Missed Tasks & Daily Decision ─────────────────────────

/**
 * A work-type plan item that was not completed on its scheduled day.
 * Archived automatically when a new day's plan is generated.
 * status:
 *   pending   — still needs attention
 *   recovered — completed in a subsequent session
 *   deferred  — user explicitly moved it out of the queue
 */
export interface MissedTask {
  id: string;
  title: string;
  type: PlanItemType;
  goalId?: string;
  goalTitle?: string;
  isCritical: boolean;
  energyRequired?: 'high' | 'medium' | 'low';
  originalDate: string;     // YYYY-MM-DD — the day it was missed
  status: 'pending' | 'recovered' | 'deferred';
}

/**
 * Per-goal weekly progress assessment.
 * isAtRisk = true when the goal cannot realistically hit its weekly target
 * given logged hours and days remaining.
 */
export interface GoalRiskAssessment {
  goalId: string;
  goalTitle: string;
  weeklyHoursTarget: number;
  loggedHoursThisWeek: number;
  shortfallHours: number;
  daysRemainingInWeek: number;
  isAtRisk: boolean;
  hoursNeededPerRemainingDay: number;
}

/**
 * Output of the daily decision engine.
 * Answers: what matters today, what is at risk, what was missed, am I drifting?
 */
export interface DailyDecision {
  date: string;
  mustDoItems: string[];              // Titles of the top non-negotiable items
  atRiskGoals: GoalRiskAssessment[];  // Only goals that are actively at risk
  missedCarryover: MissedTask[];      // Pending missed tasks from last 7 days
  minimumViableDay: string;           // Human-readable "win condition" for today
  driftScore: number;                 // 0–100: 0 = on track, 100 = severe drift
  isInRecoveryMode: boolean;          // true when drift is significant
  recoveryMessage?: string;           // Contextual message for recovery banner
  generatedAt: string;
}

// ─── Alignment Score ──────────────────────────────────────────────────────────

export interface AlignmentInput {
  tasks: Task[];
  rules: Rule[];
  hasCriticalAction: boolean;
  criticalActionCompleted: boolean;
  hasReflection: boolean;
  seriousnessScore: number;
}

export interface AlignmentResult {
  score: number;
  taskScore: number;
  ruleScore: number;
  criticalScore: number;
  reflectionScore: number;
  label: 'off-track' | 'building' | 'aligned' | 'locked-in';
}
