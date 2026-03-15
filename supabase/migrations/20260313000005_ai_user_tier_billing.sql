-- ============================================================
-- LifeOS — Sprint 9 Block C: billing metadata for ai_user_tier
--
-- Adds two columns needed by the activate-purchase and rc-webhook
-- Edge Functions:
--
--   updated_at  — wall-clock time of the last tier change.
--                 Replaces the semantic overloading of assigned_at
--                 (assigned_at stays as the original assignment date).
--
--   rc_event_at — timestamp of the last RevenueCat event that changed
--                 this row.  Used by rc-webhook to detect and reject
--                 stale EXPIRATION events that arrive out of order after
--                 a fresh INITIAL_PURCHASE or activate-purchase call.
--                 NULL means no RC event has been processed yet.
--
-- Both columns are added with IF NOT EXISTS — safe to re-apply.
--
-- DEPLOY ORDER: this migration MUST be applied before the
-- activate-purchase and rc-webhook Edge Functions are deployed.
--
-- Apply via: Supabase Dashboard → SQL Editor → Run
--   (or: supabase db push)
-- ============================================================

alter table public.ai_user_tier
  add column if not exists updated_at  timestamptz not null default now();

alter table public.ai_user_tier
  add column if not exists rc_event_at timestamptz;

-- ─── Backfill updated_at for existing rows ────────────────────────────────────
-- Rows added before this migration have updated_at = now() from the column
-- default. No explicit backfill needed — the default handles it.
-- rc_event_at stays NULL for all existing rows (correct: no RC event seen yet).

-- ============================================================
-- Done.
-- Columns added: updated_at (not null default now()), rc_event_at (nullable)
-- Table: public.ai_user_tier
-- ============================================================
