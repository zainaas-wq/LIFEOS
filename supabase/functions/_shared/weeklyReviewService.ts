/**
 * _shared/weeklyReviewService.ts — Weekly Review data gathering and prompt building.
 *
 * Shared Deno module.  Imported via relative path:
 *   import { ... } from '../_shared/weeklyReviewService.ts';
 *
 * Responsibilities:
 *   1. WeeklyReviewData — structured data gathered from Supabase for the review
 *   2. gatherWeeklyData() — two fail-open DB queries (plan items + distractions)
 *   3. buildWeeklyReviewSystemPrompt() — produces a complete, standalone system
 *      prompt for the weekly review action; entirely separate from buildSystemPrompt
 *
 * Data contract:
 *   - Plan item data is queried server-side (not available client-side for past days).
 *   - Focus time (weeklyMinsByGoal, totalWeeklyMins) comes from the client-supplied
 *     ChatContext.focusSummary — consistent with the existing daily coaching prompt.
 *   - Distraction count is a simple COUNT query.
 *   - All queries are fail-open: errors produce neutral defaults (null / 0).
 *
 * Prompt contract:
 *   - System prompt is complete and self-contained — the user message ("review my week")
 *     is only a trigger; the AI does not need to ask clarifying questions.
 *   - Output format is directive: 4 sections, word limits, no preamble.
 *   - Sparse data is handled gracefully with explicit fallback text.
 *   - Target token budget: ≤ 500 tokens for system prompt (leaves 524 tokens for response
 *     at MAX_TOKENS = 1024).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Plan execution statistics for the review week. */
export interface WeeklyPlanStats {
  /** Total non-break plan items across all plans in the week. */
  totalItems:     number;
  /** Non-break items marked completed. */
  completedItems: number;
  /** Integer 0–100. */
  completionRate: number;
  /** Up to 5 incomplete non-break items, work-type first (goal, skill). */
  missedTitles:   string[];
}

/** All data gathered server-side for the weekly review prompt. */
export interface WeeklyReviewData {
  weekStart:        string;   // YYYY-MM-DD — todayDate minus 6 days
  weekEnd:          string;   // YYYY-MM-DD — todayDate (inclusive)
  /** null when no plan data found or query failed. */
  planStats:        WeeklyPlanStats | null;
  distractionCount: number;
}

// ─── ChatContext subset (matches ai-chat index.ts ChatContext) ────────────────
// Declared locally to avoid circular imports — only the fields we actually use.

interface TrackItem {
  title:             string;
  category:          string;
  weeklyHoursTarget: number;
  priority:          number;
}

interface ReviewChatContext {
  todayDate:          string;
  mainFocus?:         string;
  biggestDistraction?: string;
  tracks:             TrackItem[];
  focusSummary: {
    weeklyMinsByGoal: Record<string, number>;
    totalWeeklyMins:  number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max missed-item titles shown in the prompt — keeps it compact. */
const MAX_MISSED_TITLES = 5;

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Returns { weekStart, weekEnd } for a 7-day window ending on todayDate. */
function getWeekBounds(todayDate: string): { weekStart: string; weekEnd: string } {
  const end   = new Date(todayDate + 'T00:00:00Z');
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd:   todayDate,
  };
}

// ─── Database helpers ─────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type AdminClient = any;

/**
 * Gathers plan execution stats and distraction count for the review week.
 *
 * Two DB queries:
 *   1. daily_plans JOIN daily_plan_items for the 7-day window.
 *   2. COUNT from distraction_logs for the same window.
 *
 * Both queries are fail-open:
 *   - Query 1 failure  → planStats = null (prompt shows "No plan data")
 *   - Query 2 failure  → distractionCount = 0
 *   - null adminClient → returns neutral defaults immediately
 */
export async function gatherWeeklyData(
  adminClient: AdminClient,
  userId:      string,
  todayDate:   string,
): Promise<WeeklyReviewData> {
  const { weekStart, weekEnd } = getWeekBounds(todayDate);

  if (!adminClient) {
    return { weekStart, weekEnd, planStats: null, distractionCount: 0 };
  }

  // ── Queries 1 & 2 in parallel — both are independent ─────────────────────
  // Query 1: plan items for the 7-day window via PostgREST resource embedding.
  // Query 2: distraction count for the same window.
  const [plansSettled, distSettled] = await Promise.allSettled([
    adminClient
      .from('daily_plans')
      .select('date, daily_plan_items(title, type, completed, is_critical)')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', weekEnd),
    adminClient
      .from('distraction_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('timestamp', weekStart),
  ]);

  let planStats: WeeklyPlanStats | null = null;
  if (plansSettled.status === 'fulfilled') {
    const { data: plans, error: plansErr } = plansSettled.value;
    if (plansErr) {
      console.error('[weeklyReviewService] plans query failed:', plansErr.message);
    } else if (plans && (plans as PlanDay[]).length > 0) {
      planStats = aggregatePlanStats(plans as PlanDay[]);
    }
  } else {
    const err = plansSettled.reason;
    console.error(
      '[weeklyReviewService] gatherWeeklyData plans threw:',
      err instanceof Error ? err.message : String(err),
    );
  }

  let distractionCount = 0;
  if (distSettled.status === 'fulfilled') {
    const { count, error: distErr } = distSettled.value;
    if (distErr) {
      console.error('[weeklyReviewService] distractions query failed:', distErr.message);
    } else {
      distractionCount = count ?? 0;
    }
  } else {
    const err = distSettled.reason;
    console.error(
      '[weeklyReviewService] gatherWeeklyData distractions threw:',
      err instanceof Error ? err.message : String(err),
    );
  }

  return { weekStart, weekEnd, planStats, distractionCount };
}

// ─── Internal aggregation ─────────────────────────────────────────────────────

interface PlanItemRow {
  title:       string;
  type:        string;
  completed:   boolean;
  is_critical: boolean;
}

interface PlanDay {
  date:             string;
  daily_plan_items: PlanItemRow[];
}

/**
 * Aggregates raw plan rows into WeeklyPlanStats.
 * Excludes 'break' and 'free' items — these are structural, not work commitments.
 * Prioritises 'goal' and 'skill' items first in the missedTitles list.
 */
function aggregatePlanStats(plans: PlanDay[]): WeeklyPlanStats {
  const workItems: PlanItemRow[] = [];

  for (const plan of plans) {
    for (const item of (plan.daily_plan_items ?? [])) {
      if (item.type !== 'break' && item.type !== 'free') {
        workItems.push(item);
      }
    }
  }

  const totalItems     = workItems.length;
  const completedItems = workItems.filter((i) => i.completed).length;
  const completionRate = totalItems > 0
    ? Math.round((completedItems / totalItems) * 100)
    : 0;

  // Missed items: incomplete, work-type first (goal/skill), then others
  const missed = workItems.filter((i) => !i.completed);
  const priorityMissed = [
    ...missed.filter((i) => i.type === 'goal' || i.type === 'skill'),
    ...missed.filter((i) => i.type !== 'goal' && i.type !== 'skill'),
  ];
  const missedTitles = priorityMissed.slice(0, MAX_MISSED_TITLES).map((i) => i.title);

  return { totalItems, completedItems, completionRate, missedTitles };
}

// ─── Prompt building ──────────────────────────────────────────────────────────

/**
 * Builds a complete, standalone system prompt for the weekly_review action.
 *
 * This is entirely separate from buildSystemPrompt (daily planning).
 * The model is directed to act as a retrospective coach, not a daily scheduler.
 *
 * Prompt anatomy:
 *   - Role + style directive (concise)
 *   - Week bounds
 *   - Goals vs focus time actuals
 *   - Plan execution summary (from DB)
 *   - Distraction count
 *   - Personal context (from Block A memory)
 *   - Strict output format (4 sections, word limits)
 *
 * Token budget: ~350–450 tokens for the system prompt.
 * MAX_TOKENS = 1024 leaves ~580+ tokens for the response — sufficient for 250 words.
 */
export function buildWeeklyReviewSystemPrompt(
  ctx:                  ReviewChatContext,
  data:                 WeeklyReviewData,
  memoryContext:        string,
  personalizationLayer: string = '',
): string {
  // ── Goals vs focus time section ───────────────────────────────────────────
  const goalLines = ctx.tracks.length
    ? [...ctx.tracks]
        .sort((a, b) => a.priority - b.priority)
        .map((g) => {
          const targetMins = g.weeklyHoursTarget * 60;
          const loggedMins = ctx.focusSummary.weeklyMinsByGoal[g.title] ?? 0;
          const loggedH    = Math.round(loggedMins / 6) / 10;   // 1 decimal hour
          const targetH    = g.weeklyHoursTarget;
          const pct        = targetMins > 0
            ? Math.round((loggedMins / targetMins) * 100)
            : 0;
          return `• ${g.title}: target ${targetH}h/week · logged ${loggedH}h (${pct}%)`;
        })
        .join('\n')
    : '• No goals configured.';

  const totalH = Math.round(ctx.focusSummary.totalWeeklyMins / 6) / 10;

  // ── Plan execution section ────────────────────────────────────────────────
  let planSection: string;
  if (!data.planStats) {
    planSection = 'No plan data found for this week.';
  } else if (data.planStats.totalItems === 0) {
    planSection = 'No tasks were planned this week.';
  } else {
    const { totalItems, completedItems, completionRate, missedTitles } = data.planStats;
    planSection = `Tasks completed: ${completedItems} / ${totalItems} (${completionRate}%)`;
    if (missedTitles.length > 0) {
      planSection += `\nTop missed: ${missedTitles.join(' · ')}`;
    }
  }

  // ── Distractions section ──────────────────────────────────────────────────
  const dCount = data.distractionCount;
  const distractionLine = dCount === 0
    ? 'No distractions logged.'
    : `${dCount} distraction event${dCount === 1 ? '' : 's'} logged.`;

  // ── Memory / personal context (from Block A) ──────────────────────────────
  const memorySuffix = memoryContext ? `\n\n${memoryContext}` : '';

  return `You are the weekly coach for LifeOS, an AI-powered personal operating system.
The user has requested their Weekly Review. Write it directly — do not ask questions.

Style: direct, honest, data-grounded. No filler, no empty praise, no preamble.
Response limit: ≤ 250 words total across 4 sections.
${personalizationLayer ? '\n' + personalizationLayer + '\n' : ''}
═══ WEEK REVIEWED: ${data.weekStart} → ${data.weekEnd} ═══
Main focus: ${ctx.mainFocus ?? 'Not specified'}
Biggest distraction: ${ctx.biggestDistraction ?? 'Not specified'}

═══ GOALS — FOCUS TIME THIS WEEK ═══
${goalLines}
Total logged: ${totalH}h

═══ PLAN EXECUTION ═══
${planSection}

═══ DISTRACTIONS ═══
${distractionLine}${memorySuffix}

═══ OUTPUT FORMAT ═══
Write exactly these 4 sections, using **bold** headers, in this order:

**What Went Well** — 2 sentences. Reference at least one specific number.
**What Didn't Work** — 2 sentences. Name specific goals, missed tasks, or behaviour patterns.
**Pattern to Note** — 1 sentence. The single most notable behavioural theme this week.
**Next Week Priority** — 2 items maximum. One direct, actionable sentence each.

Start your response with "**What Went Well**" immediately. No intro, no sign-off.
If data is sparse, give an honest best-effort review and note what is missing.`;
}
