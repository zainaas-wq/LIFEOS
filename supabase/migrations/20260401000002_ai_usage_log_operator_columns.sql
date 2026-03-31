-- Batch 17: Add operator control observability columns to ai_usage_log.
--
-- New columns record when operator policy env vars influenced a routing decision:
--   operator_forced_provider   — set to the forced provider when FORCE_PROVIDER was active
--   operator_cheap_mode        — true when FORCE_CHEAP_MODE or low-balance auto-cheap applied
--   operator_disabled_provider — set to the provider that was skipped due to DISABLED_PROVIDERS
--
-- All columns are nullable; populated only when the corresponding policy was active.
-- Rows from Batch 15/16 will have NULL in all three columns.

ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS operator_forced_provider   TEXT,
  ADD COLUMN IF NOT EXISTS operator_cheap_mode        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS operator_disabled_provider TEXT;

-- Index for cost-control auditing: when was cheap mode active?
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_cheap_mode
  ON ai_usage_log (created_at)
  WHERE operator_cheap_mode = TRUE;

-- Index for provider-disable auditing: which requests hit a disabled provider?
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_disabled_provider
  ON ai_usage_log (operator_disabled_provider)
  WHERE operator_disabled_provider IS NOT NULL;

-- Column comments
COMMENT ON COLUMN ai_usage_log.operator_forced_provider
  IS 'Provider name when FORCE_PROVIDER env var overrode routing; NULL otherwise';

COMMENT ON COLUMN ai_usage_log.operator_cheap_mode
  IS 'True when FORCE_CHEAP_MODE=true or low-balance auto-cheap routed to NIM';

COMMENT ON COLUMN ai_usage_log.operator_disabled_provider
  IS 'Provider name that was skipped because it appeared in DISABLED_PROVIDERS; NULL otherwise';
