# Development Setup

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18+ | Or use Bun |
| Expo CLI | Latest | `npm install -g expo-cli` |
| Supabase CLI | Latest | `npm install -g supabase` |
| Expo Go | Latest | On your iOS/Android device |

---

## 1. Clone and Install

```bash
git clone https://github.com/zainaas-wq/LIFEOS.git
cd LIFEOS
npm install
```

---

## 2. Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Both values are found in: **Supabase Dashboard → Settings → API**

The anon key is safe to include in the client — Row-Level Security enforces per-user data isolation.

---

## 3. Supabase Setup

### Create a project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Copy the project URL and anon key into `.env`.

### Run migrations

```bash
# Link your local project to Supabase
supabase link --project-ref your-project-ref

# Apply all migrations
supabase db push
```

Migrations are in `supabase/migrations/` and must be applied in timestamp order (the CLI handles this automatically).

### Deploy Edge Functions

```bash
# Set required secrets first
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
supabase secrets set SUPABASE_ANON_KEY=your-anon-key
supabase secrets set RC_WEBHOOK_SECRET=your-rc-webhook-secret

# Deploy all functions
supabase functions deploy

# Or deploy individually
supabase functions deploy ai-chat
supabase functions deploy activate-purchase
supabase functions deploy rc-webhook
```

The service role key is in: **Supabase Dashboard → Settings → API → service_role (secret)**

---

## 4. RevenueCat Setup (Optional for development)

In development, billing is bypassed via mock mode. No RevenueCat setup is required to run the app locally.

Mock mode is active when `EXPO_PUBLIC_RC_MOCK_MODE=true` (set in `eas.json` development profile and passed automatically by EAS builds). For local `npx expo start`, mock mode is **not** active by default.

To enable mock mode locally, add to `.env`:
```env
EXPO_PUBLIC_RC_MOCK_MODE=true
```

For production setup, see [`docs/billing.md`](billing.md).

---

## 5. Running the App

### On your device (Expo Go)

```bash
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS). Your device and computer must be on the same Wi-Fi network.

### In the browser

```bash
npx expo start --web
```

Opens at `http://localhost:8081`. Useful for rapid UI iteration.

### Simulators

```bash
npm run ios       # iOS Simulator (macOS only)
npm run android   # Android Emulator
```

---

## 6. Type Checking

```bash
npx tsc --noEmit
```

The `supabase/functions/` directory is excluded from the React Native TypeScript config (it uses Deno's module system). See `tsconfig.json`.

**Windows note:** Expo Router generates backslash paths in `.expo/types/router.d.ts`. If `tsc` fails on that file, overwrite it with a clean forward-slash version or use `as any` casts on non-standard `router.push()` calls.

---

## 7. EAS Build Profiles

Defined in `eas.json`:

| Profile | Purpose | RC Mock Mode |
|---|---|---|
| `development` | Local development with dev client | `true` |
| `preview` | Internal testing (APK / IPA) | `false` |
| `production` | App Store / Play Store submission | `false` |

```bash
# Build development client
eas build --profile development --platform ios

# Build preview
eas build --profile preview --platform android
```

---

## 8. Project Conventions

- **Dark minimal design:** background `#0A0A0A`, gold accent `#C9A84C`
- **State:** all persistent state in `useAppStore` (Zustand + AsyncStorage, key `lifeos-store-v3`)
- **Services:** thin async wrappers — never hold state, always typed
- **Commits:** conventional commits (`feat()`, `fix()`, `chore()`) with scope
- **Branches:** `feature/*`, `fix/*`, `chore/*` — never commit directly to `main`
