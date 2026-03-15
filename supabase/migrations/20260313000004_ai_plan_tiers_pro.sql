-- ============================================================
-- LifeOS — Sprint 8 Block A: Pro tier + Free tier correction
--
-- 1. Correct free tier budget: 50,000 → 10,000 tokens
--      (100 credits/month at 100 tokens-per-credit)
-- 2. Seed pro tier: 60,000 tokens = 600 credits/month
-- 3. Extend ai_usage_log.action CHECK to include 'weekly_plan'
--      (required now that classifyAction() returns 'weekly_plan')
--
-- All operations are idempotent — safe to re-run.
--
-- Apply via: Supabase Dashboard → SQL Editor → Run
--   (or: supabase db push)
-- ============================================================

-- ─── 1. Correct free tier token budget ───────────────────────────────────────

update public.ai_plan_tiers
set monthly_token_budget = 10000
where id = 'free';

-- ─── 2. Pro tier — 600 credits / month ───────────────────────────────────────
-- ON CONFLICT DO NOTHING makes this safe to re-run.

insert into public.ai_plan_tiers (id, display_name, monthly_token_budget, tokens_per_credit)
values ('pro', 'Pro', 60000, 100)
on conflict (id) do nothing;

-- ─── 3. Extend action CHECK to include 'weekly_plan' ─────────────────────────
-- PostgreSQL CHECK constraints cannot be modified in-place — must drop and re-add.
-- The new set is a strict superset of the previous set, so no existing rows are
-- invalidated.

alter table public.ai_usage_log
  drop constraint if exists ai_usage_log_action_check;

alter table public.ai_usage_log
  add constraint ai_usage_log_action_check
  check (action in ('chat', 'build_day', 'recover_day', 'monthly_review', 'weekly_plan'));

-- ============================================================
-- Done.
-- Rows updated:   ai_plan_tiers.free  (monthly_token_budget = 10000)
-- Rows inserted:  ai_plan_tiers.pro   (monthly_token_budget = 60000)
-- Constraint:     ai_usage_log.action CHECK extended (+weekly_plan)
-- Max tier:       future — not seeded in this sprint
-- ============================================================
