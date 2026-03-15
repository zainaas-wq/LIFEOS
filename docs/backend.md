# Backend — Supabase Schema & Edge Functions

## Database Schema

### Core Tables (Sprint 1–2)

| Table | Purpose |
|---|---|
| `profiles` | User display name, avatar, onboarding completion |
| `daily_plans` | One row per user per date — the plan container |
| `daily_plan_items` | Individual scheduled blocks within a plan |
| `goals` | User goals with weekly hour targets and priorities |
| `focus_sessions` | Completed focus timer sessions (start, end, goal) |
| `distraction_logs` | Logged distraction events with timestamps |
| `rules` | User-defined personal standards |
| `schedule_events` | Recurring weekly schedule blocks (lectures, gym, etc.) |

### AI / Usage Tables (Sprint 8–10)

| Table | Migration | Purpose |
|---|---|---|
| `ai_usage_log` | `20260313000001` | Per-request token and action logging |
| `ai_plan_tiers` | `20260313000002` | Plan tier definitions (free/pro/max budgets) |
| `ai_user_tier` | `20260313000003` | Current tier assignment per user |
| `ai_plan_tiers` (pro row) | `20260313000004` | Pro tier configuration |
| `ai_user_tier` (billing cols) | `20260313000005` | RevenueCat purchase metadata columns |
| `ai_user_memory` | `20260314000001` | Persistent AI memory key-value store per user |

### Analytics Tables (Sprint 11–12)

| Table / View | Migration | Purpose |
|---|---|---|
| `analytics_events` | `20260314000003` | Raw event log (event_name, user_id, properties) |
| `weekly_review` action | `20260314000002` | Adds `weekly_review` to usage log CHECK constraint |
| `analytics_funnel` view | `20260315000001` | Conversion funnel (signup → onboarding → AI → billing) |
| `analytics_retention` view | `20260315000002` | Weekly cohort retention table |
| `analytics_reengagement` view | `20260315000003` | Users inactive 7+ days |

---

## Edge Functions

### `ai-chat`

**Endpoint:** `POST /functions/v1/ai-chat`
**Auth:** Supabase JWT (user must be authenticated)

**Request body:**
```typescript
{
  action: 'chat' | 'build_day' | 'weekly_plan' | 'weekly_review' | 'recover_day',
  message: string,
  context: ChatContext
}
```

**Responsibilities:**
1. Verify JWT — extract `user.id`
2. Parallel fetch: `fetchUserMemory` + `getUserTierId`
3. Load tier limits from `ai_plan_tiers`
4. Sum credits used this month from `ai_usage_log`
5. Return 429 if over quota
6. Build action-specific system prompt with memory injection
7. Call Anthropic Claude (or OpenAI fallback)
8. Log usage to `ai_usage_log` (fire-and-forget, non-blocking)
9. Return `{ reply: string }`

**Credit costs per action:**
| Action | Credits |
|---|---|
| chat | 1 |
| build_day | 3 |
| recover_day | 2 |
| weekly_plan | 5 |
| weekly_review | 5 |

---

### `activate-purchase`

**Endpoint:** `POST /functions/v1/activate-purchase`
**Auth:** Supabase JWT

**Request body:**
```typescript
{ productId: string, purchaseToken: string }
```

**Flow:**
1. Validate JWT
2. Call RevenueCat REST API to verify purchase
3. Map product ID to tier (`free` / `pro` / `max`)
4. Upsert `ai_user_tier` row via service role (bypasses RLS)
5. Return `{ success: true, tierId }`

---

### `rc-webhook`

**Endpoint:** `POST /functions/v1/rc-webhook`
**Auth:** `X-RevenueCat-Signature` HMAC validation

**Handles:**
- `INITIAL_PURCHASE` → upsert tier row to pro/max
- `RENEWAL` → update `current_period_end`
- `EXPIRATION` → downgrade to free (with stale-event protection via `rc_event_at`)
- `CANCELLATION` → mark cancelled, keep active until period end

**Stale-event protection:**
The webhook only applies downgrades if the incoming `rc_event_at` timestamp is newer than the stored value. This prevents an out-of-order EXPIRATION from overwriting a newer RENEWAL.

---

## Shared Modules (`supabase/functions/_shared/`)

### `memoryService.ts`
- `fetchUserMemory(adminClient, userId)` — fetches all memory rows for a user
- `upsertMemory(adminClient, userId, key, value, type)` — idempotent upsert on `(user_id, memory_key)`
- `buildMemoryContext(records)` — formats memory into prompt-ready string block
- `buildPersonalizationInstructions(records)` — builds coaching style directive from memory

### `recoveryService.ts`
- `gatherRecoveryData(adminClient, userId, todayDate)` — parallel fetch: today's plan items + distraction count
- `buildRecoverySystemPrompt(ctx, data, memoryContext)` — 4-section recovery prompt (≤200 words)

### `weeklyReviewService.ts`
- `gatherWeeklyData(adminClient, userId, todayDate)` — parallel fetch: 7-day plan items + distraction count
- `buildWeeklyReviewSystemPrompt(ctx, data, memoryContext)` — 4-section weekly review prompt (≤250 words)

---

## Row-Level Security

All tables enforce: `auth.uid() = user_id`

Edge Functions use the service role key (`SUPABASE_SERVICE_ROLE_KEY`) to bypass RLS for:
- Writing usage logs (after a chat response, on behalf of the user)
- Updating tier rows (triggered by RevenueCat, not the user)
- Reading tier configuration from `ai_plan_tiers`

---

## Running Migrations

```bash
# Apply all migrations to your Supabase project
supabase db push

# Or apply a specific migration
supabase migration up
```

Migrations are ordered by timestamp prefix. Always run in sequence.

---

## Deploying Edge Functions

```bash
# Deploy all functions
supabase functions deploy

# Deploy a specific function
supabase functions deploy ai-chat

# Set secrets (required before first deploy)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
supabase secrets set RC_WEBHOOK_SECRET=...
```
