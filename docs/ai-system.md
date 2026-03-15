# AI System — Coaching Pipeline & Memory

## Overview

The AI system has two layers:

1. **Local engines** (`src/ai/`) — run entirely on-device. No network. Used for plan generation, progress scoring, and rescheduling.
2. **Backend coaching** (`supabase/functions/ai-chat/`) — network call to Claude via Supabase Edge Function. Used for all conversational AI features.

---

## Local AI Engines

### `planningEngine.ts`
- `generateSmartDailyPlan(goals, schedule, date, options)` — generates a single day's plan
- `generateSmartWeeklyPlan(goals, schedule, weekStart, options)` — generates a 7-day plan
- Energy-aware: high-energy tasks placed in morning slots (before 13:00 or after 16:00)
- Fixed schedule bounds respected (`fixedScheduleStart` / `fixedScheduleEnd` from store)

### `planGenerator.ts`
Base greedy scheduler:
- `extractFreeTime(schedule, dayStart, dayEnd)` — computes free slots by subtracting busy intervals
- `subtractIntervals(free, busy)` — interval arithmetic for slot carving
- `timeToMins(hhmm)` / `minsToTime(mins)` — time string utilities

### `progressEngine.ts`
- `computeProgressScore(planItems, rules, reflection)` → 0–100 alignment score
- Weights: task completion (40) · rules followed (30) · critical action (20) · reflection (10)
- `seriousnessScore` multiplier (0.85–1.0) applied from onboarding profile

### `adaptiveRescheduler.ts`
- `rescheduleRemaining(plan, currentTime, goals, schedule)` — mid-day replanning
- Preserves completed items, rebuilds remaining slots from current time forward

### `scheduleParser.ts`
- Calls Claude Vision API (`claude-haiku-4-5-20251001`) with a photo of a timetable
- Returns structured `ScheduleEvent[]` (parsed recurring weekly blocks)
- Used by `app/(tabs)/schedule/import.tsx`

---

## Backend AI Coach

### Actions

| Action | System Prompt Builder | Credit Cost | Tier Required |
|---|---|---|---|
| `chat` | `buildSystemPrompt` | 1 | Free |
| `build_day` | `buildSystemPrompt` (build_day mode) | 3 | Free |
| `recover_day` | `buildRecoverySystemPrompt` | 2 | Pro |
| `weekly_review` | `buildWeeklyReviewSystemPrompt` | 5 | Pro |
| `weekly_plan` | `buildSystemPrompt` (weekly_plan mode) | 5 | Pro |

### System Prompt Architecture

Every prompt is built server-side and is self-contained. The user message is only a trigger.

**Daily coaching prompt anatomy (`buildSystemPrompt`):**
```
Role + style directive
═══ TODAY: {date} ═══
Main focus · Biggest distraction · Distraction count
═══ ACTIVE GOALS ═══
Goal list with priority + weekly hour target
═══ FOCUS TIME THIS WEEK ═══
Per-goal logged hours vs target
═══ PLAN STATUS ═══
Completion rate + critical items
═══ PERSONAL CONTEXT ═══          ← injected from ai_user_memory
Coaching tone · Planning style · Recovery preference
═══ COACHING RULES ═══
Hardcoded behavioural constraints
OUTPUT FORMAT directive
```

**Weekly review prompt** (`buildWeeklyReviewSystemPrompt`): 4 sections, ≤250 words.
**Recovery prompt** (`buildRecoverySystemPrompt`): 4 sections, ≤200 words.

---

## Memory System

### Storage
Table: `ai_user_memory`
- `user_id` + `memory_key` — UNIQUE constraint (idempotent upsert)
- `memory_value` — JSONB
- `memory_type` — enum: `preference` | `pattern` | `goal_context` | `coaching_note` | `identity`

### Canonical Memory Keys
| Key | Type | Description |
|---|---|---|
| `planning_style` | preference | How user likes plans structured |
| `preferred_work_hours` | preference | Morning / afternoon / evening |
| `peak_energy_time` | preference | Best time for deep work |
| `coaching_tone` | preference | Direct / encouraging / neutral |
| `recovery_preference` | preference | How user recovers from off-days |

### Injection Pipeline
1. `fetchUserMemory(adminClient, userId)` — called in parallel with tier fetch at request start
2. `buildMemoryContext(records)` — formats into `═══ PERSONAL CONTEXT ═══` block
3. `buildPersonalizationInstructions(records)` — generates coaching style directive prepended to prompt
4. Both injected into system prompt before the output format directive

### Client-Side Memory Service (`src/services/memoryService.ts`)
- `upsertMemory({ memoryType, memoryKey, memoryValue })` — idempotent write
- `fetchMemory(key)` — single key lookup
- `fetchMemoryByType(type)` — fetch all keys of a given type
- `deleteMemory(key)` — remove a memory entry

---

## Model Configuration

| Setting | Value |
|---|---|
| Primary model | `claude-haiku-4-5-20251001` (Anthropic) |
| Fallback model | OpenAI (configurable via `OPENAI_API_KEY` secret) |
| Max tokens | 1024 |
| Temperature | Default (not overridden) |
| System prompt budget | ≤500 tokens (leaves ≥524 for response) |

The model is selected server-side by the `ai-chat` function. The client never specifies a model.
