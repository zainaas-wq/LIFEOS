# Architecture — LifeOS v2

## Overview

LifeOS v2 is a client-server mobile application. The Expo React Native client handles all UI and local state. The Supabase platform provides authentication, database, and serverless compute. External services (Anthropic, RevenueCat) are accessed exclusively server-side through Edge Functions.

---

## System Diagram

```
┌──────────────────────────────────────────────────────┐
│                  React Native Client                  │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  Expo Router │  │ Zustand Store│  │ src/ai/*  │  │
│  │  app/(tabs)/ │  │ useAppStore  │  │  engines  │  │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘  │
│         │                 │                │         │
│  ┌──────▼─────────────────▼────────────────▼──────┐  │
│  │              src/services/                     │  │
│  │  BackendAIClient · purchaseService             │  │
│  │  entitlementService · usageService             │  │
│  │  analyticsService · memoryService              │  │
│  └──────────────────────┬─────────────────────────┘  │
└─────────────────────────┼────────────────────────────┘
                          │ Supabase JS (HTTPS + JWT)
┌─────────────────────────▼────────────────────────────┐
│                  Supabase Platform                    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │             Edge Functions (Deno)            │    │
│  │                                             │    │
│  │  ai-chat           — AI coaching endpoint   │    │
│  │  activate-purchase — RevenueCat activation  │    │
│  │  rc-webhook        — Subscription lifecycle │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │           PostgreSQL + Row-Level Security    │    │
│  │                                             │    │
│  │  Auth (built-in)   profiles                 │    │
│  │  daily_plans       daily_plan_items         │    │
│  │  goals             focus_sessions           │    │
│  │  distraction_logs  rules                    │    │
│  │  ai_usage_log      ai_plan_tiers            │    │
│  │  ai_user_tier      ai_user_memory           │    │
│  │  analytics_events  rc_purchase_events       │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────────┬───────────────────────────┘
                           │
          ┌────────────────┴──────────────────┐
          │                                   │
┌─────────▼──────────┐             ┌──────────▼──────────┐
│  Anthropic Claude  │             │  RevenueCat Billing  │
│  claude-haiku-4-5  │             │  iOS / Android IAP   │
└────────────────────┘             └─────────────────────┘
```

---

## Client Architecture

### Navigation (`app/`)

Expo Router file-based navigation. Two route groups:
- `app/` — root screens (index redirect, onboarding, upgrade)
- `app/(tabs)/` — main tab bar (home, ai, plan, planner, profile)
- `app/(tabs)/schedule/` — nested Stack navigator for schedule management + import

### State Management (`src/store/useAppStore.ts`)

Single Zustand store with AsyncStorage persistence (`lifeos-store-v3`). Holds:
- User profile and onboarding data
- Goals, rules, schedule events
- Daily plan and focus session state
- Fixed schedule bounds (`fixedScheduleStart` / `fixedScheduleEnd`)
- Auth session (mirrored from Supabase Auth)

### Service Layer (`src/services/`)

Thin wrappers over Supabase client calls and external SDKs. All async, all typed. Services never hold state — they read from / write to Supabase and return data to the store or components.

### AI Engines (`src/ai/`)

Local planning engines run entirely on-device (no network call). `BackendAIClient` is the only network-bound AI module — it calls the `ai-chat` Edge Function.

---

## Backend Architecture

### Edge Functions

Three Deno functions, each with a single responsibility:

| Function | Trigger | Responsibility |
|---|---|---|
| `ai-chat` | Client POST | Build system prompt, enforce quota, call Claude/OpenAI, log usage |
| `activate-purchase` | Client POST | Validate RevenueCat purchase, write tier row |
| `rc-webhook` | RevenueCat POST | Handle subscription lifecycle (activate / expire / downgrade) |

Shared modules in `supabase/functions/_shared/` are imported by reference across functions.

### Database

All tables have Row-Level Security enabled. Users can only read/write their own rows. The service role key (available only inside Edge Functions) bypasses RLS for administrative writes (usage logging, tier management).

---

## Security Model

| Concern | Approach |
|---|---|
| API keys | Never on client. All keys are Supabase secrets accessed via `Deno.env.get()` |
| User data isolation | RLS on every table. `auth.uid() = user_id` policies |
| Quota enforcement | Server-side in `ai-chat` before calling Claude — client display is read-only |
| Purchase validation | `activate-purchase` validates with RC API before writing tier row |
| Webhook integrity | `rc-webhook` validates `X-RevenueCat-Signature` header |
| Stale event protection | `rc_event_at` timestamp ordering prevents replay of old webhook events |

---

## Data Flow: AI Chat Request

```
Client (ai.tsx)
  │
  ├─ Check entitlement: canUseFeature(action) → block if gated
  │
  ├─ Build ChatContext (date, goals, focus summary, mainFocus, biggestDistraction)
  │
  ├─ POST /functions/v1/ai-chat  { action, message, context }
  │     Authorization: Bearer <user JWT>
  │
  └─ Edge Function (ai-chat/index.ts)
       │
       ├─ Verify JWT → extract user.id
       │
       ├─ [parallel] fetchUserMemory(adminClient, user.id)
       │             getUserTierId(adminClient, user.id)
       │
       ├─ Check quota: sum credits used this month vs monthly_token_budget
       │   → 429 if over quota
       │
       ├─ Build system prompt (buildSystemPrompt / buildWeeklyReviewSystemPrompt / etc.)
       │   Inject memory context as ═══ PERSONAL CONTEXT ═══ block
       │
       ├─ Call Anthropic Claude API
       │
       ├─ Log usage to ai_usage_log (fire-and-forget)
       │
       └─ Return { reply: string }
```
