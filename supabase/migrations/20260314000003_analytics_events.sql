-- ============================================================
-- LifeOS — Sprint 11 Block A: Product Analytics Foundation
--
-- Creates the analytics_events table used by the client-side
-- analyticsService to record product events.
--
-- Design:
--   - user_id is nullable: pre-auth events (paywall_viewed,
--     app_opened in guest mode) are tracked with user_id = NULL.
--   - properties is a jsonb column for compact event-specific
--     metadata (scalar values only — no large blobs).
--   - session_id is a client-generated string that groups
--     events within a single app session.
--   - No UPDATE or DELETE policies: analytics rows are immutable
--     from the client. Reads are admin/service-role only.
--
-- RLS:
--   Two permissive INSERT policies cover all callers:
--   1. Authenticated → user_id must equal auth.uid()
--   2. Guest/anon   → user_id must be NULL (auth.uid() IS NULL)
--   Neither can spoof the other.
--
-- Indexes:
--   user + event  → user journey / funnel queries
--   event + time  → product-wide event frequency queries
--   time only     → time-series / retention queries
-- ============================================================

-- ─── Table ────────────────────────────────────────────────────────────────────

create table if not exists public.analytics_events (
  id          uuid        primary key default gen_random_uuid(),
  event_name  text        not null,
  user_id     uuid        references auth.users(id) on delete set null,
  session_id  text,
  properties  jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists analytics_events_user_event_idx
  on public.analytics_events(user_id, event_name);

create index if not exists analytics_events_event_time_idx
  on public.analytics_events(event_name, created_at desc);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events(created_at desc);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table public.analytics_events enable row level security;

-- Authenticated users may insert events attributed to their own user_id.
create policy "analytics_events: insert authenticated"
  on public.analytics_events
  for insert
  with check (auth.uid() is not null and user_id = auth.uid());

-- Guest / unauthenticated callers may insert events with user_id = NULL.
-- auth.uid() IS NULL means no active session (Expo Guest mode, pre-login).
create policy "analytics_events: insert guest"
  on public.analytics_events
  for insert
  with check (auth.uid() is null and user_id is null);

-- No SELECT policy: all reads require the service role key (admin queries only).

-- ============================================================
-- Done.  Table: analytics_events. Indexes: 3. RLS policies: 2.
-- ============================================================
