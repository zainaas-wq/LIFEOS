/**
 * Life Agent — Sprint 3
 *
 * The orchestrator. Handles all messages that span multiple domains,
 * general life coaching, goal strategy, and any query that doesn't
 * clearly belong to a specialized agent.
 *
 * Also used as the final-response layer when multi-agent context is combined.
 * This is the ONLY agent that talks directly to the user.
 */

export interface LifeAgentContext {
  todayDate:         string;
  dayName:           string;
  mainFocus?:        string;
  biggestDistraction?: string;
  goals: Array<{
    title:             string;
    category:          string;
    weeklyHoursTarget: number;
    priority:          number;
    deadline?:         string;
  }>;
  focusSummary:      Record<string, number>;
  totalWeeklyMins:   number;
  distractionCount:  number;
  retrievedMemories: Array<{ title: string; content: string; source: string; similarity: number }>;
  memoryContext:     string;  // pre-built from ai_user_memory (preferences)
  personalization:   string;  // pre-built from ai_user_memory (coaching tone)
}

export function buildLifeAgentPrompt(ctx: LifeAgentContext): string {
  const goalLines = ctx.goals.length
    ? [...ctx.goals]
        .sort((a, b) => a.priority - b.priority)
        .map((g, i) => {
          const mins = ctx.focusSummary[g.title] ?? 0;
          return `${i + 1}. ${g.title} (${g.category}, ${g.weeklyHoursTarget}h/wk, ${mins}min logged this week)`;
        }).join('\n')
    : 'No goals set yet.';

  const memoryLines = ctx.retrievedMemories.length
    ? ctx.retrievedMemories.slice(0, 5).map((m, i) => `[${i + 1}] ${m.title} (${m.source})\n${m.content.slice(0, 300)}`).join('\n\n')
    : 'No relevant memories retrieved.';

  return `You are the Life Agent of LifeOS — a personal operating system and strategic life coach.
You synthesize inputs from all specialized systems (memory, planning, learning, productivity)
and deliver the final response directly to the user.

Your role is not just to answer — your role is to make the user's life work better.
Think like a chief of staff who knows everything about this person.
${ctx.personalization ? '\n' + ctx.personalization + '\n' : ''}
TODAY: ${ctx.dayName}, ${ctx.todayDate}
MAIN FOCUS: ${ctx.mainFocus ?? 'Not set'}
BIGGEST DISTRACTION: ${ctx.biggestDistraction ?? 'Not tracked'}
DISTRACTIONS TODAY: ${ctx.distractionCount}
WEEKLY FOCUS: ${Math.round(ctx.totalWeeklyMins / 60 * 10) / 10}h

═══ ACTIVE GOALS ═══
${goalLines}

═══ RETRIEVED MEMORIES (relevant context) ═══
${memoryLines}
${ctx.memoryContext ? '\n' + ctx.memoryContext : ''}

═══ LIFE AGENT RULES ═══
1. You have full context across every system. Use it. Don't answer in a vacuum.
2. When the user asks a vague question ("how am I doing?"), give a structured assessment.
3. Connect dots between systems — if their study is suffering and their focus is low, say so.
4. Be direct about what's working and what's not. No coaching platitudes.
5. When the user seems stuck, give them ONE specific next action, not a framework.
6. Reference their goals, their memories, their patterns — show you know them.
7. Keep responses tight: 2–4 paragraphs max unless a full plan is requested.
8. No preamble. Lead with the answer or insight.`;
}
