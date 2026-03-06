# LifeOS

**Your AI-powered personal operating system.**

LifeOS is a daily command center that helps you plan your week, define your standards, and track how closely you're living in alignment with your goals.

---

## Features

- **Onboarding** — Define your focus, distractions, habits, and seriousness level
- **Home Dashboard** — Alignment score ring (0–100), critical action, daily rules, and reflection
- **Schedule** — Define your recurring weekly events (lectures, gym, work) to block busy time
- **Goals** — Set goals with weekly hour targets, priorities, and deadlines
- **Planner** — Generate a smart weekly plan that fills your free time with focused goal sessions; start Focus Mode on any block
- **Rules** — Define and enforce your personal standards (3 max on Free plan)
- **Settings** — Edit preferences, view stats, and reset data

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Expo (React Native) |
| Language | TypeScript |
| Navigation | Expo Router (file-based) |
| State | Zustand + AsyncStorage persistence |
| UI | Custom components, react-native-svg |
| Database | AsyncStorage (local, no backend required) |

---

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- Expo CLI (`npm install -g expo-cli` or use `npx expo`)
- Expo Go app on your phone (iOS or Android) — [expo.dev/go](https://expo.dev/go)

### Installation

```bash
# Navigate to the project directory
cd lifeos

# Install dependencies
npm install

# Start the development server
npx expo start
```

### Previewing on your phone (Expo Go)

1. Make sure your phone and computer are on the **same Wi-Fi network**.
2. Run `npx expo start` in your terminal.
3. Open the **Expo Go** app on your phone.
4. Scan the QR code shown in the terminal with Expo Go (Android) or your Camera app (iOS).
5. The app will load on your device instantly.

### Running in a browser (web)

```bash
npx expo start --web
# or
npm run web
```

Open `http://localhost:8081` in your browser. Useful for quick iteration without a device.

### Running on simulators

```bash
# iOS Simulator (macOS only)
npm run ios

# Android Emulator
npm run android
```

---

## Project Structure

```
lifeos/
├── app/                        # Expo Router pages
│   ├── _layout.tsx             # Root layout (hydration gate)
│   ├── index.tsx               # Entry redirect (onboarding vs home)
│   ├── onboarding/
│   │   └── index.tsx           # 6-step onboarding flow
│   └── (tabs)/
│       ├── _layout.tsx         # Tab bar + FocusBanner integration
│       ├── home.tsx            # Dashboard with alignment ring
│       ├── schedule.tsx        # Weekly recurring events (CRUD)
│       ├── goals.tsx           # Goals with hour targets (CRUD)
│       ├── planner.tsx         # Weekly plan + Focus Mode
│       ├── rules.tsx           # Rules management
│       └── settings.tsx        # Preferences and data management
│
├── src/
│   ├── types/
│   │   └── index.ts            # All TypeScript data models
│   ├── constants/
│   │   └── theme.ts            # Colors, spacing, typography
│   ├── store/
│   │   └── useAppStore.ts      # Zustand store with AsyncStorage persistence
│   ├── lib/
│   │   ├── alignmentScore.ts   # Alignment score algorithm (0–100)
│   │   ├── planGenerator.ts    # Daily plan generation engine
│   │   ├── weeklyPlanner.ts    # Schedule-aware weekly plan algorithm
│   │   ├── rulesEngine.ts      # Rule compliance and limits
│   │   ├── storage.ts          # AsyncStorage helpers
│   │   └── utils.ts            # Date, time, ID utilities
│   └── components/
│       ├── AlignmentRing.tsx   # Animated SVG score ring
│       ├── GoalCard.tsx        # Goal with progress bar and allocation
│       ├── PlanBlockCard.tsx   # Plan block with Focus chip
│       ├── FocusModal.tsx      # Full-screen countdown focus timer
│       ├── FocusBanner.tsx     # Persistent top banner during focus
│       ├── TaskCard.tsx        # Task with priority, toggle, delete
│       ├── RuleItem.tsx        # Rule with toggle, follow, delete
│       ├── ScheduleItem.tsx    # Timeline schedule entry
│       ├── SectionHeader.tsx   # Section title with optional action
│       └── ui/
│           ├── Button.tsx      # Multi-variant button
│           ├── Card.tsx        # Surface card with variants
│           ├── Divider.tsx     # Horizontal rule
│           └── Input.tsx       # Themed text input with label/error
│
├── assets/                     # Icons, splash, adaptive icon
├── app.json                    # Expo config
├── package.json
├── tsconfig.json
├── babel.config.js
└── metro.config.js
```

---

## Schedule-Aware Weekly Planner

### How it works

1. **Add your fixed schedule** (Schedule tab) — recurring events like classes, gym sessions, or work hours that block out your week.
2. **Add your goals** (Goals tab) — what you want to achieve with a weekly hour target and priority (1 = highest).
3. **Generate a plan** (Planner tab → Generate Weekly Plan) — the local algorithm:
   - Computes free slots per day between 08:00 and 22:00 (or 21:00 if a "no screens" rule is active), subtracting your schedule events.
   - Allocates goal sessions greedily by priority: 50-minute deep work blocks with 10-minute breaks, or 25-minute sessions with 5-minute breaks.
   - Spreads sessions across the week to hit each goal's hour target.
4. **Start Focus Mode** — tap any plan block to open the Focus Modal with a countdown timer, progress bar, and motivational messages. A persistent gold banner appears across all tabs during an active session.
5. **Mark complete** — at the end of a session, mark the block done directly from the Focus Modal.

### Planning algorithm constraints

- Day window: 08:00–22:00 (or 08:00–21:00 with no-screens rule)
- No blocks are created that overlap with your schedule events
- Goals are sorted by priority (1 is highest), then by most hours still needed
- Sessions snap to 50-min or 25-min boundaries

---

## Alignment Score Algorithm

The alignment score (0–100) measures how well your day aligns with your intentions:

| Component | Weight | Description |
|---|---|---|
| Task completion | 40 pts | Ratio of completed tasks |
| Rules followed | 30 pts | Ratio of active rules marked followed |
| Critical action | 20 pts | Whether the critical action is complete |
| Daily reflection | 10 pts | Whether a reflection was saved |

**Score → Label mapping:**
- 85–100: Locked In
- 60–84: Aligned
- 35–59: Building
- 0–34: Off Track

The `seriousnessScore` (set during onboarding) applies a multiplier (0.85–1.0) to calibrate expectations based on commitment level.

---

## Rules Engine

- Free plan: maximum **3 active rules**
- Pro plan: unlimited rules
- Rules track daily compliance (`followedToday` boolean)
- Compliance rate feeds directly into the alignment score
- The "No screens after 9PM" rule also constrains the weekly planner to end sessions by 21:00

---

## Design System

**Dark minimal, gold accent, no gamification.**

| Token | Value |
|---|---|
| Background | `#0A0A0A` |
| Surface | `#111111` |
| Gold (primary accent) | `#C9A84C` |
| Text primary | `#F0F0F0` |
| Text secondary | `#888888` |

---

## Future Roadmap

- [ ] AI integration (GPT/Claude API) for plan generation and reflection analysis
- [ ] Push notifications for rule reminders and focus block start times
- [ ] Weekly and monthly alignment reports
- [ ] iCloud / cloud sync for Pro users
- [ ] Widget support (iOS / Android)
- [ ] Apple Watch companion

---

## License

MIT
