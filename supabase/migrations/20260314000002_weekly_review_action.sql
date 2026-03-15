-- ============================================================
-- LifeOS — Sprint 10 Block B: weekly_review action type
--
-- Extends the ai_usage_log.action CHECK constraint to include
-- the new 'weekly_review' action introduced by the Weekly Review
-- Intelligence feature.
--
-- Why a migration is needed:
--   ai_usage_log.action has an inline CHECK constraint from the
--   initial migration.  The ai-chat Edge Function fire-and-forgets
--   an INSERT with action = 'weekly_review' after every successful
--   weekly review call.  Without this migration, that INSERT will
--   fail the constraint check and the usage row will not be logged
--   (the AI response still succeeds — logging is fire-and-forget —
--   but the credit will not be deducted correctly).
--
-- Operation:
--   1. Drop the existing unnamed CHECK constraint (system name:
--      ai_usage_log_action_check).
--   2. Re-add with the expanded action set.
--   Both steps are idempotent via IF EXISTS / IF NOT EXISTS.
--
-- DEPLOY ORDER: apply before deploying the updated ai-chat function.
-- ============================================================

-- ─── Step 1: remove old constraint ───────────────────────────────────────────

alter table public.ai_usage_log
  drop constraint if exists ai_usage_log_action_check;

-- ─── Step 2: add expanded constraint ─────────────────────────────────────────

alter table public.ai_usage_log
  add constraint ai_usage_log_action_check
  check (action in (
    'chat',
    'build_day',
    'recover_day',
    'monthly_review',
    'weekly_plan',
    'weekly_review'    -- Sprint 10 Block B
  ));

-- ============================================================
-- Done.  action CHECK constraint now includes 'weekly_review'.
-- ============================================================
