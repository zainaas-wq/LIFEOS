/**
 * LocalAIClient — deterministic, offline planner agent.
 *
 * Understands a small set of intent keywords and responds with:
 *   - Structured plan (daily / weekly) when asked
 *   - Goal / rule / schedule summaries
 *   - Generic motivational guidance
 *
 * No network calls. Works in Expo Go without an API key.
 */

import type { AIClient, AIContext } from './AIClient';
import type { ChatMessage, Plan } from '../types';
import { generateSmartDailyPlan, generateSmartWeeklyPlan, parseFixedWindow } from './planningEngine';
import { rescheduleRemaining } from './adaptiveRescheduler';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function now(): string {
  return new Date().toISOString();
}

function makeMsg(content: string, plan?: Plan): ChatMessage {
  return { id: uid(), role: 'assistant', content, createdAt: now(), plan };
}

// ─── Intent matching ──────────────────────────────────────────────────────────

type Intent =
  | 'daily_plan'
  | 'weekly_plan'
  | 'recover_day'
  | 'reduce_distraction'
  | 'improve_progress'
  | 'list_goals'
  | 'list_rules'
  | 'free_time'
  | 'schedule_summary'
  | 'focus_start'
  | 'help'
  | 'unknown';

function detectIntent(msg: string): Intent {
  const m = msg.toLowerCase();

  if (/\b(recover|missed.*tasks?|reschedule|get back on track)\b/.test(m))
    return 'recover_day';
  if (/\b(distract|can('t)? focus|keep.*distract|anti.distract)\b/.test(m))
    return 'reduce_distraction';
  if (/\b(behind|progress|prioriti[sz]e|which goal|improve.*progress)\b/.test(m))
    return 'improve_progress';
  if (/\b(daily plan|plan (for )?today|today('s)? plan|generate.*day|build.*day)\b/.test(m))
    return 'daily_plan';
  if (/\b(weekly plan|plan (for )?the week|this week|generate.*week|rebuild.*week)\b/.test(m))
    return 'weekly_plan';
  if (/\b(goals?|what (am i|should i) work(ing)? on|objectives?)\b/.test(m))
    return 'list_goals';
  if (/\b(rules?|habits?|constraints?|restrictions?)\b/.test(m))
    return 'list_rules';
  if (/\b(free time|available|when am i free|open slots?)\b/.test(m))
    return 'free_time';
  if (/\b(schedule|calendar|events?|what do i have)\b/.test(m))
    return 'schedule_summary';
  if (/\b(start focus|focus (session|mode|now)|let('s)? focus)\b/.test(m))
    return 'focus_start';
  if (/\b(help|what can you|commands?|options?)\b/.test(m))
    return 'help';

  return 'unknown';
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Response handlers ────────────────────────────────────────────────────────

function computeProgressLines(plan: Plan, goals: AIContext['goals']): string {
  const goalMins: Record<string, number> = {};
  for (const item of plan.items) {
    if (item.goalId && item.type !== 'break' && item.type !== 'event') {
      const [sh, sm] = item.startTime.split(':').map(Number);
      const [eh, em] = item.endTime.split(':').map(Number);
      goalMins[item.goalId] = (goalMins[item.goalId] ?? 0) + (eh * 60 + em - (sh * 60 + sm));
    }
  }
  const lines: string[] = [];
  for (const g of goals.sort((a, b) => a.priority - b.priority)) {
    const scheduled = goalMins[g.id] ?? 0;
    if (scheduled === 0) continue;
    const dailyTargetMins = (g.weeklyHoursTarget * 60) / 5;
    const pct = Math.min(Math.round((scheduled / Math.max(dailyTargetMins, 1)) * 100), 100);
    lines.push(`• **${g.title}** → +${pct}%  (${scheduled} min scheduled)`);
  }
  return lines.length ? lines.join('\n') : '• No goal sessions scheduled today.';
}

const REFLECTIONS = [
  'Which task required the most willpower to start — and why?',
  'Did you protect your deep work blocks, or let them get interrupted?',
  'What single thing, if done tomorrow, would make the biggest difference?',
  'Rate your focus today 1–10. What would make it a 10 tomorrow?',
  'Which goal felt neglected today? How can we fix that tomorrow?',
];

function pickReflection(ctx: AIContext): string {
  const seed = ctx.todayDate.charCodeAt(ctx.todayDate.length - 1);
  return REFLECTIONS[seed % REFLECTIONS.length];
}

function respondRecoverDay(ctx: AIContext): ChatMessage {
  if (!ctx.currentPlan) {
    return makeMsg(
      "No plan found for today. Generate a daily plan first (tap **Build my day**), then ask me to recover it.",
    );
  }
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const rescheduled = rescheduleRemaining(
    ctx.currentPlan, currentTime, ctx.goals, ctx.scheduleEvents, ctx.rules, ctx.todayDate,
  );
  const remaining = rescheduled.items.filter(
    (i) => !i.completed && i.type !== 'break' && i.type !== 'event',
  ).length;
  return makeMsg(
    `**Rescheduled ${remaining} remaining task${remaining !== 1 ? 's' : ''}** into your free time.\n\n` +
      `The critical item is prioritised first. Focus on what still matters most today — progress over perfection.`,
    rescheduled,
  );
}

function respondReduceDistraction(ctx: AIContext): ChatMessage {
  const distraction = ctx.biggestDistraction ?? 'distractions';
  return makeMsg(
    `**Anti-distraction strategy for "${distraction}":**\n\n` +
      `1. **Block the source** — Set app limits or remove triggers before each focus block.\n` +
      `2. **Add friction** — Use a 5-second pause rule before giving in; the urge usually passes.\n` +
      `3. **Replace the urge** — The moment you feel the pull, immediately start your next 5-min task. Action beats avoidance every time.`,
  );
}

function respondImproveProgress(ctx: AIContext): ChatMessage {
  if (!ctx.goals.length) {
    return makeMsg('No goals found. Add goals in the **Goals** tab to get a progress analysis.');
  }

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekStartStr = weekStart.toISOString().split('T')[0];

  const lines = [...ctx.goals]
    .sort((a, b) => a.priority - b.priority)
    .map((g) => {
      const weeklyTargetMins = g.weeklyHoursTarget * 60;
      const daysPassed = Math.max(1, today.getDay() || 7);
      const expectedMins = Math.round((weeklyTargetMins / 7) * daysPassed);

      const scheduledMins = (ctx.focusSessions ?? [])
        .filter((s) => s.goalId === g.id && s.start >= weekStartStr)
        .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);

      const pct = expectedMins > 0 ? Math.round((scheduledMins / expectedMins) * 100) : 0;
      const status = pct >= 80 ? '✓ on track' : pct >= 50 ? '~ close' : '⚠ behind';
      return `• **${g.title}**: ${scheduledMins}/${expectedMins} min this week (${pct}%) — ${status}`;
    });

  const behindGoal = [...ctx.goals]
    .sort((a, b) => a.priority - b.priority)
    .find((g) => {
      const weeklyTargetMins = g.weeklyHoursTarget * 60;
      const daysPassed = Math.max(1, today.getDay() || 7);
      const expectedMins = Math.round((weeklyTargetMins / 7) * daysPassed);
      const scheduledMins = (ctx.focusSessions ?? [])
        .filter((s) => s.goalId === g.id && s.start >= weekStartStr)
        .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
      return scheduledMins < expectedMins * 0.8;
    });

  const advice = behindGoal
    ? `\n\n**Prioritise today**: "${behindGoal.title}" needs the most catch-up time.`
    : '\n\nAll goals are on track. Keep the momentum going.';

  return makeMsg(`**Weekly progress check:**\n\n${lines.join('\n')}${advice}`);
}

function respondDailyPlan(ctx: AIContext): ChatMessage {
  if (!ctx.goals.length) {
    return makeMsg(
      "You don't have any goals set yet. Head to the **Goals** tab to add some, then ask me to generate your plan.",
    );
  }
  const { fixedStart, fixedEnd } = parseFixedWindow(ctx.fixedScheduleStart, ctx.fixedScheduleEnd);
  const plan = generateSmartDailyPlan(
    ctx.goals, ctx.scheduleEvents, ctx.skillPlans, ctx.rules, ctx.todayDate, fixedStart, fixedEnd,
  );
  const count = plan.items.filter((i) => i.type !== 'break' && i.type !== 'event').length;
  const progressLines = computeProgressLines(plan, ctx.goals);
  const reflection = pickReflection(ctx);
  return makeMsg(
    `**${count} work sessions** planned across your free time.\n\n` +
    `Progress Impact:\n${progressLines}\n\n` +
    `Reflection (end of day):\n"${reflection}"`,
    plan,
  );
}

function respondWeeklyPlan(ctx: AIContext): ChatMessage {
  if (!ctx.goals.length) {
    return makeMsg(
      "Add your goals in the **Goals** tab first, then I can build a full week plan.",
    );
  }
  const { fixedStart, fixedEnd } = parseFixedWindow(ctx.fixedScheduleStart, ctx.fixedScheduleEnd);
  const plan = generateSmartWeeklyPlan(
    ctx.goals, ctx.scheduleEvents, ctx.skillPlans, ctx.rules, ctx.todayDate, fixedStart, fixedEnd,
  );
  const total = plan.items.filter((i) => i.type !== 'break' && i.type !== 'event').length;
  const hours = Math.round(
    plan.items.reduce((s, i) => {
      const [sh, sm] = i.startTime.split(':').map(Number);
      const [eh, em] = i.endTime.split(':').map(Number);
      return s + (eh * 60 + em - (sh * 60 + sm));
    }, 0) / 60,
  );
  const reflection = pickReflection(ctx);
  return makeMsg(
    `**${total} sessions** across 7 days (~${hours}h total). Head to the **Planner** tab to review.\n\n` +
    `Strategy: highest-priority goals get your peak morning slots. Adjust in the Planner if life changes.\n\n` +
    `End-of-week question:\n"${reflection}"`,
    plan,
  );
}

function respondListGoals(ctx: AIContext): ChatMessage {
  if (!ctx.goals.length) {
    return makeMsg("No goals yet. Tap the **Goals** tab to add your first one.");
  }
  const sorted = [...ctx.goals].sort((a, b) => a.priority - b.priority);
  const lines = sorted.map(
    (g, i) =>
      `${i + 1}. **${g.title}** (${g.category}, ${g.weeklyHoursTarget}h/wk, priority ${g.priority})`,
  );
  return makeMsg(`Your current goals:\n\n${lines.join('\n')}\n\nWant me to generate a plan around these?`);
}

function respondListRules(ctx: AIContext): ChatMessage {
  const active = ctx.rules.filter((r) => r.enabled);
  if (!active.length) {
    return makeMsg("No active rules. Go to the **Rules** tab to set your daily standards.");
  }
  const lines = active.map((r) => `• **${r.title}**${r.startTime ? ` (${r.startTime}–${r.endTime ?? '??:??'})` : ''}`);
  return makeMsg(`Active rules:\n\n${lines.join('\n')}\n\nStay consistent. Your rules exist for a reason.`);
}

function respondFreeTime(ctx: AIContext): ChatMessage {
  const { extractFreeTime, minsToTime } = require('./planGenerator');
  const today = new Date(ctx.todayDate);
  const dow = today.getDay();
  const slots = extractFreeTime(ctx.scheduleEvents, ctx.rules, dow) as Array<{ start: number; end: number }>;

  if (!slots.length) {
    return makeMsg(`No free time found today (${DAY_NAMES[dow]}). Your schedule is fully blocked or the day window is closed.`);
  }

  const lines = slots.map(
    (s) => `• ${minsToTime(s.start)} – ${minsToTime(s.end)} (${s.end - s.start} min)`,
  );
  return makeMsg(`Free time today (${DAY_NAMES[dow]}):\n\n${lines.join('\n')}\n\nShall I fill these with focused work sessions?`);
}

function respondSchedule(ctx: AIContext): ChatMessage {
  if (!ctx.scheduleEvents.length) {
    return makeMsg("No scheduled events. Add them in the **Schedule** tab so I can plan around them.");
  }
  const today = new Date(ctx.todayDate);
  const dow = today.getDay();
  const todayEvents = ctx.scheduleEvents.filter((e) => e.daysOfWeek.includes(dow));

  if (!todayEvents.length) {
    return makeMsg(`Nothing in your schedule for ${DAY_NAMES[dow]} — it's all free time. Want me to generate a plan?`);
  }

  const sorted = [...todayEvents].sort((a, b) => a.start.localeCompare(b.start));
  const lines = sorted.map((e) => `• ${e.start}–${e.end} **${e.title}**${e.location ? ` @ ${e.location}` : ''}`);
  return makeMsg(`${DAY_NAMES[dow]}'s schedule:\n\n${lines.join('\n')}\n\nWant me to plan your free time around this?`);
}

function respondHelp(): ChatMessage {
  return makeMsg(
    `I'm your LifeOS planner AI. Here's what you can ask me:\n\n` +
      `• **"Generate daily plan"** — plan today around your schedule\n` +
      `• **"Generate weekly plan"** — full 7-day goal schedule\n` +
      `• **"What are my goals?"** — list your current goals\n` +
      `• **"Show my rules"** — see active daily rules\n` +
      `• **"When am I free?"** — see today's free time slots\n` +
      `• **"What's on my schedule?"** — see today's events\n\n` +
      `The Planner tab also lets you generate plans with one tap.`,
  );
}

function respondUnknown(msg: string, ctx: AIContext): ChatMessage {
  const focus = ctx.mainFocus ? `Your main focus is **${ctx.mainFocus}**.` : '';
  const goalCount = ctx.goals.length;
  return makeMsg(
    `${focus ? focus + ' ' : ''}You have ${goalCount} goal${goalCount !== 1 ? 's' : ''} set. ` +
      `Try asking me to *"generate your daily plan"* or *"show free time"* to get started. Type "help" for all options.`,
  );
}

// ─── LocalAIClient ────────────────────────────────────────────────────────────

export class LocalAIClient implements AIClient {
  async chat(
    userMessage: string,
    _history: ChatMessage[],
    context: AIContext,
  ): Promise<ChatMessage> {
    // Simulate slight processing delay for a more natural feel
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));

    const intent = detectIntent(userMessage);

    switch (intent) {
      case 'recover_day':        return respondRecoverDay(context);
      case 'reduce_distraction': return respondReduceDistraction(context);
      case 'improve_progress':   return respondImproveProgress(context);
      case 'daily_plan':         return respondDailyPlan(context);
      case 'weekly_plan':        return respondWeeklyPlan(context);
      case 'list_goals':         return respondListGoals(context);
      case 'list_rules':         return respondListRules(context);
      case 'free_time':          return respondFreeTime(context);
      case 'schedule_summary':   return respondSchedule(context);
      case 'help':               return respondHelp();
      default:                   return respondUnknown(userMessage, context);
    }
  }

  async generateDailyPlan(date: string, context: AIContext): Promise<Plan> {
    const { fixedStart, fixedEnd } = parseFixedWindow(context.fixedScheduleStart, context.fixedScheduleEnd);
    return generateSmartDailyPlan(
      context.goals, context.scheduleEvents, context.skillPlans, context.rules, date, fixedStart, fixedEnd,
    );
  }

  async generateWeeklyPlan(startDate: string, context: AIContext): Promise<Plan> {
    const { fixedStart, fixedEnd } = parseFixedWindow(context.fixedScheduleStart, context.fixedScheduleEnd);
    return generateSmartWeeklyPlan(
      context.goals, context.scheduleEvents, context.skillPlans, context.rules, startDate, fixedStart, fixedEnd,
    );
  }
}
