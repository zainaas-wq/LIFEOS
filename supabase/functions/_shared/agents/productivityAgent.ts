/**
 * Productivity Agent — Sprint 3
 *
 * Specializes in: focus optimization, distraction elimination, energy management,
 * habit reinforcement, and recovery from off-days.
 *
 * Context: focus session history, distraction logs, rules (habits/boundaries), energy profile.
 */

export interface RuleItem {
  title:     string;
  type:      string;
  enabled:   boolean;
  startTime?: string;
  endTime?:  string;
  followedToday?: boolean;
}

export interface ProductivityAgentContext {
  todayDate:        string;
  energyStyle?:     string;
  workStyle?:       string;
  mainFocus?:       string;
  biggestDistraction?: string;
  distractionCount: number;
  focusMinsByDay:   Record<string, number>; // YYYY-MM-DD → minutes
  totalWeeklyMins:  number;
  currentStreak:    number;                 // consecutive focus days
  rules:            RuleItem[];
  retrievedMemories: Array<{ title: string; content: string; similarity: number }>;
}

function describeEnergyStyle(style?: string): string {
  const map: Record<string, string> = {
    morning:   'Peak energy 6–11 AM. Deep work should start before 9 AM.',
    afternoon: 'Peak energy 12–5 PM. Best sessions start after lunch.',
    evening:   'Peak energy 5–9 PM. Most productive after dinner.',
    night:     'Peak energy 9 PM–1 AM. Productive during quiet hours.',
    flexible:  'No consistent peak. Track energy day-by-day.',
  };
  return map[style ?? ''] ?? 'Energy pattern: not specified.';
}

function describeWorkStyle(style?: string): string {
  const map: Record<string, string> = {
    deep:         'Prefers 60–90 min deep work sessions.',
    balanced:     'Prefers 45 min sessions with short breaks.',
    'short-bursts': 'Prefers 20–25 min Pomodoro-style sessions.',
  };
  return map[style ?? ''] ?? 'Work style: not specified.';
}

export function buildProductivityAgentPrompt(ctx: ProductivityAgentContext): string {
  const ruleLines = ctx.rules.filter((r) => r.enabled).length
    ? ctx.rules
        .filter((r) => r.enabled)
        .map((r) => {
          const window = r.startTime && r.endTime ? ` (${r.startTime}–${r.endTime})` : '';
          const status = r.followedToday !== undefined
            ? (r.followedToday ? ' ✓ followed today' : ' ✗ not followed today')
            : '';
          return `• ${r.title}${window}${status}`;
        })
        .join('\n')
    : '• No active rules.';

  const recentFocusLines = Object.entries(ctx.focusMinsByDay)
    .slice(-7)
    .map(([date, mins]) => `• ${date}: ${mins} min`)
    .join('\n') || '• No focus sessions recently.';

  const memoryLines = ctx.retrievedMemories.length
    ? ctx.retrievedMemories.slice(0, 3).map((m) => `• ${m.title}: ${m.content.slice(0, 200)}`).join('\n')
    : '• No relevant patterns found in memory.';

  const streakMsg = ctx.currentStreak > 0
    ? `${ctx.currentStreak} day${ctx.currentStreak > 1 ? 's' : ''} (maintain it)`
    : 'No active streak';

  return `You are the Productivity Agent of LifeOS — an expert in focus, flow states, and discipline systems.
Your role: help the user understand why their productivity is failing and give them a precise fix.

TODAY: ${ctx.todayDate}
ENERGY STYLE: ${describeEnergyStyle(ctx.energyStyle)}
WORK STYLE: ${describeWorkStyle(ctx.workStyle)}
MAIN FOCUS: ${ctx.mainFocus ?? 'Not set'}
BIGGEST DISTRACTION: ${ctx.biggestDistraction ?? 'Not tracked'}

═══ TODAY'S STATUS ═══
• Distractions logged: ${ctx.distractionCount}
• Weekly focus: ${ctx.totalWeeklyMins} minutes total
• Current streak: ${streakMsg}

═══ RECENT FOCUS HISTORY (last 7 days) ═══
${recentFocusLines}

═══ ACTIVE RULES & HABITS ═══
${ruleLines}

═══ RELEVANT PATTERNS FROM MEMORY ═══
${memoryLines}

═══ PRODUCTIVITY RULES ═══
1. Diagnose before prescribing. Identify the root cause of the focus problem.
2. Give one specific, immediate action — not a list of ten things.
3. For distraction recovery: name the distraction pattern, then give a concrete re-entry strategy.
4. Reference the user's own rules and habits when they're relevant — they chose them.
5. Streak preservation is a powerful motivator — acknowledge it if it's active.
6. Never recommend generic "turn off your phone" advice. Be specific to their context.
7. If their patterns show consistent failure at a specific time of day, flag it.`;
}
