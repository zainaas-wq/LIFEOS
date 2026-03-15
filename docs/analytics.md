# Analytics — Event Pipeline & Database Views

## Overview

LifeOS uses a custom analytics pipeline built directly on Supabase. All events are written to `analytics_events` and queried through pre-built PostgreSQL views.

---

## Event Pipeline

### Client (`src/services/analyticsService.ts`)

```typescript
track(eventName: string, properties?: Record<string, unknown>): void
identify(userId: string, traits?: Record<string, unknown>): void
reset(): void
```

`track()` is fire-and-forget — it inserts into `analytics_events` and never blocks the UI.

### Event Schema (`analytics_events`)

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | FK to auth.users (nullable for anonymous) |
| `event_name` | text | Event identifier (see list below) |
| `properties` | jsonb | Arbitrary event metadata |
| `created_at` | timestamptz | Server timestamp |

---

## Tracked Events

### Lifecycle
| Event | Trigger | Properties |
|---|---|---|
| `app_opened` | `app/_layout.tsx` on auth state change | `{ platform }` |
| `session_start` | `app/_layout.tsx` on valid session | `{ userId }` |
| `onboarding_completed` | `app/onboarding/index.tsx` on profile save | `{ goalsCount, seriousnessScore }` |

### AI Coach
| Event | Trigger | Properties |
|---|---|---|
| `ai_chat_used` | `app/(tabs)/ai.tsx` on chat send | `{ action, creditsUsed }` |
| `weekly_review_used` | AI tab — weekly review action | `{ creditsUsed }` |
| `build_day_used` | AI tab — build day action | `{ creditsUsed }` |
| `recover_day_used` | AI tab — recover day action | `{ creditsUsed }` |

### Billing
| Event | Trigger | Properties |
|---|---|---|
| `upgrade_screen_viewed` | `app/upgrade.tsx` on mount | `{ currentTier }` |
| `purchase_started` | upgrade.tsx on product select | `{ productId }` |
| `purchase_completed` | activate-purchase success | `{ productId, tierId }` |
| `purchase_failed` | RC purchase error | `{ productId, error }` |
| `restore_purchases_tapped` | profile.tsx restore button | `{}` |

---

## Database Views

### `analytics_funnel` (migration `20260315000001`)

Tracks conversion through the core product funnel:

```sql
SELECT
  total_users,
  completed_onboarding,
  used_ai_coach,
  completed_purchase
FROM analytics_funnel;
```

### `analytics_retention` (migration `20260315000002`)

Weekly cohort retention table. Each row is a signup cohort week with columns for W0–W8 retention rates.

```sql
SELECT cohort_week, w0, w1, w2, w4, w8
FROM analytics_retention
ORDER BY cohort_week DESC;
```

### `analytics_reengagement` (migration `20260315000003`)

Users who have not triggered `app_opened` in the last 7 days. Used for re-engagement campaign targeting.

```sql
SELECT user_id, last_seen, days_inactive
FROM analytics_reengagement
WHERE days_inactive >= 7;
```

---

## Querying Analytics

All views are accessible via the Supabase Dashboard (Table Editor → Views) or via the SQL editor.

Example: Daily active users for the last 30 days

```sql
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(DISTINCT user_id) AS dau
FROM analytics_events
WHERE event_name = 'app_opened'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1 DESC;
```

Example: AI action distribution

```sql
SELECT
  properties->>'action' AS action,
  COUNT(*) AS uses,
  COUNT(DISTINCT user_id) AS unique_users
FROM analytics_events
WHERE event_name = 'ai_chat_used'
GROUP BY 1
ORDER BY 2 DESC;
```
