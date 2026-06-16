# LifeOS

> **Your AI-powered personal operating system.**

LifeOS is a mobile-first productivity platform that unifies goal tracking, intelligent daily planning, AI coaching, academic management, project tracking, and usage-metered subscriptions into a single cohesive system. Built with Expo React Native and a Supabase backend.

---

## Table of Contents

- [Product Overview](#product-overview)
- [Core Features](#core-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database & Migrations](#database--migrations)
- [Beta Program](#beta-program)
- [Documentation](#documentation)
- [License](#license)

---

## Product Overview

LifeOS is built around one idea: **your productivity tools should know you**. Instead of managing five separate apps, LifeOS gives you a single system that connects your goals, schedule, academic commitments, projects, and daily focus — and reasons about all of them together via an AI coach trained on your context.

---

## Core Features

| Feature | Description |
|---|---|
| **AI Coach** | Conversational coach powered by Anthropic Claude. Handles daily planning, weekly review, day recovery, and open-ended coaching with full context injection. |
| **Smart Daily Planner** | Energy-aware plan generation. Fills free time around fixed schedule events with goal-aligned focus sessions. Supports mid-day adaptive rescheduling. |
| **Goal & Focus Tracking** | Weekly hour targets per goal. Integrated focus timer with session logging. Real-time progress against targets shown as an alignment ring. |
| **Academic Intelligence** | Course management, exam scheduling, assignment tracking, topic-level readiness scoring, and risk detection with actionable recommendations. |
| **Project Intelligence** | Milestone tracking, health scoring, velocity analysis, deadline risk assessment, and AI-generated project recommendations. |
| **AI Memory** | Persistent user memory stored in Supabase. Automatically injected into every coaching session for personalized, context-aware responses. |
| **Subscription & Billing** | Free / Pro / Max tiers via RevenueCat. Server-side entitlement enforcement. Per-action credit metering with monthly quota and live usage display. |
| **Analytics Pipeline** | Full funnel event tracking. Retention milestones, reengagement detection, and conversion views built into the database layer. |
| **Beta Feedback System** | In-app qualitative feedback collection with Supabase persistence and an admin review dashboard with filter modes and summary statistics. |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Expo React Native (SDK 51)           │
│  app/(tabs)/  ·  src/services/  ·  src/store/        │
│  expo-router (file-based) · Zustand + AsyncStorage   │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS — Supabase JS v2
┌──────────────────────▼───────────────────────────────┐
│                 Supabase Platform                     │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │           Edge Functions (Deno)               │   │
│  │  ai-chat · activate-purchase · rc-webhook     │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │           PostgreSQL + Row-Level Security     │   │
│  │  Auth · Goals · Plans · Schedule · Memory    │   │
│  │  Analytics · Usage · Billing · Beta Feedback │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│                External Services                      │
│  Anthropic Claude API  ·  RevenueCat Billing          │
└──────────────────────────────────────────────────────┘
```

See [`docs/architecture.md`](docs/architecture.md) for a full system breakdown.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 51, React Native |
| Language | TypeScript (strict mode) |
| Navigation | Expo Router ~3.5 (file-based routing) |
| State | Zustand ^4.5 + AsyncStorage (store key: `lifeos-store-v3`) |
| Backend | Supabase (PostgreSQL · Auth · Edge Functions · Storage) |
| AI | Anthropic Claude (`claude-haiku-4-5-20251001`) |
| Billing | RevenueCat (`react-native-purchases`) |
| Build | EAS Build (development / preview / production profiles) |
| Icons | `@expo/vector-icons` (Ionicons) |
| Graphics | `react-native-svg` (alignment ring, charts) |

---

## Repository Structure

```
lifeos/
├── app/                              # Expo Router screens
│   ├── _layout.tsx                   # Root layout — auth gate, session, retention tracking
│   ├── index.tsx                     # Entry redirect (onboarding vs. home)
│   ├── onboarding/index.tsx          # Multi-step onboarding flow
│   ├── upgrade.tsx                   # Subscription upgrade screen
│   ├── beta-feedback-review.tsx      # Admin: beta feedback review dashboard
│   └── (tabs)/
│       ├── home.tsx                  # Dashboard — alignment ring, critical action
│       ├── ai.tsx                    # AI Coach tab — chat, actions, quota, vote buttons
│       ├── plan.tsx                  # Plan tab — goals, schedule, friction log
│       ├── planner.tsx               # Daily planner — generated plan + focus mode
│       ├── analytics.tsx             # Analytics dashboard — retention, funnel
│       ├── settings.tsx              # Settings — beta readiness, subscription, profile
│       └── schedule/
│           ├── index.tsx             # Weekly recurring events (CRUD)
│           └── import.tsx            # Import schedule via camera (Claude Vision)
│
├── src/
│   ├── ai/                           # AI engine layer
│   │   ├── AIClient.ts               # Shared interface + agent type detection
│   │   ├── BackendAIClient.ts        # Routes chat through Supabase Edge Function
│   │   ├── LocalAIClient.ts          # Offline-capable local fallback
│   │   ├── planningEngine.ts         # generateSmartDailyPlan / generateSmartWeeklyPlan
│   │   ├── progressEngine.ts         # computeProgressScore — alignment ring input
│   │   ├── adaptiveRescheduler.ts    # rescheduleRemaining — mid-day replanning
│   │   ├── scheduleParser.ts         # Claude Vision schedule import parser
│   │   └── planGenerator.ts          # Base greedy time-slot scheduler
│   │
│   ├── components/                   # Shared UI components
│   │   ├── BetaFeedbackModal.tsx     # Qualitative beta feedback bottom sheet
│   │   └── plan/                     # Plan tab sub-components
│   │
│   ├── constants/
│   │   └── theme.ts                  # Design tokens — colors, spacing, typography
│   │
│   ├── i18n/
│   │   └── locales/en.ts             # All user-facing strings
│   │
│   ├── lib/
│   │   ├── supabase.ts               # Supabase JS client (EXPO_PUBLIC_* env vars)
│   │   └── utils.ts                  # Shared utility helpers
│   │
│   ├── services/                     # Backend integrations and business logic
│   │   ├── analyticsService.ts       # track() · identify() · reset()
│   │   ├── betaFeedbackService.ts    # submitBetaFeedback() · fetchBetaFeedback()
│   │   ├── entitlementService.ts     # canUseFeature() — client-side tier gating
│   │   ├── memoriesService.ts        # upsertMemory / getMemories (memories table)
│   │   ├── notificationService.ts    # Push notifications setup and routing
│   │   ├── purchaseService.ts        # RevenueCat purchase flow + mock mode
│   │   └── usageService.ts           # useMonthlyUsage hook — credit tracking
│   │
│   ├── store/
│   │   └── useAppStore.ts            # Zustand store — all app state + cloud sync
│   │
│   └── types/
│       └── index.ts                  # All TypeScript data models
│
├── supabase/
│   ├── config.toml                   # Supabase CLI project config
│   ├── functions/                    # Deno Edge Functions
│   │   ├── _shared/                  # Shared server-side modules
│   │   │   ├── memoryService.ts
│   │   │   ├── recoveryService.ts
│   │   │   └── weeklyReviewService.ts
│   │   ├── ai-chat/index.ts          # Main AI coaching endpoint
│   │   ├── activate-purchase/index.ts
│   │   └── rc-webhook/index.ts       # RevenueCat webhook handler
│   └── migrations/                   # Ordered PostgreSQL migrations
│
├── docs/                             # Architecture and integration documentation
├── .env.example                      # Environment variable template
├── app.json                          # Expo project config
├── eas.json                          # EAS Build profiles
└── tsconfig.json                     # TypeScript config (strict + ESNext modules)
```

---

## Quick Start

**Prerequisites:** Node.js 18+, npm 9+, Expo CLI, a Supabase project.

```bash
git clone https://github.com/zainaas-wq/LIFEOS.git
cd LIFEOS
npm install
cp .env.example .env
# Edit .env — add your Supabase URL and anon key
npx expo start
```

For a full walkthrough including Supabase setup, database migrations, and EAS configuration, see [`docs/development-setup.md`](docs/development-setup.md).

---

## Environment Variables

| Variable | Location | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` | Supabase anon public key |
| `EXPO_PUBLIC_RC_MOCK_MODE` | `eas.json` dev profile | Bypass RevenueCat in development |
| `ANTHROPIC_API_KEY` | Supabase secrets | Claude API key (server-side only — never in the client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secrets | Service role key (Edge Functions only) |

**Security:** Never commit real keys to version control. All client-side keys use the `EXPO_PUBLIC_` prefix and are scoped to the anon Supabase role. Server secrets are stored exclusively in Supabase's secrets manager.

---

## Database & Migrations

Migrations live in `supabase/migrations/` and are applied in order by the Supabase CLI. To apply all pending migrations to your local or linked Supabase project:

```bash
supabase db push
```

Key tables: `goals`, `focus_sessions`, `schedule_events`, `daily_plans`, `memories`, `analytics_events`, `usage_events`, `beta_feedback`.

Row-level security is enabled on all user-data tables. Every table enforces user ownership through `auth.uid()` policies.

---

## Beta Program

LifeOS is currently in closed beta (`v1.0.0-beta`). The beta program focuses on:

- **Retention signal:** Day-1, Day-3, Day-7, and Day-14 active milestones tracked per user.
- **Recommendation quality:** Thumbs-up / thumbs-down votes on AI suggestions, tracked as `recommendation_accepted` / `recommendation_rejected` analytics events.
- **Qualitative feedback:** In-app `BetaFeedbackModal` collects NPS-style score, personalization rating, return intent, and optional open-ended responses. All submissions are stored in the `beta_feedback` table.
- **Admin review:** Beta feedback is reviewable via **Settings → Beta Readiness → View Beta Feedback** with six filter modes and a summary bar.

Beta metrics and feedback are reviewed weekly against the GO/NO-GO launch criteria defined in the internal beta charter.

---

## Documentation

| Document | Description |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | System architecture, data flow, component map |
| [`docs/backend.md`](docs/backend.md) | Supabase schema, Edge Functions, RLS policies |
| [`docs/ai-system.md`](docs/ai-system.md) | AI coaching pipeline, prompt architecture, memory injection |
| [`docs/billing.md`](docs/billing.md) | RevenueCat integration, tier model, entitlement gating |
| [`docs/analytics.md`](docs/analytics.md) | Analytics event pipeline, database views, funnel tracking |
| [`docs/development-setup.md`](docs/development-setup.md) | Local dev setup, environment variables, running the app |

---

## License

MIT
