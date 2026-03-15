-- ============================================================
-- LifeOS — Sprint 11 Block D: Re-engagement Eligibility View
--
-- Identifies users eligible for one of three re-engagement
-- nudge categories based on behavioral signals in analytics_events.
--
-- This is a READ-ONLY eligibility layer. It does not send
-- notifications, schedule jobs, or trigger any product action.
-- It answers: who should be nudged, for what reason, since when.
--
-- Nudge categories:
--   recover_day_nudge    — inactive 2–30 days; has planning history
--   weekly_review_nudge  — active this week; no weekly review yet
--   quota_reset_nudge    — hit quota last month; hasn't returned
--
-- Output: one row per (identity, nudge_type).
--   A user may appear in multiple categories; the consumer
--   decides priority. No deduplication is intentional.
--
-- Eligibility thresholds (tune here if needed):
--   INACTIVITY_MIN  = 2 days   — recover_day: must be inactive this long
--   CHURN_GUARD     = 30 days  — recover_day: exclude fully-lapsed users
--   WEEKLY_WINDOW   = 7 days   — weekly_review: activity check window
--
-- Access: service-role only (inherits analytics_events RLS).
-- ============================================================


create or replace view public.v_reengagement_eligibility as
with

-- ── Base rollup: per-identity behavioral signals ──────────────────────────────
--
-- Computed once (MATERIALIZED) and shared across all three nudge branches.
-- References analytics_events once; avoids triple-scan from UNION ALL inlining.

identity_stats as materialized (
  select
    coalesce(user_id::text, session_id)                             as identity,
    max(user_id::text)::uuid                                        as user_id,  -- NULL for guest sessions

    -- Last meaningful AI activity across all feature types
    max(created_at) filter (
      where event_name in (
        'ai_chat_used', 'build_day_used', 'recover_day_used', 'weekly_review_used'
      )
    )                                                               as last_ai_at,

    -- Planning feature history: signals user knows daily-planning workflow
    bool_or(event_name = 'build_day_used')                          as has_used_build_day,
    bool_or(event_name = 'recover_day_used')                        as has_used_recover_day,

    -- Rolling 7-day AI activity: is the user currently warm?
    bool_or(
      event_name in (
        'ai_chat_used', 'build_day_used', 'recover_day_used', 'weekly_review_used'
      )
      and created_at >= now() - interval '7 days'
    )                                                               as is_active_last_7d,

    -- Weekly review usage in the current 7-day window
    bool_or(
      event_name = 'weekly_review_used'
      and created_at >= now() - interval '7 days'
    )                                                               as used_weekly_review_this_week,

    -- Quota exhaustion: most recent occurrence (for prior-month check)
    max(created_at) filter (
      where event_name = 'quota_exhausted'
    )                                                               as last_quota_at,

    -- Current-month AI activity: has the user already returned this month?
    bool_or(
      event_name in (
        'ai_chat_used', 'build_day_used', 'recover_day_used', 'weekly_review_used'
      )
      and created_at >= date_trunc('month', now())
    )                                                               as is_active_this_month

  from public.analytics_events
  group by coalesce(user_id::text, session_id)
),


-- ── Nudge 1 candidates: Recover Day ──────────────────────────────────────────
--
-- Who: user was engaged with daily planning but has gone quiet.
-- Signal: no AI activity in the last 2 days (INACTIVITY_MIN),
--         but was seen within 30 days (CHURN_GUARD),
--         and has used build_day or recover_day at least once.
-- Not sent to: users silent 30+ days (different reactivation needed).

recover_day_candidates as (
  select
    identity,
    user_id,
    'recover_day_nudge'::text                                       as nudge_type,
    'Inactive 2+ days; has used daily planning features'            as reason,
    last_ai_at                                                      as last_active_at,
    (last_ai_at + interval '2 days')                                as eligible_since
  from identity_stats
  where last_ai_at is not null
    and last_ai_at <  now() - interval '2 days'   -- INACTIVITY_MIN: quiet for 2+ days
    and last_ai_at >= now() - interval '30 days'  -- CHURN_GUARD: not fully lapsed
    and (has_used_build_day or has_used_recover_day)
),


-- ── Nudge 2 candidates: Weekly Review ────────────────────────────────────────
--
-- Who: user is currently warm (active this week) but hasn't closed the
--      week with a review.
-- Signal: has AI activity in last 7 days AND no weekly_review_used in last 7 days.
-- Applies to: free users (upgrade driver) and Pro users (feature reminder).
--             Tier is not checked — nudge intent differs by tier but eligibility
--             signal is the same.

weekly_review_candidates as (
  select
    identity,
    user_id,
    'weekly_review_nudge'::text                                     as nudge_type,
    'Active this week but weekly review not yet used'               as reason,
    last_ai_at                                                      as last_active_at,
    date_trunc('week', now())                                       as eligible_since
  from identity_stats
  where is_active_last_7d
    and not used_weekly_review_this_week
    and last_ai_at is not null
),


-- ── Nudge 3 candidates: Quota Reset ──────────────────────────────────────────
--
-- Who: user hit their credit quota in a prior month and has not returned.
-- Signal: quota_exhausted fired before the start of the current month,
--         and no AI activity has occurred in the current month.
-- Intent: inform user that their monthly credits have reset.

quota_reset_candidates as (
  select
    identity,
    user_id,
    'quota_reset_nudge'::text                                       as nudge_type,
    'Hit quota last month; monthly credits have now reset'          as reason,
    last_ai_at                                                      as last_active_at,
    date_trunc('month', now())                                      as eligible_since
  from identity_stats
  where last_quota_at is not null
    and last_quota_at < date_trunc('month', now())  -- quota was in a prior month
    and not is_active_this_month                    -- hasn't returned on their own
)


-- ── Final output: all eligible identities across all nudge types ──────────────

select * from recover_day_candidates
union all
select * from weekly_review_candidates
union all
select * from quota_reset_candidates;


-- ============================================================
-- Done.
-- View:      v_reengagement_eligibility
-- Columns:   identity, user_id, nudge_type, reason,
--            last_active_at, eligible_since
-- Output:    one row per (identity, nudge_type)
-- Access:    service-role only
--
-- Example queries:
--
--   -- All currently eligible users
--   select * from v_reengagement_eligibility
--   order by nudge_type, last_active_at desc;
--
--   -- Count per nudge category
--   select nudge_type, count(*) as eligible_count
--   from v_reengagement_eligibility
--   group by 1
--   order by 1;
--
--   -- Recover-day eligibles with authenticated user_id only
--   select identity, user_id, last_active_at, eligible_since
--   from v_reengagement_eligibility
--   where nudge_type = 'recover_day_nudge'
--     and user_id is not null
--   order by last_active_at asc;
-- ============================================================
