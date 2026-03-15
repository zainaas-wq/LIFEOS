-- ============================================================
-- LifeOS — ai_user_tier
-- Maps each user to their current product tier.
-- One row per user, auto-assigned to 'free' on signup.
--
-- tier_id → ai_plan_tiers(id).
-- Upgrades/downgrades are UPDATE operations on this row
-- (managed server-side; users cannot change their own tier).
--
-- Apply via: Supabase Dashboard → SQL Editor → Run
--   (or: supabase db push)
-- ============================================================

create table if not exists public.ai_user_tier (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  tier_id     text        not null references public.ai_plan_tiers(id),
  assigned_at timestamptz not null default now()
);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table public.ai_user_tier enable row level security;

-- Users can read their own tier (needed by UsageService in Block B).
create policy "ai_user_tier: select own"
  on public.ai_user_tier for select
  using (user_id = auth.uid());

-- No insert / update / delete for users.
-- Tier assignment is managed exclusively server-side:
--   • New users: handle_new_user() trigger (security definer)
--   • Upgrades:  service role from a future billing webhook

-- ─── Backfill: assign 'free' tier to all existing users ──────────────────────
-- Idempotent — safe to re-apply. Covers any user who signed up before this
-- migration was deployed. ON CONFLICT DO NOTHING makes it re-run safe.

insert into public.ai_user_tier (user_id, tier_id)
select id, 'free'
from auth.users
on conflict (user_id) do nothing;

-- ─── Extend handle_new_user trigger ──────────────────────────────────────────
-- Replaces the function body from the initial schema migration.
-- The trigger binding (on_auth_user_created) remains unchanged.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Create profile row
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  -- Assign free tier (idempotent — on conflict do nothing guards re-runs)
  insert into public.ai_user_tier (user_id, tier_id)
  values (new.id, 'free')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ============================================================
-- Done. Tables added: 1. Backfill: all existing users.
-- Trigger: handle_new_user updated in-place.
-- RLS policies: 1.
-- ============================================================
