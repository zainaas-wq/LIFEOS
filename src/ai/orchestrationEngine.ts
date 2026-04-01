/**
 * orchestrationEngine.ts — AI request orchestration layer.
 *
 * Pure module — no React, no Supabase, no store deps.
 * Safe for Node tests.
 *
 * Responsibilities:
 *   1. Derive the correct AI request mode from live product signals.
 *   2. Choose context depth based on mode + credit balance.
 *   3. Decide whether the external API should be used at all.
 *   4. Shape the response style hint injected into the wire payload.
 *   5. Build a depth-appropriate wire context object.
 *
 * Nothing here touches the network. Everything here is a pure decision.
 */

import type { AIContext } from './AIClient';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * AI request modes — derived from real product state.
 *
 * quick_nudge       Low credits or simple message — short, action-first reply.
 * focused_answer    Standard AI turn — balanced depth and tone.
 * recovery_coach    User is in recovery mode or high drift — supportive and concrete.
 * strategic_planning Plan/schedule keywords — structured, thorough response.
 * review_reflection  Review/reflection keywords with sufficient review history.
 */
export type AIRequestMode =
  | 'quick_nudge'
  | 'focused_answer'
  | 'recovery_coach'
  | 'strategic_planning'
  | 'review_reflection';

/**
 * Context depth controls how much of the AIContext is serialized into the wire payload.
 *
 * minimal  Only date + mainFocus + aiMode. Used for quick nudges or near-zero balance.
 * focused  Goals + today's plan + top review pattern. Default depth.
 * rich     Full context including predictions, all review signals, focus history.
 */
export type ContextDepth = 'minimal' | 'focused' | 'rich';

/**
 * Signals passed into orchestration decisions.
 * All sourced from existing store / context — nothing new is computed here.
 */
export interface OrchestrationSignals {
  userMessage:      string;
  driftScore:       number;
  isInRecoveryMode: boolean;
  missedTasksCount: number;
  reviewCount:      number;
  creditBalance:    number | null;   // null = unknown (balance not yet loaded)
  dayMode:          string;          // DayMode enum string
  hasActivePlan:    boolean;
  topRiskCount:     number;          // predictions.topRisks.length
}

// ─── Internal keyword patterns ────────────────────────────────────────────────

const PLANNING_RE = /\b(daily plan|weekly plan|plan (for |my )?(today|day|week|the week)|generate.*plan|build.*day|schedule|strategy|roadmap|prioritize)\b/i;
const REVIEW_RE   = /\b(review|reflect(ion)?|last week|yesterday|how did i|pattern|progress|am i on track|summary|recap)\b/i;
const SHORT_CHAR_THRESHOLD = 30; // messages below this are "quick" unless drift is active

// ─── 1. deriveAIRequestMode ───────────────────────────────────────────────────

/**
 * Select the correct AI request mode based on live product signals.
 *
 * Priority order (first match wins):
 *   1. Recovery: explicit recovery state or heavy drift
 *   2. Strategic planning: plan/schedule/strategy keywords
 *   3. Review reflection: review keywords + sufficient history
 *   4. Quick nudge: very low credits or short low-context message
 *   5. Focused answer: default
 */
export function deriveAIRequestMode(s: OrchestrationSignals): AIRequestMode {
  // 1. Recovery path — behavioral state takes highest priority
  if (s.isInRecoveryMode || s.driftScore >= 5 || s.missedTasksCount >= 3) {
    return 'recovery_coach';
  }

  // 2. Strategic planning — explicit intent signal
  if (PLANNING_RE.test(s.userMessage)) {
    return 'strategic_planning';
  }

  // 3. Review / reflection — keyword + minimum review history guard
  if (REVIEW_RE.test(s.userMessage) && s.reviewCount >= 2) {
    return 'review_reflection';
  }

  // 4. Quick nudge — credit conservation or low-stakes message
  if (
    (s.creditBalance !== null && s.creditBalance <= 2) ||
    (s.userMessage.trim().length < SHORT_CHAR_THRESHOLD && s.driftScore === 0 && !s.hasActivePlan)
  ) {
    return 'quick_nudge';
  }

  // 5. Default
  return 'focused_answer';
}

// ─── 2. selectContextDepth ────────────────────────────────────────────────────

/**
 * Choose how much context to serialize into the wire payload.
 *
 *   minimal → mode=quick_nudge OR balance ≤ 2
 *   rich    → mode=strategic_planning OR mode=review_reflection
 *   focused → everything else
 */
export function selectContextDepth(mode: AIRequestMode, balance: number | null): ContextDepth {
  if (mode === 'quick_nudge') return 'minimal';
  if (balance !== null && balance <= 2) return 'minimal';
  if (mode === 'strategic_planning' || mode === 'review_reflection') return 'rich';
  return 'focused';
}

// ─── 3. historyDepthForMode ───────────────────────────────────────────────────

/**
 * Maximum number of past chat messages to include in the wire request.
 * Reducing history depth cuts token cost on the backend.
 *
 *   minimal →  0 (no history — each turn is treated as fresh)
 *   focused →  4 (last 4 messages)
 *   rich    →  8 (last 8 messages)
 */
export function historyDepthForMode(depth: ContextDepth): number {
  if (depth === 'minimal') return 0;
  if (depth === 'rich')    return 8;
  return 4;
}

// ─── 4. shouldUseExternalAI ───────────────────────────────────────────────────

/**
 * Returns true when the external AI API should be called.
 *
 * External AI is skipped when:
 *   - User is not authenticated (guest mode)
 *   - Balance is known and exhausted (avoids unnecessary round-trips)
 *   - Mode is quick_nudge AND balance ≤ 2 (preserve scarce credits for higher-value requests)
 *
 * The backend already handles all fallback cases, so the only
 * client-side skips are for credit preservation and guest mode.
 */
export function shouldUseExternalAI(
  balance:         number | null,
  mode:            AIRequestMode,
  isAuthenticated: boolean,
): boolean {
  if (!isAuthenticated) return false;
  if (balance !== null && balance <= 0) return false;
  if (mode === 'quick_nudge' && balance !== null && balance <= 2) return false;
  return true;
}

// ─── 5. getResponseStyleHint ──────────────────────────────────────────────────

/**
 * Return a style instruction string for the current mode.
 * This is injected into the context object sent to the backend,
 * which includes it in the OpenAI system prompt.
 */
export function getResponseStyleHint(mode: AIRequestMode): string {
  switch (mode) {
    case 'quick_nudge':
      return 'Respond in 2 sentences maximum. Be direct and action-first. No preamble or filler.';
    case 'focused_answer':
      return 'Be concise and practical. Get to the answer quickly. Avoid unnecessary length.';
    case 'recovery_coach':
      return 'Be supportive and never guilt-inducing. Acknowledge briefly what happened, then focus entirely on concrete next steps. Keep tone warm but action-focused.';
    case 'strategic_planning':
      return 'Structure your response with clear sections or bullet points where helpful. Be thorough and consider the full context provided.';
    case 'review_reflection':
      return 'Interpret patterns across the data. Draw meaningful connections. Be insightful but stay grounded in the facts provided. Do not speculate beyond what the data supports.';
  }
}

// ─── 6. getModeLabelDisplay ───────────────────────────────────────────────────

const MODE_LABELS: Record<AIRequestMode, string> = {
  quick_nudge:       'Quick Help',
  focused_answer:    'Focused',
  recovery_coach:    'Recovery Coach',
  strategic_planning:'Strategic',
  review_reflection: 'Review',
};

/** Human-readable mode label for UI display. */
export function getModeLabelDisplay(mode: AIRequestMode): string {
  return MODE_LABELS[mode];
}

// ─── 7. buildAIContextPacket ──────────────────────────────────────────────────

/**
 * Build a depth-appropriate wire context object from the full AIContext.
 *
 * minimal:  date + mainFocus + aiMode + styleHint only.
 *           No goals, no plan, no history signals. Minimizes token spend.
 *
 * focused:  + top-3 goals (title + priority) + today's plan items
 *           + first review pattern. Balanced signal/token ratio.
 *
 * rich:     Full context: all goals, full plan, focus summary,
 *           review signals, prediction signals. Maximum intelligence.
 */
export function buildAIContextPacket(
  ctx:   AIContext,
  depth: ContextDepth,
  mode:  AIRequestMode,
): object {
  const base = {
    todayDate:        ctx.todayDate,
    aiMode:           mode,
    responseStyleHint: getResponseStyleHint(mode),
    ...(ctx.mainFocus ? { mainFocus: ctx.mainFocus } : {}),
  };

  if (depth === 'minimal') {
    return base;
  }

  // ── focused ──────────────────────────────────────────────────────────────
  const topGoals = ctx.goals
    .slice()
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    .slice(0, 3)
    .map((g) => ({ title: g.title, priority: g.priority, weeklyHoursTarget: g.weeklyHoursTarget }));

  const todayPlanItems = ctx.currentPlan
    ? ctx.currentPlan.items.slice(0, 10).map((i) => ({
        startTime: i.startTime,
        endTime:   i.endTime,
        title:     i.title,
        type:      i.type,
        completed: i.completed,
      }))
    : undefined;

  const firstPattern = ctx.reviewSignals?.recentPatterns?.[0];

  const focused = {
    ...base,
    ...(ctx.biggestDistraction ? { biggestDistraction: ctx.biggestDistraction } : {}),
    tracks: topGoals,
    ...(todayPlanItems ? { todayPlan: { items: todayPlanItems } } : {}),
    ...(firstPattern ? { recentPattern: firstPattern } : {}),
    ...(ctx.reviewSignals?.adaptationRationale
      ? { adaptationHint: ctx.reviewSignals.adaptationRationale }
      : {}),
  };

  if (depth === 'focused') {
    return focused;
  }

  // ── rich ─────────────────────────────────────────────────────────────────
  const allGoals = ctx.goals.map((g) => ({
    title: g.title, category: g.category,
    weeklyHoursTarget: g.weeklyHoursTarget, priority: g.priority,
  }));

  const schedule = ctx.scheduleEvents.map((e) => ({
    title: e.title, start: e.start, end: e.end,
    daysOfWeek: e.daysOfWeek, location: e.location,
  }));

  // Weekly focus summary
  const weeklyMinsByGoal: Record<string, number> = {};
  const weekStart = _weekStartStr(ctx.todayDate);
  for (const s of ctx.focusSessions ?? []) {
    if (!s.goalId || !s.start || s.start < weekStart) continue;
    const goal = ctx.goals.find((g) => g.id === s.goalId);
    const key  = goal?.title ?? s.goalId;
    weeklyMinsByGoal[key] = (weeklyMinsByGoal[key] ?? 0) + (s.durationMinutes ?? 0);
  }
  const totalWeeklyMins = Object.values(weeklyMinsByGoal).reduce((a, b) => a + b, 0);

  return {
    ...focused,
    tracks: allGoals,
    schedule,
    fixedScheduleStart: ctx.fixedScheduleStart,
    fixedScheduleEnd:   ctx.fixedScheduleEnd,
    focusSummary: { weeklyMinsByGoal, totalWeeklyMins },
    ...(ctx.reviewSignals
      ? {
          reviewSignals: {
            recentPatterns:      ctx.reviewSignals.recentPatterns.slice(0, 3),
            adaptationRationale: ctx.reviewSignals.adaptationRationale,
            preferredRecovery:   ctx.reviewSignals.preferredRecoveryModes.slice(0, 2),
            reviewCount:         ctx.reviewSignals.reviewCount,
          },
        }
      : {}),
    ...(ctx.predictionSignals?.topRisks.length
      ? {
          predictions: {
            topRisks:    ctx.predictionSignals.topRisks.slice(0, 2).map((r) => ({
              riskType:   r.riskType,
              confidence: r.confidence,
              headline:   r.headline,
            })),
            context: ctx.predictionSignals.predictionContext,
          },
        }
      : {}),
    // Batch 19: strategic intelligence (weekly + monthly trajectory)
    ...(ctx.strategicIntelligence?.coachSummary
      ? {
          strategicIntelligence: {
            weekCharacter:          ctx.strategicIntelligence.weekly.weekCharacter,
            momentumState:          ctx.strategicIntelligence.momentumState,
            monthlyInterpretation:  ctx.strategicIntelligence.monthly.monthlyInterpretation,
            recoveryDependence:     ctx.strategicIntelligence.weekly.recoveryDependence,
            topRecommendation:      ctx.strategicIntelligence.recommendations[0]?.action ?? null,
            coachSummary:           ctx.strategicIntelligence.coachSummary,
          },
        }
      : {}),
  };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _weekStartStr(todayDate: string): string {
  const d = new Date(todayDate + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}
