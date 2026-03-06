import type { AIClient, AIContext } from './AIClient';
import type { ChatMessage, Plan } from '../types';
import {
  generateDailyPlanItems,
  generateWeeklyPlanItems,
  extractFreeTime,
  minsToTime,
} from './planGenerator';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function energyLabel(startMin: number): string {
  const h = Math.floor(startMin / 60);
  if (h < 12) return 'HIGH — deep work recommended';
  if (h < 17) return 'MEDIUM — practice & review';
  return 'LOW — light tasks & reflection';
}

function buildSystemPrompt(ctx: AIContext): string {
  const today = new Date(ctx.todayDate);
  const dow = today.getDay();

  // Goals
  const goalLines = ctx.goals.length
    ? ctx.goals
        .sort((a, b) => a.priority - b.priority)
        .map(
          (g, i) =>
            `${i + 1}. ${g.title} (${g.category}, ${g.weeklyHoursTarget}h/week, priority ${g.priority})`,
        )
        .join('\n')
    : 'None set yet — tell the user to add goals first.';

  // Fixed schedule today
  const todayEvents = ctx.scheduleEvents
    .filter((e) => e.daysOfWeek.includes(dow))
    .sort((a, b) => a.start.localeCompare(b.start));
  const scheduleLines = todayEvents.length
    ? todayEvents
        .map((e) => `• ${e.start}–${e.end}  ${e.title}${e.location ? ` @ ${e.location}` : ''}`)
        .join('\n')
    : '• No fixed events today — full day available.';

  // Free time blocks with energy levels
  const freeSlots = extractFreeTime(ctx.scheduleEvents, ctx.rules, dow);
  const freeLines = freeSlots.length
    ? freeSlots
        .map((s) => {
          const mins = s.end - s.start;
          const taskHint = mins < 30 ? 'light task only' : mins >= 45 ? 'deep work eligible' : 'short practice';
          return `• ${minsToTime(s.start)}–${minsToTime(s.end)} (${mins} min) · ${energyLabel(s.start)} · ${taskHint}`;
        })
        .join('\n')
    : '• No free time detected — schedule may be fully blocked.';

  // Active rules
  const ruleLines = ctx.rules
    .filter((r) => r.enabled)
    .map((r) => `• ${r.title}${r.startTime ? ` (${r.startTime}–${r.endTime ?? '??:??'})` : ''}`)
    .join('\n') || '• None configured.';

  return `You are the planning engine of LifeOS — an AI-powered personal operating system.
Your role is personal strategist, not a simple scheduler. Think about energy, priorities, and human limits.

TODAY: ${DAY_NAMES[dow]}, ${ctx.todayDate}
MAIN FOCUS: ${ctx.mainFocus || 'Not specified'}

═══ USER GOALS (ranked by priority) ═══
${goalLines}

═══ FIXED SCHEDULE TODAY ═══
${scheduleLines}

═══ AVAILABLE FREE TIME ═══
${freeLines}

═══ ENERGY PATTERN ═══
• 06:00–12:00 → HIGH focus (deep work, hard problems, new material)
• 12:00–17:00 → MEDIUM (practice, review, light meetings)
• 17:00–22:00 → LOW (light reading, reflection, admin)

═══ ACTIVE RULES & CONSTRAINTS ═══
${ruleLines}

═══ PLANNING RULES ═══
1. Never stack tasks back-to-back — insert 10–15 min breaks between deep work blocks.
2. Prioritize the highest-priority goals in the earliest high-energy free slots.
3. Free blocks < 30 min → assign light tasks (review, reading) only.
4. Free blocks ≥ 45 min → assign focused 45–90 min deep work sessions.
5. Balance the day: deep work / light tasks / breaks / reflection.
6. End every day plan with a reflection block.
7. Do not overload — an ambitious but realistic plan beats an impossible one.
8. If the user missed tasks, reschedule intelligently without punishment.

═══ OUTPUT FORMAT FOR DAILY PLAN ═══
Use EXACTLY this structure — no preamble, no extra commentary outside the format:

Daily Plan — [Day], [Date]:
• HH:MM–HH:MM  Deep Work: [Task]
• HH:MM–HH:MM  Break
• HH:MM–HH:MM  Practice: [Task]
• HH:MM–HH:MM  Light: [Task]
• HH:MM–HH:MM  Reflection

Progress Impact:
• Goal: [Goal name] → +X%  ([one-line reason])

Reflection Suggestion:
[One focused question to ask the user at end of day to improve tomorrow's plan]

For non-plan questions, reply concisely (≤ 3 short paragraphs). No preamble.`;
}

function isPlanRequest(msg: string): boolean {
  return /\b(daily plan|plan (for )?today|today.s plan|generate.*day|plan my day)\b/i.test(msg);
}

function isWeeklyPlanRequest(msg: string): boolean {
  return /\b(weekly plan|plan (for )?the week|this week|generate.*week)\b/i.test(msg);
}

export class RemoteAIClient implements AIClient {
  constructor(private readonly apiKey: string) {}

  async chat(
    userMessage: string,
    history: ChatMessage[],
    context: AIContext,
  ): Promise<ChatMessage> {
    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userMessage },
    ];

    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(context),
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 401) throw new Error('Invalid API key.');
      if (response.status === 429) throw new Error('Rate limit reached.');
      throw new Error(`API error ${response.status}: ${body.slice(0, 100)}`);
    }

    const data = await response.json();
    const text: string = data?.content?.[0]?.text ?? '';

    // Attach a structured plan card alongside Claude's strategic text
    let plan: Plan | undefined;
    if (isPlanRequest(userMessage)) {
      plan = generateDailyPlanItems(
        context.goals, context.scheduleEvents, context.skillPlans, context.rules, context.todayDate,
      );
    } else if (isWeeklyPlanRequest(userMessage)) {
      plan = generateWeeklyPlanItems(
        context.goals, context.scheduleEvents, context.skillPlans, context.rules, context.todayDate,
      );
    }

    return {
      id: uid(),
      role: 'assistant',
      content: text || '(empty response)',
      createdAt: new Date().toISOString(),
      plan,
    };
  }

  async generateDailyPlan(date: string, context: AIContext): Promise<Plan> {
    return generateDailyPlanItems(
      context.goals, context.scheduleEvents, context.skillPlans, context.rules, date,
    );
  }

  async generateWeeklyPlan(startDate: string, context: AIContext): Promise<Plan> {
    return generateWeeklyPlanItems(
      context.goals, context.scheduleEvents, context.skillPlans, context.rules, startDate,
    );
  }
}
