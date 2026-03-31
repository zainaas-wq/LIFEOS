-- Batch 16: Add reliability observability columns to ai_usage_log.
--
-- New columns track per-provider timeout and health-circuit-breaker state:
--   failure_reason                — error message from the primary provider when
--                                   fallback was used (null on direct success)
--   timeout_occurred              — true when at least one provider leg timed out
--   provider_health_at_selection  — JSONB snapshot of { openai, nim } health at
--                                   the moment the routing decision was made
--
-- All columns are nullable for backward compatibility with rows logged before
-- this migration (Batch 15 rows will have NULL in these columns).

ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS failure_reason               TEXT,
  ADD COLUMN IF NOT EXISTS timeout_occurred             BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS provider_health_at_selection JSONB;

-- Index on timeout_occurred for SLO / latency dashboards
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_timeout
  ON ai_usage_log (timeout_occurred)
  WHERE timeout_occurred = TRUE;

-- Index on failure_reason IS NOT NULL for provider reliability queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_failure_reason
  ON ai_usage_log (user_id, created_at)
  WHERE failure_reason IS NOT NULL;

-- Column comments for documentation
COMMENT ON COLUMN ai_usage_log.failure_reason
  IS 'Error message from primary provider when fallback was triggered; NULL on direct success';

COMMENT ON COLUMN ai_usage_log.timeout_occurred
  IS 'True when at least one provider leg (primary or fallback) hit its per-provider timeout';

COMMENT ON COLUMN ai_usage_log.provider_health_at_selection
  IS 'JSONB snapshot of {openai: "healthy"|"unhealthy", nim: "healthy"|"unhealthy"} at routing decision time';
