# LifeOS — Build Guide

## Prerequisites

- **Node.js 18+**
- **Expo CLI**: `npm install -g expo-cli`
- **EAS CLI**: `npm install -g eas-cli`
- **Expo account**: [expo.dev](https://expo.dev) (free)

---

## Run Locally

```bash
npx expo start
```

Then press:
- `w` — open in browser (web)
- `i` — open in iOS Simulator
- `a` — open in Android Emulator

---

## Web

```bash
npm run build:web
```

Outputs a static bundle to `dist/`. Deploy to any static host:
- **Vercel**: `vercel dist/`
- **Netlify**: drag-and-drop `dist/` in the dashboard
- **GitHub Pages**: push `dist/` contents to `gh-pages` branch

---

## iOS (App Store / TestFlight)

```bash
eas login
npm run build:ios
```

Download the `.ipa` from the EAS dashboard, then upload to App Store Connect via Transporter or Xcode. Submit to TestFlight or App Store from there.

---

## Android (Play Store)

```bash
eas login
npm run build:android
```

Download the `.aab` from the EAS dashboard, then upload to Google Play Console under the desired release track.

---

## Preview Builds (internal testing)

```bash
npm run build:preview
```

- **Android**: produces a sideloadable `.apk`
- **iOS**: produces a Simulator build (not installable on physical devices without a paid Apple account)

Share the download link from the EAS dashboard with testers.

---

## Development Builds (device testing with dev client)

```bash
npm run build:dev
```

Installs `expo-dev-client` on a physical device, enabling full native module support while still connecting to the Metro dev server.

---

## Environment / Secrets

LifeOS uses a backend AI routing layer (Supabase Edge Functions). Server-side secrets are managed in Supabase and never ship inside the app binary.

**Required Supabase secrets** (set via `supabase secrets set`):
- `OPENAI_API_KEY` — primary AI provider
- `NVIDIA_NIM_API_KEY` — cheap-mode / fallback provider
- `ANTHROPIC_API_KEY` — optional third provider

No `.env` file is required to build or run the app itself. The mobile client authenticates to Supabase using the project `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` values in `app.config.js` / EAS environment variables — these are safe to expose in the bundle (anon key, RLS-enforced).

---

## First Run Behavior

- **Production builds**: new users are directed to the onboarding screen. No demo data is auto-loaded.
- **Dev server (`npx expo start`)**: demo seed data loads automatically on first launch so you can explore the app without manual setup.
