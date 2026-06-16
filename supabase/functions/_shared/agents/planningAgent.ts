/**
 * Planning Agent — Sprint 3
 *
 * Specializes in: daily/weekly planning, schedule optimization, deadline management,
 * goal prioritization, and time-block recommendations.
 *
 * Context: goals + deadlines, schedule, goal intelligence (risk), today's plan.
 */

export interface GoalIntelItem {
  probability:     number;
  riskLevel:       string;
  riskReason:      string;
  weeklyHoursLogged: number;
}

export interface PlanningAgentContext {
  todayDate:          string;
  dayName:            string;
  fixedStart:         string;
  fixedEnd:           string;
  goals: Array<{
    title:             string;
    category:          string;
    weeklyHoursTarget: number;
    priority:          number;
    deadline?:         string;
  }>;
  schedule: Array<{ title: string; start: string; end: string; location?: string }>;
  focusSummary:       Record<string, number>;
  totalWeeklyMins:    number;
  todayPlan?: Array<{ startTime: string; endTime: string; title: string; completed: boolean }>;
  goalIntelligence:   Record<string, GoalIntelItem>;
  mainFocus?:         string;
}

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export function buildPlanningAgentPrompt(ctx: PlanningAgentContext): string {
  const atRiskGoals = Object.entries(ctx.goalIntelligence)
    .filter(([, intel]) => intel.riskLevel === 'critical' || intel.riskLevel === 'at-risk')
    .map(([id, intel]) => {
      const g = ctx.goals.find((g) => g.title === id) ?? { title: id };
      return `• ${g.title}: ${intel.riskLevel.toUpperCase()} (${intel.probability}% probability) — ${intel.riskReason}`;
    })
    .join('\n');

  const goalLines = ctx.goals.length
    ? [...ctx.goals]
        .sort((a, b) => a.priority - b.priority)
        .map((g, i) => {
          const weeklyMins = ctx.focusSummary[g.title] ?? 0;
          const targetMins = g.weeklyHoursTarget * 60;
          const pct = targetMins > 0 ? Math.round((weeklyMins / targetMins) * 100) : 0;
          const daysLeft = g.deadline
            ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86_400_000)
            : null;
          return `${i + 1}. ${g.title} (${g.category}, ${g.weeklyHoursTarget}h/wk target, ${pct}% logged this week${daysLeft !== null ? `, ${daysLeft}d until deadline` : ''})`;
        })
        .join('\n')
    : 'No goals set.';

  const scheduleLines = ctx.schedule.length
    ? ctx.schedule.map((e) => `• ${e.start}–${e.end}  ${e.title}${e.location ? ` @ ${e.location}` : ''}`).join('\n')
    : '• No fixed events today.';

  const planLines = ctx.todayPlan?.length
    ? ctx.todayPlan.map((i) => `• ${i.startTime}–${i.endTime}  ${i.title}${i.completed ? ' ✓' : ''}`).join('\n')
    : '• No plan generated yet.';

  return `You are the Planning Agent of LifeOS — an expert in personal time architecture.
Your role: help the user allocate time intelligently across their goals and constraints.

TODAY: ${ctx.dayName}, ${ctx.todayDate}
PLANNING WINDOW: ${ctx.fixedStart}–${ctx.fixedEnd}
MAIN FOCUS: ${ctx.mainFocus ?? 'Not specified'}

═══ GOALS (ranked by priority) ═══
${goalLines}

═══ GOALS AT RISK ═══
${atRiskGoals || '• All goals on track.'}

═══ TODAY\'S SCHEDULE ═══
${scheduleLines}

═══ TODAY\'S CURRENT PLAN ═══
${planLines}

═══ FOCUS THIS WEEK ═══
Total: ${Math.round(ctx.totalWeeklyMins / 60 * 10) / 10}h logged
${Object.entries(ctx.focusSummary).map(([k, v]) => `• ${k}: ${v} min`).join('\n') || '• No sessions yet.'}

═══ ENERGY PATTERN ═══
• 06:00–12:00 → HIGH focus (deep work, hard problems)
• 12:00–17:00 → MEDIUM (practice, review)
• 17:00–22:00 → LOW (light tasks, reflection)

═══ PLANNING RULES ═══
1. Always schedule highest-priority at-risk goals in the next available HIGH-energy slot.
2. Never stack deep work back-to-back — require 10–15 min breaks.
3. Blocks < 30 min → light tasks only. Blocks ≥ 45 min → eligible for deep work.
4. When the user asks to recover/reschedule — be pragmatic, no guilt.
5. Keep plans realistic — better to do 3 things well than list 8 that won't happen.
6. Lead with time-blocked recommendations, not generic advice.`;
}
