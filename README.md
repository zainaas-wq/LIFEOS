# LifeOS

**Your AI-powered personal operating system.**

LifeOS is a mobile-first productivity platform that combines goal tracking, intelligent daily planning, AI coaching, and a usage-metered subscription model into a single cohesive system. Built on Expo React Native with a Supabase backend.

---

## Product Overview

| Capability | Description |
|---|---|
| **AI Coach** | Conversational coach powered by Anthropic Claude. Supports daily planning, weekly review, recovery sessions, and general coaching. |
| **Smart Planner** | Energy-aware daily plan generation. Fills free time around your fixed schedule with goal-aligned sessions. |
| **Goal Tracking** | Weekly hour targets per goal. Focus timer with session logging. Progress tracked against targets. |
| **Billing & Tiers** | Free / Pro / Max tiers via RevenueCat. Entitlement gating on premium AI actions. |
| **Usage Metering** | Per-action credit system. Monthly quota enforced server-side. Usage displayed in the AI tab. |
| **AI Memory** | Persistent user memory stored in Supabase. Injected into every coaching prompt for personalization. |
| **Analytics** | Full funnel analytics pipeline. Retention, reengagement, and conversion views built into the database. |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Expo React Native               │
│  app/(tabs)/  ·  src/services/  ·  src/store/   │
└────────────────────┬────────────────────────────┘
                     │ HTTPS (Supabase JS client)
┌────────────────────▼────────────────────────────┐
│              Supabase Platform                   │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │           Edge Functions (Deno)          │    │
│  │  ai-chat · activate-purchase · rc-webhook│    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │           PostgreSQL Database            │    │
│  │  Auth · Plans · Goals · Usage · Memory  │    │
│  │  Analytics · Billing · AI Memory        │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│           External Services                      │
│  Anthropic Claude API  ·  RevenueCat Billing     │
└─────────────────────────────────────────────────┘
```

See [`docs/architecture.md`](docs/architecture.md) for a full breakdown.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo ~51, React Native |
| Language | TypeScript (strict) |
| Navigation | Expo Router ~3.5 (file-based) |
| State | Zustand ^4.5 + AsyncStorage (key: `lifeos-store-v3`) |
| Backend | Supabase (Postgres + Auth + Edge Functions) |
| AI | Anthropic Claude (`claude-haiku-4-5-20251001`) |
| Billing | RevenueCat (`react-native-purchases`) |
| SVG | `react-native-svg` (AlignmentRing) |
| Icons | `@expo/vector-icons` (Ionicons) |
| Build | EAS Build (development / preview / production profiles) |

---

## Repository Structure

```
lifeos/
├── app/                            # Expo Router pages
│   ├── _layout.tsx                 # Root layout, auth gate, session tracking
│   ├── index.tsx                   # Entry redirect (onboarding vs home)
│   ├── onboarding/index.tsx        # Multi-step onboarding flow
│   ├── upgrade.tsx                 # Subscription upgrade screen
│   └── (tabs)/
│       ├── home.tsx                # Dashboard — alignment ring, critical action
│       ├── ai.tsx                  # AI Coach tab — chat, actions, quota display
│       ├── plan.tsx                # Plan tab — tracks, schedule, month, friction
│       ├── planner.tsx             # Daily planner — generated plan + focus mode
│       ├── profile.tsx             # Profile — Pro badge, subscription management
│       └── schedule/
│           ├── index.tsx           # Weekly recurring events (CRUD)
│           └── import.tsx          # Import schedule via camera (Claude Vision)
│
├── src/
│   ├── ai/                         # Local AI engines
│   │   ├── BackendAIClient.ts      # Routes all AI chat through Supabase Edge Function
│   │   ├── planningEngine.ts       # generateSmartDailyPlan / generateSmartWeeklyPlan
│   │   ├── progressEngine.ts       # computeProgressScore for alignment ring
│   │   ├── adaptiveRescheduler.ts  # rescheduleRemaining (mid-day replanning)
│   │   ├── scheduleParser.ts       # Claude Vision — parse imported schedules
│   │   └── planGenerator.ts        # Base greedy scheduler (time-slot engine)
│   ├── components/plan/            # Plan tab sub-components
│   ├── constants/theme.ts          # Design tokens (colors, spacing, radius, typography)
│   ├── i18n/locales/en.ts          # All UI strings
│   ├── lib/
│   │   ├── supabase.ts             # Supabase JS client (reads EXPO_PUBLIC_* env vars)
│   │   └── utils.ts                # Shared helpers
│   ├── services/                   # All backend integrations
│   │   ├── analyticsService.ts     # track() / identify() / reset()
│   │   ├── entitlementService.ts   # canUseFeature() — client-side tier gating
│   │   ├── memoryService.ts        # upsertMemory / fetchMemory (ai_user_memory)
│   │   ├── purchaseService.ts      # RevenueCat purchase + mock mode
│   │   └── usageService.ts         # useMonthlyUsage hook — credits used / quota
│   ├── store/useAppStore.ts        # Zustand store — all app state + persistence
│   └── types/                      # TypeScript data models
│
├── supabase/
│   ├── config.toml                 # Supabase CLI project config
│   ├── functions/                  # Deno Edge Functions
│   │   ├── _shared/                # Shared modules
│   │   │   ├── memoryService.ts
│   │   │   ├── recoveryService.ts
│   │   │   └── weeklyReviewService.ts
│   │   ├── ai-chat/index.ts        # Main AI coach endpoint
│   │   ├── activate-purchase/index.ts
│   │   └── rc-webhook/index.ts
│   └── migrations/                 # Ordered Postgres migrations (12 total)
│
├── docs/                           # Architecture and integration documentation
├── .env.example                    # Environment variable template
├── app.json                        # Expo project config
├── eas.json                        # EAS Build profiles
└── tsconfig.json
```

---

## Documentation

| Document | Description |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | System architecture, data flow, component map |
| [`docs/backend.md`](docs/backend.md) | Supabase schema, Edge Functions, RLS policies |
| [`docs/ai-system.md`](docs/ai-system.md) | AI coaching pipeline, prompt architecture, memory system |
| [`docs/billing.md`](docs/billing.md) | RevenueCat integration, tier model, entitlement gating |
| [`docs/analytics.md`](docs/analytics.md) | Analytics event pipeline, database views, funnel tracking |
| [`docs/development-setup.md`](docs/development-setup.md) | Local dev setup, environment variables, running the app |

---

## Quick Start

```bash
git clone https://github.com/zainaas-wq/LIFEOS.git
cd LIFEOS
npm install
cp .env.example .env
# Fill in .env with your Supabase project URL and anon key
npx expo start
```

See [`docs/development-setup.md`](docs/development-setup.md) for the full setup guide.

---

## Environment Variables

| Variable | Location | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` | Supabase anon public key |
| `EXPO_PUBLIC_RC_MOCK_MODE` | `eas.json` dev profile | Bypass RevenueCat in development |
| `ANTHROPIC_API_KEY` | Supabase secrets | Claude API key (server-side only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secrets | Service role key (Edge Functions only) |

**Never commit real keys.** See `.env.example` for the full template.

---

## License

MIT
