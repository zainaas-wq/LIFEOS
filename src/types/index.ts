// ─── Primitive unions ─────────────────────────────────────────────────────────

export type EventCategory = 'class' | 'work' | 'health' | 'personal' | 'social' | 'other';
export type GoalCategory  = 'study' | 'skill' | 'health' | 'life' | 'career';
export type RuleType      = 'screen' | 'focus' | 'sleep' | 'study';
export type SkillLevel    = 'beginner' | 'intermediate' | 'advanced';
export type PlanType      = 'daily' | 'weekly';
export type PlanItemType  = 'goal' | 'skill' | 'break' | 'event' | 'free' | 'habit';
export type NowSource     = 'goal' | 'habit' | 'event' | 'insight' | 'constraint';
export type ChatRole      = 'user' | 'assistant';

// ─── v2 unions ────────────────────────────────────────────────────────────────

/**
 * Operating mode that determines how the planner frames the user's day.
 * employee  — fixed work shift; planner locks shift + inserts post-work recovery
 * student   — weekly class schedule; planner locks classes + builds study sessions around them
 * flexible  — no fixed schedule; planner builds entirely from goals, habits, and energy
 */
export type UserMode = 'employee' | 'student' | 'flexible';

/**
 * User archetype — extends UserMode to support the worker+student dual-constraint case.
 * Used by the behavior engine and onboarding flow.
 *
 * worker         — fixed or variable work shifts only
 * student        — class schedule only
 * worker_student — both work and study constraints merged, never overlapping
 * flexible       — no fixed schedule; build entirely from identity goals + routines
 */
export type UserType = 'worker' | 'student' | 'worker_student' | 'flexible';

/**
 * How the user's constraint schedule is known ahead of time.
 * fixed        — same start/end every working day (from profile.fixedScheduleStart/End)
 * weekly_known — user sets the schedule once per week
 * daily_input  — user inputs today's hours each morning (or AI asks)
 */
export type ScheduleType = 'fixed' | 'weekly_known' | 'daily_input';

/**
 * Semantic kind of a plan block, used by the timeline and Command Strip
 * to render the correct visual treatment without altering PlanItemType.
 */
export type BlockKind =
  | 'task'        // regular goal / skill session
  | 'constraint'  // locked work shift or class block
  | 'recovery'    // meal / rest / recharge after demanding block
  | 'reward'      // controlled break after critical completion
  | 'habit'       // injected daily habit
  | 'buffer';     // micro-block (news cap, mobility)

export type RecoveryType = 'meal_recovery' | 'rest' | 'recharge' | 'reward_break';

export type PressureLevel = 'normal' | 'elevated' | 'critical';
export type PressureGrade = 0 | 1 | 2 | 3;

// ─── LifeOS identity unions ───────────────────────────────────────────────────

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
  | 'deep'          // 60–90 min sessions
  | 'balanced'      // 45 min sessions
  | 'short-bursts'; // 20–25 min sessions

export type RestStyle =
  | 'active'
  | 'passive'
  | 'social'
  | 'solo';

// ─── Language registry ────────────────────────────────────────────────────────

export interface LanguageEntry {
  code: string;        // BCP-47 locale code, e.g. 'en', 'ar', 'he', 'fr'
  englishName: string; // e.g. 'Arabic'
  nativeName: string;  // e.g. 'العربية'
  isRTL: boolean;
  flag?: string;       // emoji flag, e.g. '🇸🇦'
  isFullyTranslated: boolean; // false = UI strings fall back to English
}

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

  // ── v2 identity fields (all optional — backward compatible) ────────────────
  userMode?: UserMode;
  lifeRole?: LifeRole;
  energyStyle?: EnergyStyle;
  workStyle?: WorkStyle;
  selectedTrackTypes?: string[];     // e.g. ['music', 'coding', 'fitness']
  mainFrictions?: string[];          // e.g. ['phone', 'social_media']
  preferredRestStyle?: RestStyle;
  transformationDirection?: string;  // 12-month vision text
  language?: string;                 // BCP-47 locale code
  fixedScheduleStart?: string;       // "HH:MM" — work/study window start
  fixedScheduleEnd?: string;         // "HH:MM" — work/study window end

  // ── v3 behavior OS fields (all optional — backward compatible) ─────────────
  userType?: UserType;               // replaces/extends userMode for new onboarding
  scheduleType?: ScheduleType;       // how the constraint schedule is known
  offDays?: number[];                // 0=Sun…6=Sat — rest/off days (e.g. [5,6] = Fri+Sat)
  skipTasksOnOffDays?: boolean;      // whether recurring tasks are suppressed on off days
  avatarUrl?: string;                // Supabase Storage public URL for profile photo
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
  updatedAt?: string;     // ISO — used for last-write-wins cloud sync
}

// ─── Constraint Block ─────────────────────────────────────────────────────────

/**
 * A locked, non-negotiable time block that the scheduler cannot move.
 * Derived from ScheduleEvent (category='work'|'class') or the user's
 * fixedScheduleStart/End window.
 *
 * requiresRecoveryAfter: if true, Recovery Engine inserts a rest/meal
 * block immediately after this block ends.
 */
export interface ConstraintBlock {
  id: string;
  type: 'work' | 'class' | 'appointment' | 'commute';
  label: string;
  startTime: string;              // "HH:MM"
  endTime: string;                // "HH:MM"
  daysOfWeek: number[];
  requiresRecoveryAfter: boolean;
  recoveryDurationMins: number;   // minutes (e.g. 60 after work, 25 after class)
  recoveryType: RecoveryType;
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
  updatedAt?: string;         // ISO — last-write-wins sync
}

// ─── LifeTrack (product layer name for Goal) ──────────────────────────────────

/**
 * LifeTrack extends Goal with display enrichment.
 * All Goal fields are preserved for full backward compatibility.
 * Existing Goal records are valid LifeTracks.
 */
export interface LifeTrack extends Goal {
  trackType?: string;       // 'music' | 'coding' | 'fitness' | ... | 'custom'
  trackEmoji?: string;      // e.g. '🎵'
  monthlyTarget?: string;   // 30-day milestone description
  coachNote?: string;       // last AI coach observation
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

// ─── Habits (legacy — kept for backward compat) ───────────────────────────────

export interface HabitItem {
  id: string;
  title: string;
  durationMinutes: number;
  preferredTime?: string;    // "HH:MM"
  completedDates: string[];  // YYYY-MM-DD
  createdAt: string;
  updatedAt?: string;        // ISO — last-write-wins sync
}

// ─── Recurring Tasks (replaces HabitItem — v3 behavior OS) ───────────────────

/**
 * Semantic category of a recurring task.
 * Used for energy-aware placement in the daily timeline and colour coding.
 *
 * deep_work — cognitively demanding sessions (coding, writing, focused study)
 * body      — physical health (workout, mobility, nutrition prep)
 * recovery  — rest, meditation, passive recharge
 * religion  — prayer, reflection, spiritual practice
 * admin     — errands, email, low-energy maintenance tasks
 * learning  — reading, courses, skill-building (lighter than deep_work)
 */
export type RecurringTaskCategory =
  | 'deep_work'
  | 'body'
  | 'recovery'
  | 'religion'
  | 'admin'
  | 'learning';

/**
 * A recurring task / daily routine.
 * Replaces HabitItem for new users.  HabitItem records are auto-migrated
 * to RecurringTask (category='body', daysOfWeek=[0..6], skipOnOffDays=false).
 *
 * RecurringTask is a structural superset of HabitItem and is assignable
 * to HabitItem[] for backward-compatible engine calls.
 */
export interface RecurringTask {
  id: string;
  title: string;
  durationMinutes: number;
  category: RecurringTaskCategory;
  daysOfWeek: number[];          // 0=Sun…6=Sat; [0,1,2,3,4,5,6] = every day
  skipOnOffDays: boolean;        // if true, skip on profile.offDays
  preferredTime?: string;        // "HH:MM" scheduling hint
  completedDates: string[];      // YYYY-MM-DD
  createdAt: string;
  updatedAt?: string;
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export interface Rule {
  id: string;
  title: string;
  enabled: boolean;
  type: RuleType;
  startTime?: string;     // "HH:MM"
  endTime?: string;       // "HH:MM"
  daysOfWeek?: number[];
  followedToday?: boolean;
  createdAt: string;
  updatedAt?: string;     // ISO — last-write-wins sync
}

// ─── Focus Sessions ───────────────────────────────────────────────────────────

export interface FocusSession {
  id: string;
  start: string;           // ISO timestamp
  end?: string;            // ISO timestamp (undefined = still running)
  goalId?: string;
  skillPlanId?: string;
  notes?: string;
  durationMinutes?: number; // computed at session end
}

export interface ActiveFocusSession {
  id: string;
  goalId?: string;
  goalTitle: string;
  startedAt: string;       // ISO
  durationMinutes: number;
  /** Updated every 5 minutes while the session is active. Used to recover
   *  partial sessions after an app kill — actual elapsed time = now - startedAt,
   *  capped to lastCheckpointAt so we don't log time that was never tracked. */
  lastCheckpointAt?: string; // ISO
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export interface PlanItem {
  id: string;
  startTime: string;          // "HH:MM"
  endTime: string;            // "HH:MM"
  title: string;
  type: PlanItemType;
  goalId?: string;
  skillPlanId?: string;
  eventId?: string;
  notes?: string;
  completed: boolean;
  isCritical?: boolean;
  energyRequired?: 'high' | 'medium' | 'low';
  source?: NowSource;

  // ── v2 extensions (all optional — backward compatible) ────────────────────
  /** Semantic kind for timeline rendering. Does not affect scheduling logic. */
  blockKind?: BlockKind;
  /**
   * Display-only label added by studentScheduler.
   * NEVER mutate `title` — use this field instead.
   * e.g. "[Deep Work]" phase label for deadline-driven goals.
   */
  displayLabel?: string;
  /** Minimum useful session length in minutes. Used by task shortening logic. */
  minViableDuration?: number;
  /** Set by Adaptive Scheduler when task was shortened to fit available time. */
  sizingMode?: 'full' | 'condensed' | 'minimal';
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

export interface ControlDailyPlan {
  plan: Plan;
  nextBestAction: PlanItem | null;
  nudgeSchedule: NudgeItem[];
  generatedAt: string;
  date: string;
}

// ─── Task Sizing ──────────────────────────────────────────────────────────────

/**
 * Result of sizeTaskToFit().
 * null means the task cannot fit in any viable form and should be deferred.
 */
export interface TaskSizingResult {
  duration: number;
  mode: 'full' | 'condensed' | 'minimal';
}

// ─── Command Context ──────────────────────────────────────────────────────────

/**
 * Full context for the Command Strip.
 * Returned by the enhanced computeNextBestAction.
 */
export interface CommandContext {
  item: PlanItem | null;
  urgency: 'calm' | 'elevated' | 'critical';
  /** Minutes remaining in this block */
  timeRemaining: number;
  canShorten: boolean;
  minViableDuration: number;
  /** True when the current command is a recovery block, not a task */
  isRecovery: boolean;
  recoveryType?: RecoveryType;
}

// ─── Pressure Info ────────────────────────────────────────────────────────────

export interface PressureInfo {
  level: PressureLevel;
  grade: PressureGrade;
  /** Minutes of available work time left in the day */
  remainingMins: number;
  /** Total minutes required for all remaining tasks */
  requiredMins: number;
  /** requiredMins / remainingMins — >1.0 means behind schedule */
  timeRatio: number;
}

// ─── AI / Chat ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  plan?: Plan;
  /** Credits deducted for this AI response (undefined on user messages). */
  creditCost?: number;
  /** The request mode that generated this response. */
  requestMode?: 'text' | 'voice' | 'image';
}

// ─── Behavior Engine — Missed Tasks & Daily Decision ─────────────────────────

export interface MissedTask {
  id: string;
  title: string;
  type: PlanItemType;
  goalId?: string;
  goalTitle?: string;
  isCritical: boolean;
  energyRequired?: 'high' | 'medium' | 'low';
  originalDate: string;     // YYYY-MM-DD
  status: 'pending' | 'recovered' | 'deferred';
}

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

export interface DailyDecision {
  date: string;
  mustDoItems: string[];
  atRiskGoals: GoalRiskAssessment[];
  missedCarryover: MissedTask[];
  minimumViableDay: string;
  driftScore: number;           // 0–100
  isInRecoveryMode: boolean;
  recoveryMessage?: string;
  generatedAt: string;
}

// ─── Alignment Score ──────────────────────────────────────────────────────────

export interface AlignmentResult {
  score: number;
  taskScore: number;
  ruleScore: number;
  criticalScore: number;
  reflectionScore: number;
  label: 'off-track' | 'building' | 'aligned' | 'locked-in';
}

// ─── User Preferences (control engine) ───────────────────────────────────────

/**
 * Runtime planning preferences derived from rules + profile.
 * Used by controlEngine.ts to configure micro-block insertion.
 */
export interface UserPreferences {
  wakeTime: string;          // "HH:MM" — day start
  sleepTime: string;         // "HH:MM" — day end
  focusBlockMins: number;    // preferred focus session length
  newsLimitMins: number;     // daily news consumption cap
  mobilityBufferMins: number; // break inserted after long focus blocks
}

// ─── Identity Goals ───────────────────────────────────────────────────────────

/**
 * What the user fundamentally wants to become.
 * Identity goals drive the behavior engine's framing and coaching tone.
 * They are NOT scheduling inputs — they provide the "why" behind tasks.
 */
export type IdentityGoalType =
  | 'disciplined'
  | 'fit'
  | 'career'
  | 'studying'
  | 'less_distraction'
  | 'creative'
  | 'spiritual'
  | 'financial'
  | 'social';

export interface IdentityGoal {
  id: string;
  type: IdentityGoalType;
  customLabel?: string;    // overrides the default display label
  createdAt: string;
}

// ─── Daily Schedule Entry (variable schedule support) ─────────────────────────

/**
 * Single-day schedule override.
 * Used when scheduleType === 'daily_input' or 'weekly_known'.
 * The system prompts the user each morning; the response is stored here
 * and passed to scheduleInputService to build today's ConstraintBlock[].
 */
export interface DailyScheduleEntry {
  date: string;           // YYYY-MM-DD
  workStart?: string;     // "HH:MM" — undefined means no work today
  workEnd?: string;
  studyStart?: string;
  studyEnd?: string;
  noWorkToday?: boolean;  // explicit "off day" override for this date
}

// ─── Behavior State Machine ───────────────────────────────────────────────────

/**
 * The user's current behavioral state.
 * Computed by tickBehavior() on every app foreground event and 60-second timer.
 * Used by the Command Layer (home screen) to determine what to show and say.
 *
 * idle          — day not started; before first block
 * in_constraint — locked work or study block is currently active
 * in_recovery   — post-constraint recovery window (all task commands suppressed)
 * in_task       — scheduled task window is active; user expected to be working
 * drifting      — task window active but user has been inactive > threshold
 * late_start    — app opened late; expired blocks need rebuild
 * blocked       — all tasks complete or past end-of-day
 */
export type DayState =
  | 'idle'
  | 'in_constraint'
  | 'in_recovery'
  | 'in_task'
  | 'drifting'
  | 'late_start'
  | 'blocked';

/**
 * Runtime behavior state — NOT persisted (recomputed by tickBehavior each session).
 */
export interface BehaviorState {
  dayState: DayState;
  driftLevel: 0 | 1 | 2 | 3 | 4;
  /**
   * ISO timestamp reset on every user interaction.
   * Used to compute inactivity duration for drift detection.
   */
  lastInteractionTime: string | null;
  /** ID of the PlanItem currently active as a constraint. Null otherwise. */
  currentConstraintId: string | null;
  /**
   * ISO timestamp set when IN_RECOVERY begins.
   * Cleared on transition out of recovery.
   */
  recoveryStartedAt: string | null;
  /** Duration of the active recovery window in minutes. */
  recoveryDurationMins: number;
  /**
   * ISO timestamp set when LATE_START is first detected.
   * Prevents repeated late-start triggers in the same session.
   */
  lateStartDetectedAt: string | null;
}

/**
 * Output of computeCommand() — the active behavioral command rendered on home.
 * Pure derived state — never persisted.
 */
export interface CommandOutput {
  /** State chip label e.g. "Recovery" | "Work" | "Task" */
  label: string;
  /** Primary command text e.g. "Rest now. Come back at 19:00." */
  text: string;
  /** Supporting detail line */
  subtext?: string;
  /** Button label e.g. "I'm ready" | "Start" | "Adjust day" */
  actionLabel: string;
  actionType:
    | 'start_task'
    | 'acknowledge_recovery'
    | 'rebuild_day'
    | 'record_interaction'
    | 'none';
  urgency: 'calm' | 'elevated' | 'critical';
}

// ─── Day Mode — visible execution state ──────────────────────────────────────

/**
 * The user-facing operational mode of the day.
 * Computed by driftEngine.computeDayMode() and surfaced on the Home screen
 * as a persistent status strip.
 *
 * ON_TRACK  — pressure is low, no critical drift signals
 * DRIFTING  — system has detected a drift pattern (skips, inactivity, overload)
 * CRITICAL  — severe drift or impossible day; immediate intervention required
 * RECOVERY  — user is in a structured recovery block or has triggered recovery mode
 */
export type DayMode = 'ON_TRACK' | 'DRIFTING' | 'CRITICAL' | 'RECOVERY';

// ─── Drift — explicit drift taxonomy ─────────────────────────────────────────

/**
 * The specific drift pattern the system has detected.
 *
 * late_start    — user opened the app late; expired blocks exist
 * avoidance     — repeated task skipping with no recovery action
 * overload      — required time exceeds available time (timeRatio > 1.3)
 * distraction   — ≥ 2 distractions logged today, or drift from inactivity
 * fragmented_day— high skip count + low completion + mid-day; no coherent focus
 */
export type DriftType =
  | 'late_start'
  | 'avoidance'
  | 'overload'
  | 'distraction'
  | 'fragmented_day';

/**
 * A detected drift event surfaced to the UI.
 * Replaces the silent internal driftLevel with an explicit, actionable signal.
 */
export interface DriftEvent {
  type: DriftType;
  detectedAt: string;             // ISO timestamp
  date: string;                   // YYYY-MM-DD — O(1) staleness check across day boundary
  severity: 'low' | 'medium' | 'high';
  /** i18n key for the user-facing explanation. */
  messageKey: string;
  /** i18n key for the sub-line detail. */
  detailKey: string;
  /** Recovery modes available for this drift type. */
  recoveryOptions: RecoveryMode[];
  dismissed: boolean;
}

/**
 * Per-day audit record of a drift event that had recovery applied.
 * Ephemeral — NOT persisted. Cleared on plan regen and day boundary.
 */
export interface DriftRecord {
  type: DriftType;
  severity: 'low' | 'medium' | 'high';
  detectedAt: string;             // ISO
  date: string;                   // YYYY-MM-DD
  recoveryApplied: RecoveryMode | null;
}

/**
 * Metadata about the most recent recovery action applied.
 * Persisted so dedup guard survives foreground/background cycles.
 */
export interface RecoveryRecord {
  mode: RecoveryMode;
  appliedAt: string;              // ISO
  date: string;                   // YYYY-MM-DD
}

// ─── Recovery Mode ────────────────────────────────────────────────────────────

/**
 * Structured recovery action the user can invoke.
 *
 * save_day      — keep critical + top-2 must-do items, defer everything else
 * critical_only — drop all non-critical plan items; focus on one thing
 * resume_now    — shift all remaining items to start from current time
 * compress_day  — reduce session durations by ~30% to fit more in remaining time
 */
export type RecoveryMode = 'save_day' | 'critical_only' | 'resume_now' | 'compress_day';

// ─── Why-This-Now — command explanation ──────────────────────────────────────

/**
 * Explanation attached to the active NowAction.
 * Derived from goal priority, deadline urgency, drift score, and pressure.
 * Displayed below the NowAction card to answer "why this, why now".
 */
export interface WhyThisNow {
  /** Short reason why this task is the next best action. */
  reason: string;
  /** What is at risk if this task is skipped. */
  risk: string;
  /** The goal this task belongs to (optional). */
  goalTitle?: string;
  urgencyLevel: 'normal' | 'high' | 'critical';
}

// ─── Daily Review ─────────────────────────────────────────────────────────────

/**
 * End-of-day review record.
 * Stored locally and optionally synced to ai_user_memory via memoryService.
 */
export interface DailyReview {
  date: string;                   // YYYY-MM-DD
  completedCount: number;
  totalCount: number;
  focusMinutes: number;
  criticalDone: boolean;
  driftTypes: DriftType[];        // which drifts were detected today
  recoveryUsed: boolean;
  recoveryMode?: RecoveryMode;
  reflectionText?: string;
  alignmentScore?: number;
  savedAt: string;                // ISO
  // Batch 3 — behavioral signal fields
  distractionCount?: number;      // distractions logged today
  skipCount?: number;             // tasks explicitly skipped today
  whatWorked?: string;            // user-entered free text
  whatFailed?: string;            // user-entered free text
  tomorrowFocus?: string;         // user-entered single focus for tomorrow
  systemTakeaway?: string;        // machine-derived pattern tag (e.g. 'avoidance_pattern')
}

// ─── Weekly Review ────────────────────────────────────────────────────────────

/**
 * Per-day summary row inside a WeeklyReview.
 * Computed from DailyReview records.
 */
export interface WeeklyDaySummary {
  date: string;             // YYYY-MM-DD
  completionRate: number;   // 0–1
  focusMinutes: number;
  driftCount: number;       // distinct drift types detected
  recoveryUsed: boolean;
}

/**
 * Weekly execution summary.
 * Computed by reviewEngine.computeWeeklyReview() from 7 DailyReview records.
 * Not persisted to the store — computed on demand.
 */
export interface WeeklyReview {
  weekStart: string;                    // YYYY-MM-DD (Monday)
  weekEnd: string;                      // YYYY-MM-DD (Sunday)
  dailySummaries: WeeklyDaySummary[];   // one per reviewed day
  avgCompletionRate: number;            // 0–1 mean across days with tasks
  totalFocusMinutes: number;
  dominantDriftType: DriftType | null;  // most frequent drift this week
  recoveryCount: number;                // days where recovery was used
  avgAlignmentScore: number;            // 0–100 mean, 0 if no scores
  coachNote?: string;                   // future: AI-generated weekly insight
  savedAt: string;                      // ISO
}

// ─── Review Memory Signal ─────────────────────────────────────────────────────

/**
 * A signal derived from a daily review that is written to ai_user_memory.
 * Used by reviewService to call memoryService.upsertMemory() after review save.
 */
export interface ReviewMemorySignal {
  /** Which memory table category this signal targets. */
  signalType: 'productivity_pattern' | 'coaching_preference';
  /** JSON-serialized signal payload. */
  content: string;
  /** YYYY-MM-DD of the review this signal was derived from. */
  date: string;
}

// ─── Adaptation hints ─────────────────────────────────────────────────────────

/**
 * Computed from the last N daily reviews.
 * Passed to generateSmartDailyPlan to adapt tomorrow's plan.
 * All fields are deterministic, explainable, and traceable via `rationale`.
 */
export interface AdaptationHints {
  /**
   * Daily scheduling cap multiplier (0.5–0.8).
   * Default 0.8 (same as planner baseline). Reduced for overload_pattern users.
   */
  capMultiplier: number;
  /**
   * Cap the first goal/skill session to this many minutes.
   * null = no cap. Applied when avoidance_pattern detected (start small → build momentum).
   */
  firstSessionCapMins: number | null;
  /**
   * Bias task ordering so high-energy (deep-work) items are placed first.
   * Applied when distraction_heavy detected (protect focus window at day start).
   */
  preferHighEnergyFirst: boolean;
  /**
   * Recovery modes ranked by past effectiveness for this user.
   * Used to re-sort drift event `recoveryOptions` in tickBehavior.
   * Empty = keep default drift event ordering.
   */
  preferredRecoveryModes: RecoveryMode[];
  /** Human-readable explanation of every active adaptation (for tracing + coach context). */
  rationale: string;
  /** Number of recent reviews this was derived from. */
  reviewCount: number;
}

// ─── Weekly / Monthly Intelligence — Batch 19 ────────────────────────────────

/**
 * High-level character of a week derived from review + drift signals.
 *
 * strong           — high completion, low drift
 * stable           — consistent moderate performance
 * volatile         — high variance between days
 * overloaded       — overload drift is dominant pattern
 * rebuilding       — recovery used >= 3 days; system is self-correcting
 * insufficient_data — fewer than 3 reviewed days; no reliable pattern yet
 */
export type WeekCharacter =
  | 'strong'
  | 'stable'
  | 'volatile'
  | 'overloaded'
  | 'rebuilding'
  | 'insufficient_data';

/**
 * Direction of the user's execution momentum.
 */
export type MomentumState =
  | 'building'          // improving trend, quality rising
  | 'maintaining'       // flat but consistently good
  | 'recovering'        // was worse, now visibly improving
  | 'stalled'           // flat or declining, low quality
  | 'insufficient_data';

/**
 * A single actionable strategic recommendation derived from weekly/monthly signals.
 */
export interface StrategicRecommendation {
  /** Short action directive (e.g. "reduce weekly load"). */
  action: string;
  /** Why this action is recommended now. */
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  /** The signal that triggered this recommendation. */
  signal: string;
}

/**
 * Weekly intelligence — computed from DailyReview[] for a given 7-day window.
 * Pure derived state; never persisted. Recomputed on demand from review records.
 */
export interface WeeklyIntelligence {
  weekStart: string;                   // YYYY-MM-DD (Monday)
  weekEnd: string;                     // YYYY-MM-DD (Sunday)
  reviewedDays: number;                // 0–7: number of days with a saved review
  avgCompletionRate: number;           // 0–1 mean across days with tasks
  totalFocusMinutes: number;
  completionRates: number[];           // per-day completion rates (chronological order)
  recoveryDependence: 'none' | 'occasional' | 'frequent';
  dominantDriftPattern: DriftType | null;
  weekCharacter: WeekCharacter;
  executionQuality: 'high' | 'medium' | 'low' | 'insufficient_data';
  reviewConsistency: number;           // 0–1 (reviewedDays / 7)
  momentumTrend: 'improving' | 'flat' | 'declining' | 'insufficient_data';
  systemTakeaways: string[];           // daily systemTakeaway tags (non-null only)
}

/**
 * Monthly intelligence — computed from DailyReview[] for the last 30 days.
 * Data-sparse guard: most fields are 'insufficient_data' with < 7 reviewed days.
 */
export interface MonthlyIntelligence {
  periodStart: string;    // YYYY-MM-DD 30 days before periodEnd
  periodEnd: string;      // YYYY-MM-DD (today)
  reviewedDays: number;
  avgCompletionRate: number;
  executionTrend: 'improving' | 'declining' | 'oscillating' | 'flat' | 'insufficient_data';
  routineStability: 'stable' | 'unstable' | 'insufficient_data';
  /** Drift types that appeared in >= 40% of reviewed days. */
  repeatedBreakdownPatterns: DriftType[];
  monthlyInterpretation: 'progressing' | 'oscillating' | 'decaying' | 'building' | 'insufficient_data';
}

/**
 * Full strategic intelligence packet — weekly + monthly + derived signals.
 * Injected into the AI coach context at 'rich' depth.
 */
export interface StrategicIntelligenceSummary {
  weekly: WeeklyIntelligence;
  monthly: MonthlyIntelligence;
  momentumState: MomentumState;
  recommendations: StrategicRecommendation[];
  /** Compact prompt section ready for system prompt injection. */
  coachSummary: string;
}

// ─── Legacy type stubs — deprecated, kept for compile compat ─────────────────
// These types are used by files pending deletion or active files that still
// import legacy helpers (goals.tsx → weeklyPlanner, store → planGenerator).
// Do NOT write new code that depends on these types.
// Using Record<string,any> so legacy field access compiles without errors.
/* eslint-disable @typescript-eslint/no-explicit-any */

/** @deprecated Use PlanItem instead */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Task extends Record<string, any> {}

/** @deprecated */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TimeBlock extends Record<string, any> {}

/** @deprecated */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Constraint extends Record<string, any> {}

/** @deprecated Use Plan instead */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DailyPlan extends Record<string, any> {}

/** @deprecated */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DailyReflection extends Record<string, any> {}

/** @deprecated */
export type PlanBlockType = string;

/** @deprecated */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PlanBlock extends Record<string, any> {}

/** @deprecated */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ScheduleItem extends Record<string, any> {}

/** @deprecated */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AlignmentInput extends Record<string, any> {}

/* eslint-enable @typescript-eslint/no-explicit-any */
