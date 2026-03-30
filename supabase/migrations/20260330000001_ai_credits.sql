-- ============================================================
-- LifeOS — Batch 11: Direct AI credit ledger
--
-- Adds the ai_user_credits table for atomic, balance-tracked
-- credit accounting. This is the Batch 11 credit model:
--
--   FREE tier : 20 credits per 30-day rolling window
--   PRO  tier : 1000 credits per 30-day rolling window
--
-- Credit costs (enforced server-side in ai-gateway):
--   text  = 1 credit
--   voice = 2 credits
--   image = 3 credits
--
-- Also extends ai_usage_log to support voice/image request types.
--
-- Idempotent — safe to re-apply.
-- Apply via: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ─── A. ai_user_credits — one row per user ───────────────────────────────────

create table if not exists public.ai_user_credits (
  user_id         uuid        primary key references auth.users(id) on delete cascade,
  current_balance integer     not null default 0 check (current_balance >= 0),
  tier_allowance  integer     not null default 20,  -- matches free tier
  lifetime_used   integer     not null default 0,
  last_refill_at  timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Fast balance lookups
create index if not exists ai_user_credits_user_idx
  on public.ai_user_credits(user_id);

alter table public.ai_user_credits enable row level security;

-- Users can read their own balance (for CreditsCard UI)
create policy "ai_user_credits: select own"
  on public.ai_user_credits for select
  using (user_id = auth.uid());

-- No INSERT / UPDATE / DELETE for users.
-- All mutations go through security-definer PG functions called by
-- ai-gateway using SUPABASE_SERVICE_ROLE_KEY. This prevents clients
-- from forging or inflating their own balance.

-- ─── B. Extend ai_usage_log to support voice / image ─────────────────────────

alter table public.ai_usage_log
  drop constraint if exists ai_usage_log_action_check;

alter table public.ai_usage_log
  add constraint ai_usage_log_action_check
  check (action in (
    'chat', 'build_day', 'recover_day', 'monthly_review',
    'weekly_plan', 'voice_request', 'image_request'
  ));

-- request_mode: nullable for backward compat with pre-Batch-11 rows
alter table public.ai_usage_log
  add column if not exists request_mode text
  check (request_mode in ('text', 'voice', 'image'));

-- credits_used: denormalized for fast dashboard queries
alter table public.ai_usage_log
  add column if not exists credits_used integer;

-- ─── C. consume_ai_credits — atomic bootstrap + refill + deduction ───────────
--
-- Called by ai-gateway via service role (bypasses RLS).
-- Handles all three lifecycle events in one atomic operation:
--   1. Bootstrap: creates the row on first call
--   2. Monthly refill: resets balance if 30+ days since last_refill_at
--   3. Deduction: atomically subtracts p_cost from current_balance
--
-- Returns: (success, balance_after, error_code)
-- error_code is NULL on success, 'insufficient_credits' on failure.

create or replace function public.consume_ai_credits(
  p_user_id        uuid,
  p_cost           integer,
  p_tier_allowance integer default 20
)
returns table(success boolean, balance_after integer, error_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_row         public.ai_user_credits%rowtype;
  v_new_balance integer;
begin
  -- 1. Bootstrap: create row on first use (idempotent)
  insert into public.ai_user_credits
    (user_id, current_balance, tier_allowance, lifetime_used, last_refill_at)
  values
    (p_user_id, p_tier_allowance, p_tier_allowance, 0, now())
  on conflict (user_id) do nothing;

  -- 2. Lock row for the remainder of this transaction
  select * into v_row
  from public.ai_user_credits
  where user_id = p_user_id
  for update;

  -- 3. Monthly refill: rolling 30-day window
  if now() >= v_row.last_refill_at + interval '30 days' then
    update public.ai_user_credits
    set current_balance = p_tier_allowance,
        tier_allowance  = p_tier_allowance,
        last_refill_at  = now()
    where user_id = p_user_id;

    v_row.current_balance := p_tier_allowance;
  end if;

  -- 4. Sync tier_allowance if tier has changed (e.g. after upgrade)
  if v_row.tier_allowance != p_tier_allowance then
    update public.ai_user_credits
    set tier_allowance = p_tier_allowance
    where user_id = p_user_id;
  end if;

  -- 5. Insufficient balance check (fail-closed — never allow negative)
  if v_row.current_balance < p_cost then
    return query select false, v_row.current_balance, 'insufficient_credits'::text;
    return;
  end if;

  -- 6. Atomic deduction
  update public.ai_user_credits
  set current_balance = current_balance - p_cost,
      lifetime_used   = lifetime_used + p_cost
  where user_id = p_user_id
  returning current_balance into v_new_balance;

  return query select true, v_new_balance, null::text;
end;
$$;

-- ─── D. refund_ai_credits — reversal on provider failure ─────────────────────
--
-- Called by ai-gateway if the OpenAI call fails AFTER credits were deducted.
-- Clamps to tier_allowance (no over-credit from refunds).

create or replace function public.refund_ai_credits(
  p_user_id uuid,
  p_amount  integer
)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.ai_user_credits
  set current_balance = least(current_balance + p_amount, tier_allowance),
      lifetime_used   = greatest(lifetime_used - p_amount, 0)
  where user_id = p_user_id;
end;
$$;

-- ─── E. Bootstrap existing users at free-tier allowance (20 credits) ─────────
-- Idempotent — ON CONFLICT DO NOTHING guards re-runs.

insert into public.ai_user_credits (user_id, current_balance, tier_allowance)
select id, 20, 20
from auth.users
on conflict (user_id) do nothing;

-- ─── F. handle_new_user trigger: bootstrap ai_user_credits on signup ──────────
-- Replaces previous version (from 20260313000003_ai_user_tier.sql).
-- Adds the ai_user_credits bootstrap line. Trigger binding unchanged.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.ai_user_tier (user_id, tier_id)
  values (new.id, 'free')
  on conflict (user_id) do nothing;

  insert into public.ai_user_credits (user_id, current_balance, tier_allowance)
  values (new.id, 20, 20)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ============================================================
-- Done.
-- Tables added:     ai_user_credits (1)
-- Columns added:    ai_usage_log.request_mode, ai_usage_log.credits_used
-- Constraint:       ai_usage_log.action CHECK extended (+voice_request, +image_request)
-- Functions added:  consume_ai_credits, refund_ai_credits
-- Trigger updated:  handle_new_user (+ai_user_credits bootstrap)
-- Backfill:         all existing users → 20 free credits
-- ============================================================
