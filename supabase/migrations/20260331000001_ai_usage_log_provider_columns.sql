-- Batch 15: Add provider observability columns to ai_usage_log.
--
-- New columns track multi-provider routing outcomes:
--   provider_selected  — which provider the routing policy chose
--   provider_used      — which provider actually produced the response
--   fallback_occurred  — true when primary failed and fallback succeeded
--   ai_mode            — Batch 14 orchestration mode (quick_nudge, recovery_coach, etc.)
--
-- All columns are nullable for backward compatibility with rows logged before this migration.

ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS provider_selected  TEXT,
  ADD COLUMN IF NOT EXISTS provider_used      TEXT,
  ADD COLUMN IF NOT EXISTS fallback_occurred  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_mode            TEXT;

-- Index on ai_mode for analytics queries (e.g. "which mode uses most credits?")
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_ai_mode
  ON ai_usage_log (ai_mode)
  WHERE ai_mode IS NOT NULL;

-- Index on fallback_occurred for provider reliability dashboards
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_fallback
  ON ai_usage_log (fallback_occurred)
  WHERE fallback_occurred = TRUE;

-- Comment the table for documentation
COMMENT ON COLUMN ai_usage_log.provider_selected  IS 'Provider chosen by routing policy (openai | nim)';
COMMENT ON COLUMN ai_usage_log.provider_used      IS 'Provider that actually handled the request after fallback';
COMMENT ON COLUMN ai_usage_log.fallback_occurred  IS 'True when primary provider failed and fallback was used';
COMMENT ON COLUMN ai_usage_log.ai_mode            IS 'Batch 14 orchestration mode sent by client context';
