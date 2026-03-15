-- ============================================================
-- LifeOS — Sprint 11 Block B: Analytics Funnel Views
--
-- Three lightweight SQL read views over the analytics_events
-- table. Together they make the core product funnel questions
-- answerable without any new tables, new client code, or
-- external analytics infrastructure.
--
-- Access:
--   All views are service-role only. analytics_events has no
--   SELECT RLS policy, so reads are restricted to admin /
--   service-role callers (Supabase Studio, Edge Functions with
--   the service-role key, or direct psql admin access).
--
-- Identity:
--   COALESCE(user_id::text, session_id) is used as best-effort
--   identity. Authenticated users are identified by their
--   persistent user_id UUID; guests by their ephemeral
--   session_id. Pre-auth and post-auth events within the same
--   session are NOT stitched — acceptable at this data volume
--   and stage.
--
-- Time windows:
--   Views are all-time by default. To scope to a period, wrap
--   with a WHERE clause on created_at at query time, e.g.:
--     SELECT * FROM v_upgrade_funnel
--     WHERE created_at >= now() - interval '30 days';
--   (Note: the aggregate views are single-row; time-windowed
--    queries require a sub-select or lateral join approach.)
--
-- Views:
--   v_upgrade_funnel      — upgrade conversion pipeline
--   v_ai_usage_breakdown  — AI feature usage by type
--   v_quota_pressure      — quota → upgrade conversion path
-- ============================================================


-- ─── 1. Upgrade Funnel ────────────────────────────────────────────────────────
--
-- Unique-identity count at each step of the upgrade funnel, plus
-- step-to-step conversion rates.
--
-- Answers:
--   How many users open the upgrade CTA?
--   How many reach the paywall?
--   How many start a purchase?
--   How many complete a purchase?
--   How many restore instead of buying?
--   Where is the largest drop-off?

create or replace view public.v_upgrade_funnel as
select
  count(distinct case when event_name = 'upgrade_cta_opened' then coalesce(user_id::text, session_id) end) as cta_opened,
  count(distinct case when event_name = 'paywall_viewed'     then coalesce(user_id::text, session_id) end) as paywall_viewed,
  count(distinct case when event_name = 'purchase_started'   then coalesce(user_id::text, session_id) end) as purchase_started,
  count(distinct case when event_name = 'purchase_succeeded' then coalesce(user_id::text, session_id) end) as purchase_succeeded,
  count(distinct case when event_name = 'purchase_restored'  then coalesce(user_id::text, session_id) end) as purchase_restored,

  -- Step-to-step conversion rates (null when denominator is zero)
  round(
    count(distinct case when event_name = 'paywall_viewed'   then coalesce(user_id::text, session_id) end)::numeric
    / nullif(count(distinct case when event_name = 'upgrade_cta_opened' then coalesce(user_id::text, session_id) end), 0)
    * 100, 1
  ) as cta_to_paywall_pct,

  round(
    count(distinct case when event_name = 'purchase_started' then coalesce(user_id::text, session_id) end)::numeric
    / nullif(count(distinct case when event_name = 'paywall_viewed' then coalesce(user_id::text, session_id) end), 0)
    * 100, 1
  ) as paywall_to_started_pct,

  round(
    count(distinct case when event_name = 'purchase_succeeded' then coalesce(user_id::text, session_id) end)::numeric
    / nullif(count(distinct case when event_name = 'purchase_started' then coalesce(user_id::text, session_id) end), 0)
    * 100, 1
  ) as started_to_succeeded_pct

from public.analytics_events
where event_name in (
  'upgrade_cta_opened',
  'paywall_viewed',
  'purchase_started',
  'purchase_succeeded',
  'purchase_restored'
);


-- ─── 2. AI Usage Breakdown ────────────────────────────────────────────────────
--
-- Unique-user and total-event counts per AI feature type.
-- Distinguishes free-tier AI usage from Pro-tier AI usage.
--
-- Free-tier AI:  ai_chat_used, build_day_used, recover_day_used
-- Pro-tier AI:   weekly_review_used
--
-- Answers:
--   How many users use any AI feature at all?
--   How many use free-only features vs Pro features?
--   Which AI action is most frequently used (engagement depth)?

create or replace view public.v_ai_usage_breakdown as
select
  -- Unique user counts (breadth)
  count(distinct case
    when event_name in ('ai_chat_used', 'build_day_used', 'recover_day_used', 'weekly_review_used')
    then coalesce(user_id::text, session_id)
  end) as any_ai_users,

  count(distinct case
    when event_name in ('ai_chat_used', 'build_day_used', 'recover_day_used')
    then coalesce(user_id::text, session_id)
  end) as free_ai_users,

  count(distinct case
    when event_name = 'weekly_review_used'
    then coalesce(user_id::text, session_id)
  end) as weekly_review_users,

  -- Total event counts (engagement depth)
  count(case when event_name = 'ai_chat_used'       then 1 end) as ai_chat_events,
  count(case when event_name = 'build_day_used'     then 1 end) as build_day_events,
  count(case when event_name = 'recover_day_used'   then 1 end) as recover_day_events,
  count(case when event_name = 'weekly_review_used' then 1 end) as weekly_review_events

from public.analytics_events
where event_name in (
  'ai_chat_used',
  'build_day_used',
  'recover_day_used',
  'weekly_review_used'
);


-- ─── 3. Quota Pressure ────────────────────────────────────────────────────────
--
-- For users who hit quota_exhausted, tracks downstream upgrade behaviour:
-- did they open the upgrade CTA after hitting quota, and did they convert?
--
-- Uses the first quota_exhausted event per identity as the reference
-- timestamp. Only CTA opens and purchases *after* that timestamp count.
--
-- Answers:
--   How many users have hit quota exhaustion at all?
--   Of those, how many opened the upgrade CTA afterwards?
--   Of those, how many completed a purchase?
--   Is quota exhaustion a meaningful upgrade driver?
--
-- Performance note:
--   The CTE self-joins on the computed expression
--   COALESCE(user_id::text, session_id). At early data volumes this
--   is fast; if the table grows large, consider a generated column
--   + index on that expression.

create or replace view public.v_quota_pressure as
with
-- Each unique identity's first quota_exhausted event
quota_hits as (
  select
    coalesce(user_id::text, session_id) as identity,
    min(created_at)                     as first_quota_at
  from public.analytics_events
  where event_name = 'quota_exhausted'
  group by 1
),
-- Among quota hitters: did they open the upgrade CTA afterwards?
cta_after_quota as (
  select distinct qh.identity
  from quota_hits qh
  join public.analytics_events ae
    on  coalesce(ae.user_id::text, ae.session_id) = qh.identity
    and ae.event_name  = 'upgrade_cta_opened'
    and ae.created_at >= qh.first_quota_at
),
-- Among quota hitters: did they complete a purchase afterwards?
converted_after_quota as (
  select distinct qh.identity
  from quota_hits qh
  join public.analytics_events ae
    on  coalesce(ae.user_id::text, ae.session_id) = qh.identity
    and ae.event_name  = 'purchase_succeeded'
    and ae.created_at >= qh.first_quota_at
)
select
  count(*)                                                          as hit_quota,
  count(caq.identity)                                               as opened_cta_after_quota,
  count(cav.identity)                                               as converted_after_quota,

  -- Conversion rates from quota hit (null when no quota hits yet)
  round(
    count(caq.identity)::numeric / nullif(count(*), 0) * 100, 1
  )                                                                 as quota_to_cta_pct,

  round(
    count(cav.identity)::numeric / nullif(count(*), 0) * 100, 1
  )                                                                 as quota_to_converted_pct

from quota_hits qh
left join cta_after_quota      caq using (identity)
left join converted_after_quota cav using (identity);


-- ============================================================
-- Done.
-- Views: v_upgrade_funnel, v_ai_usage_breakdown, v_quota_pressure
-- Access: service-role only (inherits analytics_events RLS)
-- ============================================================
