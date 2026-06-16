// ─── Primitive unions ─────────────────────────────────────────────────────────

export type EventCategory = 'class' | 'work' | 'health' | 'personal' | 'social' | 'other';
export type GoalCategory  = 'study' | 'skill' | 'health' | 'life' | 'career';
export type RuleType      = 'screen' | 'focus' | 'sleep' | 'study';
export type SkillLevel    = 'beginner' | 'intermediate' | 'advanced';
export type PlanType      = 'daily' | 'weekly';
export type PlanItemType  = 'goal' | 'skill' | 'break' | 'event' | 'free';
export type ChatRole      = 'user' | 'assistant';

// ─── Memory Engine ────────────────────────────────────────────────────────────

export type MemoryEntrySource =
  | 'note'        // user-written text note
  | 'knowledge'   // user-tagged knowledge item
  | 'goal'        // auto-created when a goal is added
  | 'reflection'  // auto-created from daily reflections
  | 'focus'       // auto-created after focus sessions
  | 'ai_insight'; // insights the AI coach surfaces

export interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  source: MemoryEntrySource;
  tags: string[];           // free-form user tags
  linkedGoalId?: string;
  linkedCourseId?: string;     // Phase B: link to Course.id
  linkedTopicId?: string;      // Phase B.5: link to Topic.id
  linkedExamId?: string;       // Phase B.5: link to Exam.id
  linkedAssignmentId?: string; // Phase B.5: link to Assignment.id
  linkedProjectId?: string;    // Phase C: link to Project.id
  linkedMilestoneId?: string;  // Phase C: link to Milestone.id
  createdAt: string;        // ISO
  updatedAt: string;        // ISO
}

// ─── Multi-agent routing ──────────────────────────────────────────────────────

export type AgentType =
  | 'memory'       // retrieval, knowledge questions
  | 'planning'     // scheduling, prioritization
  | 'learning'     // study, exams, weakness detection
  | 'productivity' // focus, habits, distractions
  | 'builder'      // projects, milestones, blockers, velocity
  | 'life';        // general coaching, goal strategy

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

// ─── Goal Intelligence (Phase 3) ─────────────────────────────────────────────

export type GoalRiskLevel = 'on-track' | 'at-risk' | 'critical' | 'stalled';

export interface GoalIntelligence {
  probability: number;          // 0–100 (chance of achieving goal on time)
  riskLevel: GoalRiskLevel;
  riskReason: string;           // human-readable explanation
  lastActivityDate?: string;    // ISO — last focus session on this goal
  weeklyHoursLogged: number;    // focus hours logged this week
  inTodaysPlan: boolean;        // appears in today's control plan
  computedAt: string;           // ISO — when this was last computed
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

export type NudgeType    = 'start' | 'missed' | 'checkin' | 'recovery' | 'opportunity';
export type NudgeUrgency = 'low' | 'medium' | 'high' | 'critical';

export interface NudgeItem {
  id: string;
  itemId: string;              // references PlanItem.id
  itemTitle: string;
  triggerTime: string;         // "HH:MM"
  type: NudgeType;
  snoozedUntil?: string;       // "HH:MM" if snoozed

  // ── Smart Reminder Engine (Phase 2) ────────────────────────────────────────
  contextReason?: string;      // "45 min free · peak energy · exam in 3 days"
  urgency?: NudgeUrgency;
  freeMinutes?: number;        // free window length detected at trigger time
  daysUntilDeadline?: number;  // nearest goal deadline
  isRecovery?: boolean;        // distraction recovery nudge
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

export interface AIAction {
  type:    'create_memory' | 'update_goal' | 'complete_task' | 'create_reminder' | 'create_focus_session';
  data:    Record<string, unknown>;
  status:  'pending' | 'executed' | 'failed';
  message?: string;
}

export interface ChatMessage {
  id:        string;
  role:      ChatRole;
  content:   string;
  createdAt: string;
  plan?:     Plan;         // optionally embedded structured plan
  action?:   AIAction;     // Phase A Sprint 4: AI-requested action
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

// ─── Student System (Phase 4) ─────────────────────────────────────────────────

export type AssignmentType = 'homework' | 'quiz' | 'project' | 'lab' | 'reading' | 'other';
export type ExamType       = 'midterm'  | 'final' | 'quiz'   | 'practical';

// Topic — granular knowledge unit within a Course
export interface Topic {
  id:        string;
  courseId:  string;
  name:      string;           // e.g. "Thread Synchronization"
  createdAt: string;
}

export interface Course {
  id:          string;
  name:        string;
  code?:       string;       // e.g. "CS101"
  instructor?: string;
  creditHours?: number;
  color:       string;       // hex color for card display
  createdAt:   string;
}

export interface Assignment {
  id:            string;
  courseId:      string;
  title:         string;
  type:          AssignmentType;
  dueDate:       string;     // YYYY-MM-DD
  dueTime?:      string;     // HH:MM
  estimatedMins?: number;
  completed:     boolean;
  priority:      'high' | 'medium' | 'low';
  notes?:        string;
  createdAt:     string;
}

export interface Exam {
  id:          string;
  courseId:    string;
  title:       string;
  date:        string;       // YYYY-MM-DD
  time?:       string;       // HH:MM
  location?:   string;
  type:        ExamType;
  durationMins?: number;
  topics:      string[];
  notes?:      string;
  createdAt:   string;
}

// ─── Project System (Phase 5) ─────────────────────────────────────────────────

export type ProjectStatus   = 'active' | 'paused' | 'completed' | 'cancelled';
export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface Project {
  id:           string;
  title:        string;
  description?: string;
  status:       ProjectStatus;
  color:        string;
  deadline?:    string;       // YYYY-MM-DD
  goalId?:      string;       // optional link to a Goal/LifeTrack
  createdAt:    string;
  updatedAt:    string;
}

export interface Milestone {
  id:             string;
  projectId:      string;
  title:          string;
  status:         MilestoneStatus;
  dueDate?:       string;     // YYYY-MM-DD
  estimatedHours?: number;
  completedAt?:   string;     // ISO — used for stagnation detection
  notes?:         string;
  order:          number;     // display order within project
  createdAt:      string;
}

export interface ProjectHealth {
  progress:          number;   // 0–1 (completed milestones / total)
  completedCount:    number;
  totalCount:        number;
  daysSinceActivity: number;   // days since last milestone was completed
  isStalled:         boolean;  // active project with no milestone progress in 7+ days
  stalledReason?:    string;
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
