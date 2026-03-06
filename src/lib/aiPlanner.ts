import type { Goal, ScheduleEvent, Rule, PlanBlock, PlanBlockType } from '../types';
import { generateId } from './utils';

// ─── Internal helpers (independent of weeklyPlanner.ts) ───────────────────────

interface Interval {
  start: number; // minutes from midnight
  end: number;
}

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function freeSlots(base: Interval[], busy: Interval[], minLen = 20): Interval[] {
  let slots = [...base];
  for (const b of busy) {
    slots = slots.flatMap((s) => {
      if (b.start >= s.end || b.end <= s.start) return [s];
      const parts: Interval[] = [];
      if (b.start > s.start) parts.push({ start: s.start, end: b.start });
      if (b.end < s.end) parts.push({ start: b.end, end: s.end });
      return parts;
    });
  }
  return slots.filter((s) => s.end - s.start >= minLen);
}

function detectNoScreensRule(rules: Rule[]): boolean {
  return rules.some(
    (r) =>
      r.enabled &&
      (r.type === 'screen' ||
        /no.*(screen|phone|device)/i.test(r.title) ||
        /9\s*pm/i.test(r.title) ||
        /21:00/i.test(r.title)),
  );
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function buildPrompt(
  goals: Goal[],
  scheduleEvents: ScheduleEvent[],
  rules: Rule[],
  mainFocus?: string,
): string {
  const DAY_START = 8 * 60;
  const noScreens = detectNoScreensRule(rules);
  const DAY_END = noScreens ? 21 * 60 : 22 * 60;

  // Compute free slots per day
  const freeSlotsLines: string[] = [];
  for (let day = 0; day < 7; day++) {
    const busy: Interval[] = scheduleEvents
      .filter((e) => e.daysOfWeek.includes(day))
      .map((e) => ({ start: timeToMins(e.start), end: timeToMins(e.end) }))
      .sort((a, b) => a.start - b.start);

    const free = freeSlots([{ start: DAY_START, end: DAY_END }], busy);
    if (free.length === 0) {
      freeSlotsLines.push(`${DAY_NAMES[day]}: No free time available`);
    } else {
      const ranges = free
        .map((s) => `${minsToTime(s.start)}–${minsToTime(s.end)} (${s.end - s.start} min)`)
        .join(', ');
      freeSlotsLines.push(`${DAY_NAMES[day]}: ${ranges}`);
    }
  }

  // Fixed schedule by day
  const scheduleLines: string[] = [];
  for (let day = 0; day < 7; day++) {
    const events = scheduleEvents.filter((e) => e.daysOfWeek.includes(day));
    if (events.length > 0) {
      const evLines = events
        .map((e) => `  - ${e.start}–${e.end} ${e.title}${e.location ? ` (${e.location})` : ''}`)
        .join('\n');
      scheduleLines.push(`${DAY_NAMES[day]}:\n${evLines}`);
    }
  }

  const sortedGoals = [...goals].sort((a, b) => a.priority - b.priority);
  const goalsText = sortedGoals
    .map(
      (g, i) =>
        `${i + 1}. [ID: ${g.id}] "${g.title}" — category: ${g.category}, ` +
        `target: ${g.weeklyHoursTarget}h/week, priority: ${g.priority}` +
        (g.deadline ? `, deadline: ${g.deadline}` : ''),
    )
    .join('\n');

  const activeRules = rules.filter((r) => r.enabled).map((r) => `- ${r.title}`).join('\n') || '- None';

  return `You are LifeOS, a personal productivity AI. Generate an optimal weekly study and skill session schedule.

USER PROFILE:
- Main focus: ${mainFocus || 'Not specified'}
- Available day window: ${minsToTime(DAY_START)}–${minsToTime(DAY_END)}${noScreens ? ' (no-screens rule active — hard limit at 21:00)' : ''}

GOALS (lower priority number = more important; schedule these first):
${goalsText}

FIXED SCHEDULE — these times are UNAVAILABLE:
${scheduleLines.length > 0 ? scheduleLines.join('\n') : 'No fixed events.'}

FREE TIME SLOTS — only schedule within these windows (respect them exactly):
${freeSlotsLines.join('\n')}

ACTIVE RULES & CONSTRAINTS:
${activeRules}

SCHEDULING INSTRUCTIONS:
1. Fill free time slots with focused sessions to hit each goal's weekly hour target.
2. Prioritise goals with lower priority numbers — give them the best (morning/long) slots.
3. Session length: 25–90 minutes. Prefer 50-min blocks for deep work; use 25-min only when little time remains in a slot.
4. Leave a minimum 5-minute gap between sessions on the same day.
5. Sessions MUST fit exactly inside the free slots — never overlap a fixed event.
6. Category guidance:
   - "study": mornings before 12:00 are best for retention.
   - "health": before 10:00 or after 18:00.
   - "skill": long afternoon blocks (12:00–18:00) for deep coding/practice.
   - "life": distribute flexibly.
7. Spread sessions across the whole week — do not concentrate everything on Monday/Tuesday.
8. If a goal's weekly target is already covered by the blocks you've emitted, skip it.

Respond with ONLY a valid JSON array — no markdown fences, no explanation, no text outside the JSON.
Each element must have exactly these fields:
{
  "dayOfWeek": <integer 0–6, 0 = Sunday>,
  "startTime": "<HH:MM>",
  "endTime": "<HH:MM>",
  "goalId": "<exact ID string from the goals list above>",
  "type": "<study | skill | rest>",
  "note": "<one short sentence explaining why this slot was chosen>"
}`;
}

// ─── Response parser / validator ──────────────────────────────────────────────

interface RawBlock {
  dayOfWeek: unknown;
  startTime: unknown;
  endTime: unknown;
  goalId: unknown;
  type: unknown;
  note?: unknown;
}

function isValidTime(t: unknown): t is string {
  return typeof t === 'string' && /^\d{2}:\d{2}$/.test(t);
}

function parsePlanBlocks(responseText: string, goals: Goal[]): PlanBlock[] {
  const goalIds = new Set(goals.map((g) => g.id));
  const validTypes: string[] = ['study', 'skill', 'rest'];

  // Strip markdown code fences if model added them
  const cleaned = responseText
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  let raw: RawBlock[];
  try {
    raw = JSON.parse(cleaned);
  } catch {
    throw new Error('AI returned invalid JSON. Please try again.');
  }

  if (!Array.isArray(raw)) {
    throw new Error('AI response was not a JSON array. Please try again.');
  }

  const blocks: PlanBlock[] = [];
  for (const r of raw) {
    if (
      typeof r.dayOfWeek !== 'number' ||
      r.dayOfWeek < 0 ||
      r.dayOfWeek > 6 ||
      !isValidTime(r.startTime) ||
      !isValidTime(r.endTime) ||
      r.startTime >= r.endTime ||
      typeof r.goalId !== 'string' ||
      !goalIds.has(r.goalId) ||
      typeof r.type !== 'string' ||
      !validTypes.includes(r.type)
    ) {
      continue; // Skip malformed items
    }

    blocks.push({
      id: generateId(),
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      type: r.type as PlanBlockType,
      goalId: r.goalId,
      note: typeof r.note === 'string' ? r.note.slice(0, 140) : undefined,
      focusMode: false,
      completed: false,
      createdAt: new Date().toISOString(),
    });
  }

  return blocks;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateAIWeeklyPlan(params: {
  goals: Goal[];
  scheduleEvents: ScheduleEvent[];
  rules: Rule[];
  apiKey: string;
  mainFocus?: string;
}): Promise<PlanBlock[]> {
  const { goals, scheduleEvents, rules, apiKey, mainFocus } = params;

  if (!goals.length) {
    throw new Error('Add at least one goal before generating an AI plan.');
  }

  const prompt = buildPrompt(goals, scheduleEvents, rules, mainFocus);

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system:
          'You are a scheduling assistant. Respond only with a valid JSON array and nothing else.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err: any) {
    throw new Error(`Network error: ${err?.message ?? 'Could not reach Anthropic API.'}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new Error('Invalid API key. Update it in Settings → AI Planner.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit hit. Wait a moment and try again.');
    }
    throw new Error(`API error ${response.status}: ${body.slice(0, 160)}`);
  }

  const data = await response.json();
  const text: string = data?.content?.[0]?.text ?? '';

  if (!text) {
    throw new Error('AI returned an empty response. Please try again.');
  }

  const blocks = parsePlanBlocks(text, goals);

  if (blocks.length === 0) {
    throw new Error('AI could not schedule any sessions. Check your goals and free time slots.');
  }

  return blocks;
}
