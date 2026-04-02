-- Batch 21: Launch-readiness observability views.
--
-- These views are read-only helpers for staging validation and go/no-go checks.
-- They do NOT alter any existing tables or indexes.
--
-- Views created:
--   v_ai_session_health      — 24-hour rolling AI health snapshot per provider
--   v_credit_coverage        — users with credits < threshold (staging gate)
--   v_tier_distribution      — free / trial / pro breakdown for launch QA

-- ─── v_ai_session_health ─────────────────────────────────────────────────────
-- Shows provider-level reliability in the last 24 hours.
-- Use during staging soak: confirm error_rate < 5% and p95_tokens reasonable.

CREATE OR REPLACE VIEW v_ai_session_health AS
SELECT
  provider,
  COUNT(*)                                                      AS total_requests,
  COUNT(*) FILTER (WHERE failure_reason IS NULL)               AS successful_requests,
  COUNT(*) FILTER (WHERE failure_reason IS NOT NULL)           AS failed_requests,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE failure_reason IS NOT NULL)
    / NULLIF(COUNT(*), 0),
    2
  )                                                             AS error_rate_pct,
  COUNT(*) FILTER (WHERE timeout_occurred = TRUE)              AS timeout_count,
  ROUND(AVG(total_tokens))                                     AS avg_tokens,
  MAX(total_tokens)                                            AS max_tokens,
  ROUND(
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_tokens)
  )                                                             AS p95_tokens,
  ROUND(SUM(credits_used)::NUMERIC, 4)                         AS total_credits_used,
  MIN(created_at)                                              AS window_start,
  MAX(created_at)                                              AS window_end
FROM ai_usage_log
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY provider
ORDER BY total_requests DESC;

COMMENT ON VIEW v_ai_session_health IS
  'Rolling 24-hour AI provider health snapshot. Staging gate: error_rate_pct < 5.';

-- ─── v_credit_coverage ───────────────────────────────────────────────────────
-- Flags users whose remaining credits are below a safe threshold.
-- Staging check: no user should start at 0 credits.

CREATE OR REPLACE VIEW v_credit_coverage AS
SELECT
  c.user_id,
  c.credits_remaining,
  c.credits_used,
  c.updated_at,
  t.plan_id,
  CASE
    WHEN c.credits_remaining <= 0    THEN 'depleted'
    WHEN c.credits_remaining < 5     THEN 'low'
    ELSE                                  'ok'
  END AS credit_status
FROM ai_user_credits c
LEFT JOIN ai_user_tier t ON t.user_id = c.user_id
ORDER BY c.credits_remaining ASC;

COMMENT ON VIEW v_credit_coverage IS
  'Credit status per user. Staging gate: no rows with credit_status = depleted.';

-- ─── v_tier_distribution ─────────────────────────────────────────────────────
-- Free / trial / pro breakdown — confirms seeding and entitlement logic.

CREATE OR REPLACE VIEW v_tier_distribution AS
SELECT
  plan_id,
  COUNT(*)                       AS user_count,
  ROUND(
    100.0 * COUNT(*)
    / NULLIF(SUM(COUNT(*)) OVER (), 0),
    1
  )                              AS pct_of_total,
  MIN(created_at)                AS earliest_signup,
  MAX(created_at)                AS latest_signup
FROM ai_user_tier
GROUP BY plan_id
ORDER BY user_count DESC;

COMMENT ON VIEW v_tier_distribution IS
  'Plan tier breakdown. Staging check: free + trial rows exist, no orphaned tiers.';
