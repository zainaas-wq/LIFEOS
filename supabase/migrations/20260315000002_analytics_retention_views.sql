-- ============================================================
-- LifeOS — Sprint 11 Block C: Analytics Retention Views
--
-- Two lightweight SQL views over analytics_events that surface
-- product-habit and retention signals.
--
-- "Active day" definition:
--   A calendar day on which an identity fired at least one AI
--   feature event. Events counted as AI activity:
--     ai_chat_used | build_day_used | recover_day_used | weekly_review_used
--   app_opened alone does NOT constitute an active day.
--
-- "Identity" definition:
--   COALESCE(user_id::text, session_id) — same convention as the
--   Block B funnel views. Not stitched across auth boundary.
--
-- Time windows:
--   Views use now() for rolling windows (7d, 30d). Query results
--   always reflect current wall-clock time.
--
-- Access:
--   Service-role only (inherits analytics_events RLS).
--
-- Views:
--   v_user_activity_summary — per-identity activity breakdown
--   v_retention_signals     — population-level retention answers
-- ============================================================


-- ─── AI event set (referenced in both views) ──────────────────────────────────
--
-- The four events that constitute meaningful AI usage / active days.
-- Free tier: ai_chat_used, build_day_used, recover_day_used
-- Pro tier:  weekly_review_used


-- ─── 1. Per-Identity Activity Summary ────────────────────────────────────────
--
-- One row per identity. Useful for admin investigation of individual
-- users' activity patterns, churn signals, and feature depth.
--
-- Answers queries like:
--   "Show me all users who haven't been active in 7 days."
--   "Which users have used a deep feature at least once?"
--   "Who completed onboarding but never used AI?"

create or replace view public.v_user_activity_summary as
select
  coalesce(user_id::text, session_id)                                              as identity,
  min(created_at)                                                                  as first_seen_at,
  max(created_at)                                                                  as last_seen_at,

  -- Active AI days: distinct calendar dates with at least one AI feature event
  count(distinct created_at::date) filter (
    where event_name in ('ai_chat_used', 'build_day_used', 'recover_day_used', 'weekly_review_used')
  )                                                                                as total_active_days,

  count(distinct created_at::date) filter (
    where event_name in ('ai_chat_used', 'build_day_used', 'recover_day_used', 'weekly_review_used')
      and created_at >= now() - interval '7 days'
  )                                                                                as active_days_last_7d,

  count(distinct created_at::date) filter (
    where event_name in ('ai_chat_used', 'build_day_used', 'recover_day_used', 'weekly_review_used')
      and created_at >= now() - interval '30 days'
  )                                                                                as active_days_last_30d,

  -- Total AI event count: measures engagement depth across all time
  count(*) filter (
    where event_name in ('ai_chat_used', 'build_day_used', 'recover_day_used', 'weekly_review_used')
  )                                                                                as total_ai_events,

  -- Deepest AI feature ever used, ranked:
  --   weekly_review (Pro) > recover_day > build_day > chat > none
  case
    when bool_or(event_name = 'weekly_review_used') then 'weekly_review'
    when bool_or(event_name = 'recover_day_used')   then 'recover_day'
    when bool_or(event_name = 'build_day_used')     then 'build_day'
    when bool_or(event_name = 'ai_chat_used')       then 'chat'
    else                                                  'none'
  end                                                                              as deepest_feature,

  -- Onboarding completion flag
  bool_or(event_name = 'onboarding_completed')                                    as completed_onboarding

from public.analytics_events
group by coalesce(user_id::text, session_id);


-- ─── 2. Population-Level Retention Signals ───────────────────────────────────
--
-- Single-row aggregate view. Directly answers the five product questions:
--
--   Q1: How many active days does a user typically have in the last 7 days?
--       → active_users_last_7d, active_3plus_days_last_7d,
--         active_5plus_days_last_7d, avg_active_days_last_7d
--
--   Q2: How many users used AI more than once this week?
--       → repeat_users_last_7d
--
--   Q3: How many users used only chat vs deeper features?
--       → chat_only_users, deep_feature_users
--
--   Q4: How many users completed onboarding and became active in 7 days?
--       → onboarded_users, activated_post_onboarding, onboarding_activation_pct
--
--   Q5: How many users show repeat usage vs one-time exploration?
--       → one_time_ai_users, repeat_ai_users, power_ai_users
--
-- Implementation note:
--   user_stats CTE is marked MATERIALIZED because it is referenced twice
--   (once in the final SELECT, once in onboarding_activations). Without
--   MATERIALIZED, PostgreSQL may scan analytics_events twice.

create or replace view public.v_retention_signals as
with
-- Per-identity rollup: activity counts and feature presence flags
user_stats as materialized (
  select
    coalesce(user_id::text, session_id)                                            as identity,

    -- Active AI days in the last 7 days (habit-formation window)
    count(distinct created_at::date) filter (
      where event_name in ('ai_chat_used', 'build_day_used', 'recover_day_used', 'weekly_review_used')
        and created_at >= now() - interval '7 days'
    )                                                                              as ai_active_days_7d,

    -- Total AI events all time (engagement depth, Q5)
    count(*) filter (
      where event_name in ('ai_chat_used', 'build_day_used', 'recover_day_used', 'weekly_review_used')
    )                                                                              as total_ai_events,

    -- Feature depth presence flags (Q3)
    bool_or(event_name in ('build_day_used', 'recover_day_used', 'weekly_review_used'))
                                                                                   as used_deep_feature,
    bool_or(event_name = 'ai_chat_used')                                           as used_chat,

    -- Onboarding timestamp for activation window (Q4)
    bool_or(event_name = 'onboarding_completed')                                   as completed_onboarding,
    min(case when event_name = 'onboarding_completed' then created_at end)         as onboarding_at

  from public.analytics_events
  group by 1
),

-- Users who fired any AI event within 7 days of completing onboarding (Q4)
-- "Activated" = turned an install into an AI usage habit within a week.
onboarding_activations as (
  select distinct us.identity
  from user_stats us
  join public.analytics_events ae
    on  coalesce(ae.user_id::text, ae.session_id) = us.identity
    and ae.event_name in ('ai_chat_used', 'build_day_used', 'recover_day_used', 'weekly_review_used')
    and ae.created_at >= us.onboarding_at
    and ae.created_at <= us.onboarding_at + interval '7 days'
  where us.onboarding_at is not null
)

select
  -- ── Context ───────────────────────────────────────────────────────────────
  count(distinct us.identity)                                                      as total_identities,

  -- ── Q1: Active-day distribution, last 7 days ──────────────────────────────
  -- How many active days does a user typically have in the last 7 days?
  count(distinct case when ai_active_days_7d >= 1 then us.identity end)            as active_users_last_7d,
  count(distinct case when ai_active_days_7d >= 3 then us.identity end)            as active_3plus_days_last_7d,
  count(distinct case when ai_active_days_7d >= 5 then us.identity end)            as active_5plus_days_last_7d,

  -- Average only over identities with at least one active day (nulls excluded by AVG)
  round(avg(case when ai_active_days_7d > 0 then ai_active_days_7d::numeric end), 1)
                                                                                   as avg_active_days_last_7d,

  -- ── Q2: Repeat usage this week ────────────────────────────────────────────
  -- How many users used AI more than once this week?
  count(distinct case when ai_active_days_7d >= 2 then us.identity end)            as repeat_users_last_7d,

  -- ── Q3: Shallow vs deep feature usage (all time) ──────────────────────────
  -- How many users used only chat vs deeper features?
  count(distinct case when used_deep_feature                          then us.identity end)
                                                                                   as deep_feature_users,
  count(distinct case when used_chat and not used_deep_feature        then us.identity end)
                                                                                   as chat_only_users,

  -- ── Q4: Onboarding → activation (7-day window) ───────────────────────────
  -- How many users completed onboarding and became active in 7 days?
  count(distinct case when completed_onboarding then us.identity end)              as onboarded_users,
  count(distinct oa.identity)                                                      as activated_post_onboarding,

  -- Activation rate: null when no one has onboarded yet (not 0%)
  round(
    count(distinct oa.identity)::numeric
    / nullif(count(distinct case when completed_onboarding then us.identity end), 0)
    * 100, 1
  )                                                                                as onboarding_activation_pct,

  -- ── Q5: One-time vs repeat usage (all time) ───────────────────────────────
  -- How many users show repeat usage rather than one-time exploration?
  count(distinct case when total_ai_events = 1  then us.identity end)              as one_time_ai_users,
  count(distinct case when total_ai_events >= 2 then us.identity end)              as repeat_ai_users,
  count(distinct case when total_ai_events >= 5 then us.identity end)              as power_ai_users

from user_stats us
left join onboarding_activations oa using (identity);


-- ============================================================
-- Done.
-- Views: v_user_activity_summary, v_retention_signals
-- Access: service-role only (inherits analytics_events RLS)
-- ============================================================
