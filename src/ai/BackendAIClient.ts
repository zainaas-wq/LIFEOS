/**
 * BackendAIClient — routes chat through the Supabase Edge Function `ai-chat`.
 *
 * Used for authenticated (non-guest) users. Falls back to LocalAIClient on
 * timeout or provider errors with a visible inline notice so the user always
 * knows which mode responded.
 *
 * generateDailyPlan / generateWeeklyPlan delegate to LocalAIClient — these
 * are deterministic scheduling operations that do not require the backend.
 */

import type { AIClient, AIContext } from './AIClient';
import { detectAgentType } from './AIClient';
import type { AIAction, ChatMessage, Plan } from '../types';
import { LocalAIClient } from './LocalAIClient';
import { generateSmartDailyPlan, generateSmartWeeklyPlan, parseFixedWindow } from './planningEngine';
import { rescheduleRemaining } from './adaptiveRescheduler';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getWeekStartStr(todayDate: string): string {
  const d = new Date(todayDate + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay()); // Sunday
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Intent detection (for client-side plan card attachment) ─────────────────

function isPlanRequest(msg: string): boolean {
  return /\b(daily plan|plan (for )?today|today.s plan|generate.*day|plan my day|build my day)\b/i.test(msg);
}

function isWeeklyPlanRequest(msg: string): boolean {
  return /\b(weekly plan|plan (for )?the week|this week|generate.*week|rebuild.*week)\b/i.test(msg);
}

function isRecoverDayRequest(msg: string): boolean {
  return /\b(recover|missed.*tasks?|reschedule|get back on track)\b/i.test(msg);
}

// ─── Context mapper ───────────────────────────────────────────────────────────

function buildChatContext(ctx: AIContext): object {
  const weekStart = getWeekStartStr(ctx.todayDate);
  const weeklyMinsByGoal: Record<string, number> = {};
  for (const s of ctx.focusSessions ?? []) {
    if (!s.goalId || !s.start || s.start < weekStart) continue;
    const goal = ctx.goals.find((g) => g.id === s.goalId);
    const key  = goal?.title ?? s.goalId;
    weeklyMinsByGoal[key] = (weeklyMinsByGoal[key] ?? 0) + (s.durationMinutes ?? 0);
  }
  const totalWeeklyMins = Object.values(weeklyMinsByGoal).reduce((a, b) => a + b, 0);

  // Today's distraction count
  const today = new Date().toDateString();

  return {
    todayDate:           ctx.todayDate,
    mainFocus:           ctx.mainFocus,
    biggestDistraction:  ctx.biggestDistraction,
    fixedScheduleStart:  ctx.fixedScheduleStart,
    fixedScheduleEnd:    ctx.fixedScheduleEnd,
    energyStyle:         ctx.energyStyle,
    workStyle:           ctx.workStyle,
    distractionCount:    ctx.distractionCount ?? 0,

    tracks: ctx.goals.map((g) => ({
      title:             g.title,
      category:          g.category,
      weeklyHoursTarget: g.weeklyHoursTarget,
      priority:          g.priority,
      deadline:          g.deadline,
    })),
    schedule: ctx.scheduleEvents.map((e) => ({
      title:      e.title, start: e.start, end: e.end,
      daysOfWeek: e.daysOfWeek, location: e.location,
    })),
    frictions:    [],
    focusSummary: { weeklyMinsByGoal, totalWeeklyMins },

    todayPlan: ctx.currentPlan
      ? {
          date:  ctx.currentPlan.dateRange.start,
          items: ctx.currentPlan.items.map((i) => ({
            startTime: i.startTime, endTime: i.endTime,
            title: i.title, type: i.type, completed: i.completed,
          })),
        }
      : undefined,

    // Phase A: agent-specific context
    rules: (ctx.rules ?? [])
      .filter((r) => r.enabled)
      .map((r) => ({
        title: r.title, type: r.type, enabled: r.enabled,
        startTime: r.startTime, endTime: r.endTime, followedToday: r.followedToday,
      })),
    reflections: (ctx.reflections ?? [])
      .slice(0, 7)
      .map((r) => ({ date: r.date, text: r.text.slice(0, 300) })),
    goalIntelligence: ctx.goalIntelligence ?? {},
    courses:     (ctx.courses ?? []).map((c) => ({
      id: c.id, name: c.name, code: c.code, creditHours: c.creditHours,
    })),
    exams: (ctx.exams ?? [])
      .filter((e) => e.date >= ctx.todayDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 10)
      .map((e) => ({
        id: e.id, courseId: e.courseId, title: e.title,
        date: e.date, topics: e.topics, type: e.type,
      })),
    assignments: (ctx.assignments ?? [])
      .filter((a) => !a.completed && a.dueDate >= ctx.todayDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 15)
      .map((a) => ({
        id: a.id, courseId: a.courseId, title: a.title,
        dueDate: a.dueDate, type: a.type, priority: a.priority, completed: a.completed,
      })),
    projects: (ctx.projects ?? [])
      .filter((p) => p.status === 'active')
      .map((p) => ({
        id: p.id, title: p.title, status: p.status, deadline: p.deadline,
      })),
    milestones: (ctx.milestones ?? [])
      .filter((m) => m.status !== 'completed')
      .slice(0, 20)
      .map((m) => ({
        id: m.id, projectId: m.projectId, title: m.title,
        status: m.status, dueDate: m.dueDate,
      })),

    // Phase B: academic intelligence
    courseReadiness: ctx.courseReadiness
      ? Object.values(ctx.courseReadiness).map((r) => ({
          courseId: r.courseId, courseName: r.courseName,
          score: r.score, label: r.label,
          recommendation: r.recommendation,
          studyMinsThisWeek: r.studyMinsThisWeek,
          daysUntilNextExam: r.daysUntilNextExam,
          overdueAssignments: r.overdueAssignments,
        }))
      : [],
    academicRisks: (ctx.academicRisks ?? []).map((r) => ({
      courseName: r.courseName, riskLevel: r.riskLevel,
      reason: r.reason, actionRequired: r.actionRequired,
    })),
    // Phase B.5: topic intelligence
    topicWeakness: ctx.topicWeakness
      ? Object.values(ctx.topicWeakness).map((t) => ({
          topicName: t.topicName, courseName: t.courseName,
          score: t.score, label: t.label,
          memoryCount: t.memoryCount, recommendation: t.recommendation,
        }))
      : [],
    // Phase C: project intelligence
    projectIntelligence: ctx.projectIntelligence
      ? Object.values(ctx.projectIntelligence).map((pi) => ({
          projectId: pi.projectId, projectName: pi.projectName,
          healthScore: pi.healthScore, healthLabel: pi.healthLabel,
          completionProbability: pi.completionProbability,
          velocity: pi.velocity, blockedCount: pi.blockedCount,
          overdueCount: pi.overdueCount, daysSinceActivity: pi.daysSinceActivity,
          deadlineRisk: pi.deadlineRisk, daysUntilDeadline: pi.daysUntilDeadline,
          completedCount: pi.completedCount, totalCount: pi.totalCount,
          recommendation: pi.recommendation,
        }))
      : [],
    projectRisks: (ctx.projectRisks ?? []).map((r) => ({
      projectName: r.projectName, riskLevel: r.riskLevel,
      reason: r.reason, actionRequired: r.actionRequired,
    })),
  };
}

// ─── BackendAIClient ──────────────────────────────────────────────────────────

export class BackendAIClient implements AIClient {
  private readonly endpoint: string;
  private readonly local = new LocalAIClient();

  constructor(
    supabaseUrl: string,
    private readonly accessToken: string,
  ) {
    this.endpoint = `${supabaseUrl}/functions/v1/ai-chat`;
  }

  async chat(
    userMessage: string,
    history: ChatMessage[],
    context: AIContext,
  ): Promise<ChatMessage> {
    // Slim history to wire-safe shape
    const wireHistory = history.map((m) => ({ role: m.role, content: m.content }));

    let responseData: {
      id?: string;
      role?: string;
      content?: string;
      createdAt?: string;
      usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number; provider?: string };
      action?: { type: string; data: Record<string, unknown> };
      error?: string;
      code?: string;
    } | null = null;

    // Client-side timeout: 30 s (slightly longer than the server's 25 s so the
    // server's own AbortError normally fires first, but we never hang forever).
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 30_000);

    const agentType = detectAgentType(userMessage, (context.memories?.length ?? 0) > 0);

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          message:   userMessage,
          history:   wireHistory,
          context:   buildChatContext(context),
          agentType, // routes to specialized agent mode on the backend
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      responseData = await res.json().catch(() => null);

      // Auth failure — do not fall back, surface to user
      if (res.status === 401 || responseData?.code === 'auth_required') {
        throw new Error('Session expired. Please sign in again.');
      }

      // Quota exhaustion — specific credits message, then local fallback
      if (res.status === 429 || responseData?.code === 'quota_exceeded') {
        return this.quotaFallback(userMessage, history, context);
      }

      // Entitlement failure — action not available on this tier (no quota consumed)
      if (res.status === 403 || responseData?.code === 'action_not_entitled') {
        return this.entitlementFallback(userMessage, history, context);
      }

      // Other non-200 → fall back
      if (!res.ok || responseData?.error) {
        const code = responseData?.code ?? 'provider_error';
        return await this.fallback(userMessage, history, context, code);
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      // Re-throw auth errors so they surface in chat
      if (err instanceof Error && err.message.includes('Session expired')) throw err;
      // Timeout (AbortError) → distinct notice; any other error → generic network notice
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' ||
          err.message.includes('AbortError') ||
          err.message.toLowerCase().includes('aborted'));
      return this.fallback(userMessage, history, context, isTimeout ? 'timeout' : 'network');
    }

    // ── Success: build ChatMessage ──────────────────────────────────────────
    const text = responseData?.content ?? '';
    if (!text.trim()) {
      return this.fallback(userMessage, history, context, 'provider_error');
    }

    if (__DEV__ && responseData?.usage) {
      console.log('[BackendAIClient] token usage:', responseData.usage);
    }

    // Attach local structured plan card if this was a plan request
    let plan: Plan | undefined;
    const { fixedStart, fixedEnd } = parseFixedWindow(context.fixedScheduleStart, context.fixedScheduleEnd);

    if (isRecoverDayRequest(userMessage) && context.currentPlan) {
      const now = new Date();
      const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      plan = rescheduleRemaining(
        context.currentPlan, t, context.goals, context.scheduleEvents, context.rules, context.todayDate,
      );
    } else if (isPlanRequest(userMessage)) {
      plan = generateSmartDailyPlan(
        context.goals, context.scheduleEvents, context.skillPlans, context.rules,
        context.todayDate, fixedStart, fixedEnd,
      );
    } else if (isWeeklyPlanRequest(userMessage)) {
      plan = generateSmartWeeklyPlan(
        context.goals, context.scheduleEvents, context.skillPlans, context.rules,
        context.todayDate, fixedStart, fixedEnd,
      );
    }

    return {
      id:        responseData?.id ?? uid(),
      role:      'assistant',
      content:   text,
      createdAt: responseData?.createdAt ?? new Date().toISOString(),
      plan,
      // Edge Function returns { type, data } without status — add 'pending' so
      // ai.tsx can detect and execute the action via executeAIAction.
      action: responseData?.action
        ? { ...responseData.action, type: responseData.action.type as AIAction['type'], status: 'pending' as const }
        : undefined,
    };
  }

  async generateDailyPlan(date: string, context: AIContext): Promise<Plan> {
    return this.local.generateDailyPlan(date, context);
  }

  async generateWeeklyPlan(startDate: string, context: AIContext): Promise<Plan> {
    return this.local.generateWeeklyPlan(startDate, context);
  }

  // ── Entitlement fallback ───────────────────────────────────────────────────

  private async entitlementFallback(
    userMessage: string,
    history: ChatMessage[],
    context: AIContext,
  ): Promise<ChatMessage> {
    const notice =
      '_This feature is available on Pro. Your Local Coach is still here._\n\n';
    const localReply = await this.local.chat(userMessage, history, context);
    return { ...localReply, content: notice + localReply.content };
  }

  // ── Quota fallback ─────────────────────────────────────────────────────────

  private async quotaFallback(
    userMessage: string,
    history: ChatMessage[],
    context: AIContext,
  ): Promise<ChatMessage> {
    const notice =
      '_Your AI credits for this month are spent. They reset on the 1st — your Local Coach is still here._\n\n';
    const localReply = await this.local.chat(userMessage, history, context);
    return { ...localReply, content: notice + localReply.content };
  }

  // ── Fallback ───────────────────────────────────────────────────────────────

  private async fallback(
    userMessage: string,
    history: ChatMessage[],
    context: AIContext,
    code: string,
  ): Promise<ChatMessage> {
    const notice =
      code === 'timeout'
        ? '_⚡ Offline (server timed out — local response)_\n\n'
        : '_⚡ Offline (AI service temporarily unavailable — local response)_\n\n';

    const localReply = await this.local.chat(userMessage, history, context);
    return { ...localReply, content: notice + localReply.content };
  }
}
