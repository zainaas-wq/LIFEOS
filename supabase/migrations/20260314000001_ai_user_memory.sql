-- ============================================================
-- LifeOS — Sprint 10 Block A: AI User Memory
--
-- Introduces the ai_user_memory table: a lightweight, structured
-- store for per-user AI context that personalises planning quality,
-- recovery suggestions, and coaching tone.
--
-- Design decisions:
--
--   UNIQUE (user_id, memory_key)
--     One value per key per user.  Enables idempotent ON CONFLICT
--     upserts from both the client and server-side Edge Functions.
--
--   memory_value JSONB
--     Typed structured values (not freeform blobs).  Every write
--     must follow the canonical key→shape contract in the spec.
--     Validated at the application layer, not in Postgres.
--
--   memory_type CHECK constraint
--     Five allowed categories.  Expanding requires a migration —
--     intentional: prevents ad-hoc category proliferation.
--
--   updated_at trigger
--     Reuses the set_updated_at() function from the initial schema
--     migration.  Ensures freshness ordering in fetchUserMemory().
--
--   RLS
--     Users can read/write their own rows via the anon key.
--     Edge Functions use the service role (bypasses RLS).
--     No user can read another user's memory.
--
-- DEPLOY ORDER: apply before deploying updated ai-chat function.
--
-- Apply via: Supabase Dashboard → SQL Editor → Run
-- ============================================================

create table if not exists public.ai_user_memory (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  memory_type  text        not null check (memory_type in (
                             'profile_preference',
                             'productivity_pattern',
                             'coaching_preference',
                             'goal',
                             'habit'
                           )),
  memory_key   text        not null,
  memory_value jsonb       not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  --
  -- Composite unique key: one value per (user, key) pair.
  -- Enables ON CONFLICT (user_id, memory_key) DO UPDATE upserts.
  --
  unique (user_id, memory_key)
);

-- ─── Index ────────────────────────────────────────────────────────────────────
-- Every real query is "all memory for user X ordered by recency".
-- A single index on user_id covers this pattern completely.

create index if not exists ai_user_memory_user_id_idx
  on public.ai_user_memory(user_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
-- Reuses the function created in 20260310000000_initial_schema.sql.

create trigger ai_user_memory_updated_at
  before update on public.ai_user_memory
  for each row execute function public.set_updated_at();

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table public.ai_user_memory enable row level security;

create policy "ai_user_memory: select own"
  on public.ai_user_memory for select
  using (user_id = auth.uid());

create policy "ai_user_memory: insert own"
  on public.ai_user_memory for insert
  with check (user_id = auth.uid());

create policy "ai_user_memory: update own"
  on public.ai_user_memory for update
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "ai_user_memory: delete own"
  on public.ai_user_memory for delete
  using (user_id = auth.uid());

-- ============================================================
-- Done.
-- Table:    public.ai_user_memory
-- Indexes:  1 (user_id)
-- Triggers: 1 (updated_at)
-- Policies: 4 (select / insert / update / delete own)
-- ============================================================
