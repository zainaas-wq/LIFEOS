-- ============================================================
-- LifeOS — ai_plan_tiers
-- Product tier definitions for the credit-based AI quota model.
--
-- tokens_per_credit is the conversion rate between the
-- measurement layer (tokens) and the product layer (credits).
-- Credits shown to users = monthly_token_budget / tokens_per_credit.
--
-- This table is read by the ai-chat edge function to enforce
-- the monthly quota. It is also readable by authenticated users
-- so a future "usage / credits" screen can display quota limits.
--
-- Apply via: Supabase Dashboard → SQL Editor → Run
--   (or: supabase db push)
-- ============================================================

create table if not exists public.ai_plan_tiers (
  id                    text        primary key,      -- 'free', 'pro', 'max', etc.
  display_name          text        not null,         -- product-facing label
  monthly_token_budget  integer     not null,         -- measurement layer: max tokens per billing month
  tokens_per_credit     integer     not null default 100
  -- derived: monthly_credit_quota = monthly_token_budget / tokens_per_credit
  -- (computed on read; not stored so rate changes need no back-fill)
);

-- ─── Seed data ────────────────────────────────────────────────────────────────
-- Free tier: 50,000 tokens = 500 credits at 100 tokens/credit.
-- Insert is idempotent — safe to re-apply.

insert into public.ai_plan_tiers (id, display_name, monthly_token_budget, tokens_per_credit)
values ('free', 'Free', 50000, 100)
on conflict (id) do nothing;

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table public.ai_plan_tiers enable row level security;

-- Authenticated users can read all tiers.
-- Needed by a future "Usage & Credits" screen to display quota limits.
create policy "ai_plan_tiers: select any (authenticated)"
  on public.ai_plan_tiers for select
  to authenticated
  using (true);

-- No insert / update / delete for users.
-- Tier data is managed by service role / admin only.

-- ============================================================
-- Done. Tables added: 1. Seed rows: 1. RLS policies: 1.
-- ============================================================
