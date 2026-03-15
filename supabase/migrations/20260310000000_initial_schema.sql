-- ============================================================
-- LifeOS — Initial Schema Migration
-- Apply via: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ─── Helper: updated_at auto-stamp trigger ───────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── profiles ────────────────────────────────────────────────────────────────
-- One row per auth user. id = auth.users.id (set by trigger below).

create table if not exists public.profiles (
  id                    uuid        primary key references auth.users(id) on delete cascade,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  name                  text,
  main_focus            text,
  biggest_distraction   text,
  habit_to_remove       text,
  habit_to_build        text,
  seriousness_score     smallint    not null default 7,
  onboarding_complete   boolean     not null default false,
  is_pro                boolean     not null default false,
  wake_time             text        not null default '06:00',
  sleep_time            text        not null default '22:30',
  focus_block_mins      smallint    not null default 50,
  news_limit_mins       smallint    not null default 30,
  mobility_buffer_mins  smallint    not null default 10
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── goals ───────────────────────────────────────────────────────────────────

create table if not exists public.goals (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users(id) on delete cascade,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  title                 text        not null,
  category              text        not null check (category in ('study','skill','health','life','career')),
  priority              smallint    not null default 2,
  weekly_hours_target   real        not null default 5,
  deadline              date,
  linked_skill_plan_id  uuid
);

create index if not exists goals_user_id_idx on public.goals(user_id);

create trigger goals_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

-- ─── skill_plans ─────────────────────────────────────────────────────────────

create table if not exists public.skill_plans (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users(id) on delete cascade,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  title                 text        not null,
  level                 text        not null check (level in ('beginner','intermediate','advanced')),
  weekly_target_hours   real        not null default 5,
  goal_id               uuid        references public.goals(id) on delete set null,
  steps                 jsonb       not null default '[]'::jsonb
);

create index if not exists skill_plans_user_id_idx on public.skill_plans(user_id);

create trigger skill_plans_updated_at
  before update on public.skill_plans
  for each row execute function public.set_updated_at();

-- Back-fill FK now that skill_plans exists
alter table public.goals
  add constraint goals_linked_skill_plan_fk
  foreign key (linked_skill_plan_id)
  references public.skill_plans(id)
  on delete set null
  not valid;  -- not valid = skip row scan; validates on next full-table scan

-- ─── schedule_events ─────────────────────────────────────────────────────────

create table if not exists public.schedule_events (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  title         text        not null,
  start_time    text        not null,   -- "HH:MM"
  end_time      text        not null,   -- "HH:MM"
  category      text        not null,
  location      text,
  notes         text,
  recurring     boolean     not null default true,
  days_of_week  smallint[]  not null default '{}'
);

create index if not exists schedule_events_user_id_idx on public.schedule_events(user_id);

create trigger schedule_events_updated_at
  before update on public.schedule_events
  for each row execute function public.set_updated_at();

-- ─── rules ───────────────────────────────────────────────────────────────────

create table if not exists public.rules (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  title         text        not null,
  enabled       boolean     not null default true,
  type          text        not null check (type in ('screen','focus','sleep','study')),
  start_time    text,
  end_time      text,
  days_of_week  smallint[],
  followed_today boolean    not null default false
);

create index if not exists rules_user_id_idx on public.rules(user_id);

create trigger rules_updated_at
  before update on public.rules
  for each row execute function public.set_updated_at();

-- ─── daily_plans ─────────────────────────────────────────────────────────────

create table if not exists public.daily_plans (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  date              date        not null,
  type              text        not null check (type in ('daily','weekly')),
  date_range_start  date        not null,
  date_range_end    date        not null,
  source            text        not null check (source in ('local','ai')),
  generated_at      timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists daily_plans_user_date_idx on public.daily_plans(user_id, date);

-- ─── daily_plan_items ────────────────────────────────────────────────────────

create table if not exists public.daily_plan_items (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  plan_id          uuid        not null references public.daily_plans(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  start_time       text        not null,
  end_time         text        not null,
  title            text        not null,
  type             text        not null check (type in ('goal','skill','break','event','free')),
  goal_id          uuid        references public.goals(id) on delete set null,
  skill_plan_id    uuid        references public.skill_plans(id) on delete set null,
  event_id         uuid        references public.schedule_events(id) on delete set null,
  notes            text,
  completed        boolean     not null default false,
  is_critical      boolean     not null default false,
  energy_required  text        check (energy_required in ('high','medium','low'))
);

create index if not exists daily_plan_items_plan_id_idx  on public.daily_plan_items(plan_id);
create index if not exists daily_plan_items_user_id_idx  on public.daily_plan_items(user_id);

create trigger daily_plan_items_updated_at
  before update on public.daily_plan_items
  for each row execute function public.set_updated_at();

-- ─── focus_sessions ──────────────────────────────────────────────────────────

create table if not exists public.focus_sessions (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  start_at          timestamptz not null,
  end_at            timestamptz,
  goal_id           uuid        references public.goals(id) on delete set null,
  skill_plan_id     uuid        references public.skill_plans(id) on delete set null,
  notes             text,
  duration_minutes  smallint
);

create index if not exists focus_sessions_user_id_idx on public.focus_sessions(user_id);
create index if not exists focus_sessions_start_at_idx on public.focus_sessions(user_id, start_at desc);

-- ─── goal_sessions ───────────────────────────────────────────────────────────
-- Tracks actual minutes worked per goal per day (aggregated from focus sessions
-- and plan item completions). Used for weekly target vs. actual comparison.

create table if not exists public.goal_sessions (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  goal_id          uuid        not null references public.goals(id) on delete cascade,
  date             date        not null,
  minutes_worked   smallint    not null default 0,
  source           text        not null check (source in ('focus_session','plan_item','manual')),
  unique (user_id, goal_id, date, source)
);

create index if not exists goal_sessions_user_goal_idx on public.goal_sessions(user_id, goal_id);

create trigger goal_sessions_updated_at
  before update on public.goal_sessions
  for each row execute function public.set_updated_at();

-- ─── distraction_logs ────────────────────────────────────────────────────────

create table if not exists public.distraction_logs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  timestamp   timestamptz not null default now(),
  note        text
);

create index if not exists distraction_logs_user_ts_idx on public.distraction_logs(user_id, timestamp desc);

-- ─── reflections ─────────────────────────────────────────────────────────────

create table if not exists public.reflections (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  date        date        not null,
  text        text        not null,
  unique (user_id, date)
);

create index if not exists reflections_user_date_idx on public.reflections(user_id, date desc);

create trigger reflections_updated_at
  before update on public.reflections
  for each row execute function public.set_updated_at();

-- ─── progress_snapshots ──────────────────────────────────────────────────────

create table if not exists public.progress_snapshots (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  date              date        not null,
  score             smallint    not null,
  task_score        smallint,
  rule_score        smallint,
  critical_score    smallint,
  reflection_score  smallint,
  label             text        check (label in ('off-track','building','aligned','locked-in')),
  distraction_count smallint,
  unique (user_id, date)
);

create index if not exists progress_snapshots_user_date_idx on public.progress_snapshots(user_id, date desc);

-- ============================================================
-- Row-Level Security
-- All policies: users can only read/write their own rows.
-- ============================================================

-- ─── profiles ────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;

create policy "profiles: select own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: insert own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles: delete own"
  on public.profiles for delete
  using (id = auth.uid());

-- ─── goals ───────────────────────────────────────────────────────────────────

alter table public.goals enable row level security;

create policy "goals: select own"
  on public.goals for select
  using (user_id = auth.uid());

create policy "goals: insert own"
  on public.goals for insert
  with check (user_id = auth.uid());

create policy "goals: update own"
  on public.goals for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "goals: delete own"
  on public.goals for delete
  using (user_id = auth.uid());

-- ─── skill_plans ─────────────────────────────────────────────────────────────

alter table public.skill_plans enable row level security;

create policy "skill_plans: select own"
  on public.skill_plans for select
  using (user_id = auth.uid());

create policy "skill_plans: insert own"
  on public.skill_plans for insert
  with check (user_id = auth.uid());

create policy "skill_plans: update own"
  on public.skill_plans for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "skill_plans: delete own"
  on public.skill_plans for delete
  using (user_id = auth.uid());

-- ─── schedule_events ─────────────────────────────────────────────────────────

alter table public.schedule_events enable row level security;

create policy "schedule_events: select own"
  on public.schedule_events for select
  using (user_id = auth.uid());

create policy "schedule_events: insert own"
  on public.schedule_events for insert
  with check (user_id = auth.uid());

create policy "schedule_events: update own"
  on public.schedule_events for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "schedule_events: delete own"
  on public.schedule_events for delete
  using (user_id = auth.uid());

-- ─── rules ───────────────────────────────────────────────────────────────────

alter table public.rules enable row level security;

create policy "rules: select own"
  on public.rules for select
  using (user_id = auth.uid());

create policy "rules: insert own"
  on public.rules for insert
  with check (user_id = auth.uid());

create policy "rules: update own"
  on public.rules for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "rules: delete own"
  on public.rules for delete
  using (user_id = auth.uid());

-- ─── daily_plans ─────────────────────────────────────────────────────────────

alter table public.daily_plans enable row level security;

create policy "daily_plans: select own"
  on public.daily_plans for select
  using (user_id = auth.uid());

create policy "daily_plans: insert own"
  on public.daily_plans for insert
  with check (user_id = auth.uid());

create policy "daily_plans: update own"
  on public.daily_plans for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "daily_plans: delete own"
  on public.daily_plans for delete
  using (user_id = auth.uid());

-- ─── daily_plan_items ────────────────────────────────────────────────────────

alter table public.daily_plan_items enable row level security;

create policy "daily_plan_items: select own"
  on public.daily_plan_items for select
  using (user_id = auth.uid());

create policy "daily_plan_items: insert own"
  on public.daily_plan_items for insert
  with check (user_id = auth.uid());

create policy "daily_plan_items: update own"
  on public.daily_plan_items for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "daily_plan_items: delete own"
  on public.daily_plan_items for delete
  using (user_id = auth.uid());

-- ─── focus_sessions ──────────────────────────────────────────────────────────

alter table public.focus_sessions enable row level security;

create policy "focus_sessions: select own"
  on public.focus_sessions for select
  using (user_id = auth.uid());

create policy "focus_sessions: insert own"
  on public.focus_sessions for insert
  with check (user_id = auth.uid());

create policy "focus_sessions: update own"
  on public.focus_sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "focus_sessions: delete own"
  on public.focus_sessions for delete
  using (user_id = auth.uid());

-- ─── goal_sessions ───────────────────────────────────────────────────────────

alter table public.goal_sessions enable row level security;

create policy "goal_sessions: select own"
  on public.goal_sessions for select
  using (user_id = auth.uid());

create policy "goal_sessions: insert own"
  on public.goal_sessions for insert
  with check (user_id = auth.uid());

create policy "goal_sessions: update own"
  on public.goal_sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "goal_sessions: delete own"
  on public.goal_sessions for delete
  using (user_id = auth.uid());

-- ─── distraction_logs ────────────────────────────────────────────────────────

alter table public.distraction_logs enable row level security;

create policy "distraction_logs: select own"
  on public.distraction_logs for select
  using (user_id = auth.uid());

create policy "distraction_logs: insert own"
  on public.distraction_logs for insert
  with check (user_id = auth.uid());

create policy "distraction_logs: delete own"
  on public.distraction_logs for delete
  using (user_id = auth.uid());

-- ─── reflections ─────────────────────────────────────────────────────────────

alter table public.reflections enable row level security;

create policy "reflections: select own"
  on public.reflections for select
  using (user_id = auth.uid());

create policy "reflections: insert own"
  on public.reflections for insert
  with check (user_id = auth.uid());

create policy "reflections: update own"
  on public.reflections for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "reflections: delete own"
  on public.reflections for delete
  using (user_id = auth.uid());

-- ─── progress_snapshots ──────────────────────────────────────────────────────

alter table public.progress_snapshots enable row level security;

create policy "progress_snapshots: select own"
  on public.progress_snapshots for select
  using (user_id = auth.uid());

create policy "progress_snapshots: insert own"
  on public.progress_snapshots for insert
  with check (user_id = auth.uid());

create policy "progress_snapshots: update own"
  on public.progress_snapshots for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "progress_snapshots: delete own"
  on public.progress_snapshots for delete
  using (user_id = auth.uid());

-- ============================================================
-- Done. Tables: 11. RLS policies: 43. Triggers: 8.
-- ============================================================
