-- Add trial_started_at to ai_user_tier.
-- This column is set-once: activate-purchase reads the existing value and
-- preserves it (COALESCE equivalent via read-then-upsert in the Edge Function).
-- The client reads this via hydrateFromCloud and overrides local trialStartDate,
-- preventing reinstall + local-storage reset from granting a second free trial.

ALTER TABLE ai_user_tier
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

-- Backfill existing pro rows: treat their rc_event_at as the trial start.
-- This is a safe approximation — these users already converted, so the trial
-- end date doesn't affect their access.
UPDATE ai_user_tier
  SET trial_started_at = rc_event_at
  WHERE trial_started_at IS NULL
    AND rc_event_at IS NOT NULL;
