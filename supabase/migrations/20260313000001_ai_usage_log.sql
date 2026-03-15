-- ============================================================
-- LifeOS — ai_usage_log
-- Measurement layer for AI token consumption.
--
-- One row per successful provider call.
-- Inserts come from the ai-chat edge function via service role
-- key — users cannot write or modify rows directly.
--
-- Token counts are the raw measurement unit. Credits are
-- derived on read (total_tokens / tokens_per_credit) and are
-- never stored here, so credit-rate changes require no
-- back-fill of this table.
--
-- Apply via: Supabase Dashboard → SQL Editor → Run
--   (or: supabase db push)
-- ============================================================

create table if not exists public.ai_usage_log (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),

  -- Which provider and model served this request.
  -- model is stored verbatim so per-model cost attribution is
  -- possible without joining another table.
  provider          text        not null check (provider in ('openai', 'anthropic')),
  model             text        not null,

  -- Token counts — measurement layer only.
  -- total_tokens is denormalized (= prompt + completion) for
  -- fast SUM queries on billing windows.
  prompt_tokens     integer     not null,
  completion_tokens integer     not null,
  total_tokens      integer     not null,

  -- Request classification — product layer hook.
  -- Classified server-side from the message text.
  -- NULL is valid during transition; Block C will enforce
  -- classification for quota-weighted actions.
  action            text        check (
    action in ('chat', 'build_day', 'recover_day', 'monthly_review')
  ),

  -- Response latency in milliseconds.
  -- Optional — used for SLA monitoring and p95 tracking.
  latency_ms        integer
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Primary access pattern: sum tokens for a user within a billing window.
-- Covers: WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC
create index if not exists ai_usage_log_user_time_idx
  on public.ai_usage_log(user_id, created_at desc);

-- Secondary: per-action breakdown for credit weighting queries.
-- Covers: WHERE user_id = ? AND action = ?
create index if not exists ai_usage_log_user_action_idx
  on public.ai_usage_log(user_id, action);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table public.ai_usage_log enable row level security;

-- Users can read their own usage history.
-- Intended for a future "usage / credits" screen.
create policy "ai_usage_log: select own"
  on public.ai_usage_log for select
  using (user_id = auth.uid());

-- No INSERT policy for authenticated users.
-- All inserts originate from the ai-chat edge function using
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- This prevents clients from forging or inflating usage records.

-- No UPDATE or DELETE policies for users.
-- This is an append-only audit log. The service role can
-- delete rows if needed (e.g. GDPR data-erasure requests).

-- ============================================================
-- Done. Tables added: 1. Indexes: 2. RLS policies: 1.
-- ============================================================
