/**
 * _shared/recoveryService.ts — Recovery Intelligence data gathering and prompt building.
 *
 * Shared Deno module.  Imported via relative path:
 *   import { ... } from '../_shared/recoveryService.ts';
 *
 * Responsibilities:
 *   1. RecoveryData — structured data gathered from Supabase for today's recovery session
 *   2. gatherRecoveryData() — two fail-open DB queries (today's plan items + today's distractions)
 *   3. buildRecoverySystemPrompt() — produces a compact, standalone system prompt for the
 *      recover_day action; entirely separate from buildSystemPrompt (daily planning)
 *
 * Data contract:
 *   - Today's plan items are queried server-side for authoritative completion state.
 *   - Distraction count is filtered to today (>= todayDate).
 *   - Focus summary (weeklyMinsByGoal, totalWeeklyMins) comes from the client-supplied
 *     ChatContext — consistent with the existing daily coaching prompt.
 *   - Both queries are fail-open: errors produce neutral defaults (hasPlan: false / 0).
 *
 * Prompt contract:
 *   - System prompt is self-contained and directive — the user message triggers it.
 *   - Output format: 4 sections, 200-word limit, no preamble.
 *   - Sparse data is handled gracefully (no plan → guidance from goals + context only).
 *   - Target token budget: ≤ 450 tokens (leaves ~574 tokens for response at MAX_TOKENS = 1024).
 *
 * No migration required — recover_day already exists in ai_usage_log.action CHECK constraint.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single work-type plan item relevant to the recovery session. */
export interface RecoveryItem {
  startTime:      string;
  endTime:        string;
  title:          string;
  /** 'goal' | 'skill' | 'event' — break and free are excluded at aggregation. */
  type:           string;
  isCritical:     boolean;
  /** null when not specified on the item. */
  energyRequired: string | null;
}

/** All data gathered server-side for the recovery prompt. */
export interface RecoveryData {
  todayDate:          string;
  /** false when no plan row found for today, or when the query failed. */
  hasPlan:            boolean;
  completedCount:     number;
  /** Non-break, non-free items only. */
  totalWorkCount:     number;
  /** Integer 0–100. */
  completionRate:     number;
  completedItems:     RecoveryItem[];
  /** Not completed, work-type only (goal/skill/event). Sorted: critical → goal/skill → other. */
  remainingWorkItems: RecoveryItem[];
  /** Subset of remainingWorkItems where isCritical = true. */
  criticalRemaining:  RecoveryItem[];
  distractionsToday:  number;
}

// ─── ChatContext subset (matches ai-chat index.ts ChatContext) ─────────────────
// Declared locally to avoid circular imports — only the fields we actually use.

interface TrackItem {
  title:             string;
  category:          string;
  weeklyHoursTarget: number;
  priority:          number;
}

interface RecoveryChatContext {
  todayDate:           string;
  mainFocus?:          string;
  biggestDistraction?: string;
  tracks:              TrackItem[];
  focusSummary: {
    weeklyMinsByGoal: Record<string, number>;
    totalWeeklyMins:  number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Max remaining items listed in the prompt.
 * Keeps prompt compact — the AI does not need to see every item to prioritize.
 */
const MAX_REMAINING_ITEMS = 8;

// ─── Database helpers ─────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type AdminClient = any;

interface PlanItemRow {
  start_time:      string;
  end_time:        string;
  title:           string;
  type:            string;
  completed:       boolean;
  is_critical:     boolean;
  energy_required: string | null;
}

interface PlanRow {
  daily_plan_items: PlanItemRow[];
}

/**
 * Gathers today's plan completion state and distraction count.
 *
 * Two DB queries:
 *   1. daily_plans JOIN daily_plan_items for todayDate (single plan row).
 *   2. COUNT from distraction_logs for today.
 *
 * Both queries are fail-open:
 *   - Query 1 failure  → hasPlan = false (prompt falls back to goals-only guidance)
 *   - Query 2 failure  → distractionsToday = 0
 *   - null adminClient → returns neutral defaults immediately
 */
export async function gatherRecoveryData(
  adminClient: AdminClient,
  userId:      string,
  todayDate:   string,
): Promise<RecoveryData> {
  const neutral: RecoveryData = {
    todayDate,
    hasPlan:            false,
    completedCount:     0,
    totalWorkCount:     0,
    completionRate:     0,
    completedItems:     [],
    remainingWorkItems: [],
    criticalRemaining:  [],
    distractionsToday:  0,
  };

  if (!adminClient) return neutral;

  // ── Queries 1 & 2 in parallel — both are independent ─────────────────────
  // Query 1: today's plan items via PostgREST resource embedding.
  // Query 2: distraction count for today (simple COUNT).
  // UNIQUE (user_id, date) on daily_plans → at most one row → .limit(1) is correct.
  const [plansSettled, distSettled] = await Promise.allSettled([
    adminClient
      .from('daily_plans')
      .select('daily_plan_items(start_time, end_time, title, type, completed, is_critical, energy_required)')
      .eq('user_id', userId)
      .eq('date', todayDate)
      .limit(1),
    adminClient
      .from('distraction_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('timestamp', todayDate),
  ]);

  let planResult: RecoveryData = neutral;
  if (plansSettled.status === 'fulfilled') {
    const { data: plans, error: plansErr } = plansSettled.value;
    if (plansErr) {
      console.error('[recoveryService] plans query failed:', plansErr.message);
    } else if (plans && (plans as PlanRow[]).length > 0) {
      planResult = aggregateRecoveryData(todayDate, (plans as PlanRow[])[0]);
    }
  } else {
    const err = plansSettled.reason;
    console.error(
      '[recoveryService] gatherRecoveryData plans threw:',
      err instanceof Error ? err.message : String(err),
    );
  }

  let distractionsToday = 0;
  if (distSettled.status === 'fulfilled') {
    const { count, error: distErr } = distSettled.value;
    if (distErr) {
      console.error('[recoveryService] distractions query failed:', distErr.message);
    } else {
      distractionsToday = count ?? 0;
    }
  } else {
    const err = distSettled.reason;
    console.error(
      '[recoveryService] gatherRecoveryData distractions threw:',
      err instanceof Error ? err.message : String(err),
    );
  }

  return { ...planResult, distractionsToday };
}

// ─── Internal aggregation ─────────────────────────────────────────────────────

function toRecoveryItem(i: PlanItemRow): RecoveryItem {
  return {
    startTime:      i.start_time,
    endTime:        i.end_time,
    title:          i.title,
    type:           i.type,
    isCritical:     i.is_critical,
    energyRequired: i.energy_required ?? null,
  };
}

/**
 * Aggregates a single plan row into RecoveryData.
 * Excludes 'break' and 'free' items — structural, not work commitments.
 * Sorts remaining items: critical first, then goal/skill, then event/other.
 */
function aggregateRecoveryData(todayDate: string, plan: PlanRow): RecoveryData {
  const allItems = plan.daily_plan_items ?? [];

  // Work items only (non-break, non-free)
  const workItems = allItems.filter((i) => i.type !== 'break' && i.type !== 'free');

  const completedItems = workItems.filter((i) => i.completed).map(toRecoveryItem);

  // Sort remaining: critical first, then goal/skill, then everything else
  const incompleteWork = workItems.filter((i) => !i.completed);
  const typePriority   = (t: string): number =>
    t === 'goal' ? 0 : t === 'skill' ? 1 : t === 'event' ? 2 : 3;

  incompleteWork.sort((a, b) => {
    if (a.is_critical !== b.is_critical) return a.is_critical ? -1 : 1;
    return typePriority(a.type) - typePriority(b.type);
  });

  const remainingWorkItems = incompleteWork
    .slice(0, MAX_REMAINING_ITEMS)
    .map(toRecoveryItem);

  const criticalRemaining = remainingWorkItems.filter((i) => i.isCritical);

  const totalWorkCount  = workItems.length;
  const completedCount  = completedItems.length;
  const completionRate  = totalWorkCount > 0
    ? Math.round((completedCount / totalWorkCount) * 100)
    : 0;

  return {
    todayDate,
    hasPlan:            true,
    completedCount,
    totalWorkCount,
    completionRate,
    completedItems,
    remainingWorkItems,
    criticalRemaining,
    distractionsToday:  0,  // filled by caller after query 2
  };
}

// ─── Prompt building ──────────────────────────────────────────────────────────

/**
 * Builds a complete, standalone system prompt for the recover_day action.
 *
 * This is entirely separate from buildSystemPrompt (daily planning).
 * The model acts as a recovery coach — calm, practical, prioritization-aware.
 *
 * Prompt anatomy:
 *   - Role + style directive
 *   - Today's context (date, focus, distraction)
 *   - Active goals (priority order)
 *   - Plan status (completion rate)
 *   - Remaining work items (sorted by priority)
 *   - Personal context from Block A memory (if available)
 *   - Strict 4-section output format, 200-word limit
 *
 * Token budget: ~350–450 tokens for the system prompt.
 * MAX_TOKENS = 1024 leaves ~574+ tokens for the response.
 */
export function buildRecoverySystemPrompt(
  ctx:                  RecoveryChatContext,
  data:                 RecoveryData,
  memoryContext:        string,
  personalizationLayer: string = '',
): string {
  // ── Goals section ─────────────────────────────────────────────────────────
  const trackLines = ctx.tracks.length
    ? [...ctx.tracks]
        .sort((a, b) => a.priority - b.priority)
        .map((g) => `• ${g.title} (priority ${g.priority}, ${g.weeklyHoursTarget}h/week)`)
        .join('\n')
    : '• No goals configured.';

  // ── Plan status section ───────────────────────────────────────────────────
  let planStatusLine: string;
  if (!data.hasPlan) {
    planStatusLine = 'No daily plan found for today — working without a structured plan.';
  } else if (data.totalWorkCount === 0) {
    planStatusLine = 'Plan exists but contains no work items.';
  } else {
    planStatusLine = `${data.completedCount} / ${data.totalWorkCount} work items done (${data.completionRate}%)`;
    if (data.criticalRemaining.length > 0) {
      const titles = data.criticalRemaining.map((i) => i.title).join(', ');
      planStatusLine += `\nCritical still open: ${titles}`;
    }
  }

  // ── Remaining items section ───────────────────────────────────────────────
  let remainingSection: string;
  if (!data.hasPlan || data.remainingWorkItems.length === 0) {
    remainingSection = data.completedCount > 0
      ? `All ${data.completedCount} work items are already done — no tasks remain.`
      : 'No remaining work items found.';
  } else {
    remainingSection = data.remainingWorkItems
      .map((i) => {
        const flags: string[] = [];
        if (i.isCritical)     flags.push('CRITICAL');
        if (i.energyRequired) flags.push(`${i.energyRequired}-energy`);
        const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
        return `• ${i.startTime}–${i.endTime}  ${i.title}  (${i.type})${flagStr}`;
      })
      .join('\n');
  }

  // ── Distractions section ──────────────────────────────────────────────────
  const dCount = data.distractionsToday;
  const distractionLine = dCount === 0
    ? 'No distractions logged today.'
    : `${dCount} distraction event${dCount === 1 ? '' : 's'} logged today.`;

  // ── Memory / personal context (from Block A) ──────────────────────────────
  const memorySuffix = memoryContext ? `\n\n${memoryContext}` : '';

  return `You are the recovery coach for LifeOS. The user has fallen behind today and needs to get back on control.
Write directly — no questions, no preamble, no sign-off.

Style: calm, practical, prioritization-aware. No guilt, no motivation speeches.
Response limit: ≤ 200 words total across 4 sections.
${personalizationLayer ? '\n' + personalizationLayer + '\n' : ''}
═══ TODAY: ${data.todayDate} ═══
Main focus: ${ctx.mainFocus ?? 'Not specified'}
Biggest distraction: ${ctx.biggestDistraction ?? 'Not specified'}
${distractionLine}

═══ ACTIVE GOALS (priority order) ═══
${trackLines}

═══ PLAN STATUS ═══
${planStatusLine}

═══ REMAINING WORK ITEMS (highest priority first) ═══
${remainingSection}${memorySuffix}

═══ OUTPUT FORMAT ═══
Write exactly these 4 sections using **bold** headers, in this order:

**Keep Today** — 1–3 items maximum. The most important remaining work. One line per item.
**Defer** — Items to move to tomorrow. One line each. If nothing warrants deferral, write "Nothing to defer."
**Do This Next** — 1 sentence. The single most important action the user should take right now.
**Recovery Note** — 1 sentence. Calm, realistic, forward-looking.

Start your response with "**Keep Today**" immediately.
If no plan data is available, use goals and context to give the best possible recovery guidance.`;
}
