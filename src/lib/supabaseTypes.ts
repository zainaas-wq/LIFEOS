// ─── Supabase Database types ──────────────────────────────────────────────────
//
// Hand-written to match the LifeOS schema.
// When the Supabase project is live, these can be replaced with the output of:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabaseTypes.ts
//
// Until then this file is the source of truth for all DB row shapes.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: DbProfile;
        Insert: DbProfileInsert;
        Update: DbProfileUpdate;
      };
      goals: {
        Row: DbGoal;
        Insert: DbGoalInsert;
        Update: DbGoalUpdate;
      };
      skill_plans: {
        Row: DbSkillPlan;
        Insert: DbSkillPlanInsert;
        Update: DbSkillPlanUpdate;
      };
      schedule_events: {
        Row: DbScheduleEvent;
        Insert: DbScheduleEventInsert;
        Update: DbScheduleEventUpdate;
      };
      rules: {
        Row: DbRule;
        Insert: DbRuleInsert;
        Update: DbRuleUpdate;
      };
      daily_plans: {
        Row: DbDailyPlan;
        Insert: DbDailyPlanInsert;
        Update: DbDailyPlanUpdate;
      };
      daily_plan_items: {
        Row: DbDailyPlanItem;
        Insert: DbDailyPlanItemInsert;
        Update: DbDailyPlanItemUpdate;
      };
      focus_sessions: {
        Row: DbFocusSession;
        Insert: DbFocusSessionInsert;
        Update: DbFocusSessionUpdate;
      };
      goal_sessions: {
        Row: DbGoalSession;
        Insert: DbGoalSessionInsert;
        Update: DbGoalSessionUpdate;
      };
      distraction_logs: {
        Row: DbDistractionLog;
        Insert: DbDistractionLogInsert;
        Update: never;
      };
      reflections: {
        Row: DbReflection;
        Insert: DbReflectionInsert;
        Update: DbReflectionUpdate;
      };
      progress_snapshots: {
        Row: DbProgressSnapshot;
        Insert: DbProgressSnapshotInsert;
        Update: DbProgressSnapshotUpdate;
      };
      nudge_schedule: {
        Row: DbNudgeItem;
        Insert: DbNudgeItemInsert;
        Update: DbNudgeItemUpdate;
      };
    };
  };
}

// ─── profiles ─────────────────────────────────────────────────────────────────

export interface DbProfile {
  id: string;                          // = auth.users.id
  created_at: string;
  updated_at: string | null;
  name: string | null;
  main_focus: string | null;
  biggest_distraction: string | null;
  habit_to_remove: string | null;
  habit_to_build: string | null;
  seriousness_score: number;
  onboarding_complete: boolean;
  is_pro: boolean;
  wake_time: string;
  sleep_time: string;
  focus_block_mins: number;
  news_limit_mins: number;
  mobility_buffer_mins: number;
}

export type DbProfileInsert = Omit<DbProfile, 'created_at' | 'updated_at'>;
export type DbProfileUpdate = Partial<Omit<DbProfile, 'id' | 'created_at'>>;

// ─── goals ────────────────────────────────────────────────────────────────────

export interface DbGoal {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string | null;
  title: string;
  category: 'study' | 'skill' | 'health' | 'life' | 'career';
  priority: number;
  weekly_hours_target: number;
  deadline: string | null;            // ISO date YYYY-MM-DD
  linked_skill_plan_id: string | null;
}

export type DbGoalInsert = Omit<DbGoal, 'id' | 'created_at' | 'updated_at'>;
export type DbGoalUpdate = Partial<Omit<DbGoal, 'id' | 'user_id' | 'created_at'>>;

// ─── skill_plans ──────────────────────────────────────────────────────────────

export interface DbSkillPlan {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string | null;
  title: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  weekly_target_hours: number;
  goal_id: string | null;
  steps: Json;                        // SkillPlanStep[]
}

export type DbSkillPlanInsert = Omit<DbSkillPlan, 'id' | 'created_at' | 'updated_at'>;
export type DbSkillPlanUpdate = Partial<Omit<DbSkillPlan, 'id' | 'user_id' | 'created_at'>>;

// ─── schedule_events ──────────────────────────────────────────────────────────

export interface DbScheduleEvent {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string | null;
  title: string;
  start_time: string;                 // "HH:MM"
  end_time: string;                   // "HH:MM"
  category: string;
  location: string | null;
  notes: string | null;
  recurring: boolean;
  days_of_week: number[];
}

export type DbScheduleEventInsert = Omit<DbScheduleEvent, 'id' | 'created_at' | 'updated_at'>;
export type DbScheduleEventUpdate = Partial<Omit<DbScheduleEvent, 'id' | 'user_id' | 'created_at'>>;

// ─── rules ────────────────────────────────────────────────────────────────────

export interface DbRule {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string | null;
  title: string;
  enabled: boolean;
  type: 'screen' | 'focus' | 'sleep' | 'study';
  start_time: string | null;
  end_time: string | null;
  days_of_week: number[] | null;
  followed_today: boolean;
}

export type DbRuleInsert = Omit<DbRule, 'id' | 'created_at' | 'updated_at'>;
export type DbRuleUpdate = Partial<Omit<DbRule, 'id' | 'user_id' | 'created_at'>>;

// ─── daily_plans ──────────────────────────────────────────────────────────────

export interface DbDailyPlan {
  id: string;
  user_id: string;
  created_at: string;
  date: string;                       // YYYY-MM-DD
  type: 'daily' | 'weekly';
  date_range_start: string;
  date_range_end: string;
  source: 'local' | 'ai';
  generated_at: string;
}

export type DbDailyPlanInsert = Omit<DbDailyPlan, 'id' | 'created_at'>;
export type DbDailyPlanUpdate = Partial<Omit<DbDailyPlan, 'id' | 'user_id' | 'created_at'>>;

// ─── daily_plan_items ─────────────────────────────────────────────────────────

export interface DbDailyPlanItem {
  id: string;
  user_id: string;
  plan_id: string;
  created_at: string;
  updated_at: string | null;
  start_time: string;
  end_time: string;
  title: string;
  type: 'goal' | 'skill' | 'break' | 'event' | 'free';
  goal_id: string | null;
  skill_plan_id: string | null;
  event_id: string | null;
  notes: string | null;
  completed: boolean;
  is_critical: boolean;
  energy_required: 'high' | 'medium' | 'low' | null;
}

export type DbDailyPlanItemInsert = Omit<DbDailyPlanItem, 'id' | 'created_at' | 'updated_at'>;
export type DbDailyPlanItemUpdate = Partial<Omit<DbDailyPlanItem, 'id' | 'user_id' | 'created_at'>>;

// ─── focus_sessions ───────────────────────────────────────────────────────────

export interface DbFocusSession {
  id: string;
  user_id: string;
  created_at: string;
  start_at: string;
  end_at: string | null;
  goal_id: string | null;
  skill_plan_id: string | null;
  notes: string | null;
  duration_minutes: number | null;
}

export type DbFocusSessionInsert = Omit<DbFocusSession, 'id' | 'created_at'>;
export type DbFocusSessionUpdate = Partial<Omit<DbFocusSession, 'id' | 'user_id' | 'created_at'>>;

// ─── goal_sessions ────────────────────────────────────────────────────────────

export interface DbGoalSession {
  id: string;
  user_id: string;
  created_at: string;
  goal_id: string;
  date: string;
  minutes_worked: number;
  source: 'focus_session' | 'plan_item' | 'manual';
}

export type DbGoalSessionInsert = Omit<DbGoalSession, 'id' | 'created_at'>;
export type DbGoalSessionUpdate = Partial<Omit<DbGoalSession, 'id' | 'user_id' | 'created_at'>>;

// ─── distraction_logs ─────────────────────────────────────────────────────────

export interface DbDistractionLog {
  id: string;
  user_id: string;
  created_at: string;
  timestamp: string;
  note: string | null;
}

export type DbDistractionLogInsert = Omit<DbDistractionLog, 'id' | 'created_at'>;

// ─── reflections ──────────────────────────────────────────────────────────────

export interface DbReflection {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string | null;
  date: string;                       // YYYY-MM-DD — unique per user
  text: string;
}

export type DbReflectionInsert = Omit<DbReflection, 'id' | 'created_at' | 'updated_at'>;
export type DbReflectionUpdate = Partial<Omit<DbReflection, 'id' | 'user_id' | 'created_at'>>;

// ─── progress_snapshots ───────────────────────────────────────────────────────

export interface DbProgressSnapshot {
  id: string;
  user_id: string;
  created_at: string;
  date: string;
  score: number;
  task_score: number | null;
  rule_score: number | null;
  critical_score: number | null;
  reflection_score: number | null;
  label: 'off-track' | 'building' | 'aligned' | 'locked-in' | null;
  distraction_count: number | null;
}

export type DbProgressSnapshotInsert = Omit<DbProgressSnapshot, 'id' | 'created_at'>;
export type DbProgressSnapshotUpdate = Partial<Omit<DbProgressSnapshot, 'id' | 'user_id' | 'created_at'>>;

// ─── nudge_schedule ───────────────────────────────────────────────────────────

export interface DbNudgeItem {
  id: string;
  user_id: string;
  created_at: string;
  plan_id: string;
  item_id: string;
  item_title: string;
  trigger_time: string;
  type: 'start' | 'missed' | 'checkin';
  snoozed_until: string | null;
}

export type DbNudgeItemInsert = Omit<DbNudgeItem, 'id' | 'created_at'>;
export type DbNudgeItemUpdate = Partial<Omit<DbNudgeItem, 'id' | 'user_id' | 'created_at'>>;
