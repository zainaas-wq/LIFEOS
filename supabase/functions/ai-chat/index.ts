/**
 * LifeOS — ai-chat Edge Function  (Phase A — Intelligence Foundation)
 *
 * POST /functions/v1/ai-chat
 * Authorization: Bearer <supabase-jwt>
 *
 * Phase A upgrades:
 *   Sprint 2 — Semantic memory retrieval (vector similarity via search_memories RPC)
 *   Sprint 3 — True agent routing (5 specialized agents, distinct prompts + context)
 *   Sprint 4 — Action parsing (LLM embeds <action> blocks, returned separately)
 *
 * Provider routing (AI_PROVIDER secret): "openai" (default) | "anthropic"
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  fetchUserMemory,
  buildMemoryContext,
  buildPersonalizationInstructions,
} from '../_shared/memoryService.ts';
import {
  gatherWeeklyData,
  buildWeeklyReviewSystemPrompt,
} from '../_shared/weeklyReviewService.ts';
import {
  gatherRecoveryData,
  buildRecoverySystemPrompt,
} from '../_shared/recoveryService.ts';
import { buildMemoryAgentPrompt }      from '../_shared/agents/memoryAgent.ts';
import { buildPlanningAgentPrompt }    from '../_shared/agents/planningAgent.ts';
import { buildLearningAgentPrompt }    from '../_shared/agents/learningAgent.ts';
import { buildProductivityAgentPrompt } from '../_shared/agents/productivityAgent.ts';
import { buildLifeAgentPrompt }        from '../_shared/agents/lifeAgent.ts';
import { buildBuilderAgentPrompt }    from '../_shared/agents/builderAgent.ts';
import { parseActionFromResponse, isActionRequest, buildActionInstructions } from '../_shared/actionParser.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentType = 'memory' | 'planning' | 'learning' | 'productivity' | 'builder' | 'life';
type ProviderName = 'openai' | 'anthropic';

interface TrackItem       { title: string; category: string; weeklyHoursTarget: number; priority: number; deadline?: string }
interface ScheduleEventItem { title: string; start: string; end: string; daysOfWeek: number[]; location?: string }
interface FrictionItem    { type: string; label: string; loggedToday: number }
interface PlanItem        { startTime: string; endTime: string; title: string; type: string; completed?: boolean }
interface CourseItem      { id: string; name: string; code?: string; creditHours?: number }
interface ExamItem        { id: string; courseId: string; title: string; date: string; topics: string[]; type: string }
interface AssignmentItem  { id: string; courseId: string; title: string; dueDate: string; type: string; priority: string; completed: boolean }
interface ProjectItem     { id: string; title: string; status: string; deadline?: string }
interface MilestoneItem   { id: string; projectId: string; title: string; status: string; dueDate?: string }
interface RuleItem        { title: string; type: string; enabled: boolean; startTime?: string; endTime?: string; followedToday?: boolean }
interface ReflectionItem  { date: string; text: string }
interface GoalIntelItem   { probability: number; riskLevel: string; riskReason: string; weeklyHoursLogged: number }
interface ReadinessItem     { courseId: string; courseName: string; score: number; label: string; recommendation: string; studyMinsThisWeek: number; daysUntilNextExam: number | null; overdueAssignments: number }
interface AcademicRiskItem  { courseName: string; riskLevel: string; reason: string; actionRequired: string }
interface TopicWeaknessItem      { topicName: string; courseName: string; score: number; label: string; memoryCount: number; recommendation: string }
interface ProjectIntelligenceItem {
  projectId: string; projectName: string; healthScore: number; healthLabel: string;
  completionProbability: number; velocity: number; blockedCount: number; overdueCount: number;
  daysSinceActivity: number; deadlineRisk: string; daysUntilDeadline: number | null;
  completedCount: number; totalCount: number; recommendation: string;
}
interface ProjectRiskItem { projectName: string; riskLevel: string; reason: string; actionRequired: string }

interface ChatContext {
  todayDate:          string;
  mainFocus?:         string;
  biggestDistraction?: string;
  fixedScheduleStart?: string;
  fixedScheduleEnd?:  string;
  tracks:             TrackItem[];
  schedule:           ScheduleEventItem[];
  frictions:          FrictionItem[];
  focusSummary:       { weeklyMinsByGoal: Record<string, number>; totalWeeklyMins: number };
  todayPlan?:         { date: string; items: PlanItem[] };
  // Phase A additions:
  courses?:           CourseItem[];
  exams?:             ExamItem[];
  assignments?:       AssignmentItem[];
  projects?:          ProjectItem[];
  milestones?:        MilestoneItem[];
  rules?:             RuleItem[];
  reflections?:       ReflectionItem[];
  goalIntelligence?:  Record<string, GoalIntelItem>;
  distractionCount?:  number;
  energyStyle?:       string;
  workStyle?:         string;
  // Phase B: academic intelligence
  courseReadiness?:   ReadinessItem[];
  academicRisks?:     AcademicRiskItem[];
  // Phase B.5: topic intelligence
  topicWeakness?:       TopicWeaknessItem[];
  // Phase C: project intelligence
  projectIntelligence?: ProjectIntelligenceItem[];
  projectRisks?:        ProjectRiskItem[];
}

interface HistoryMessage  { role: 'user' | 'assistant'; content: string }

interface RequestBody {
  message:   string;
  history:   HistoryMessage[];
  context:   ChatContext;
  agentType?: AgentType;
}

interface TokenUsage {
  promptTokens:     number;
  completionTokens: number;
  totalTokens:      number;
  provider:         ProviderName;
}

interface ProviderResult { content: string; usage: TokenUsage }

interface ParsedAction {
  type: string;
  data: Record<string, unknown>;
}

interface SuccessResponse {
  id:        string;
  role:      'assistant';
  content:   string;
  createdAt: string;
  usage?:    TokenUsage;
  action?:   ParsedAction;
}

interface ErrorResponse {
  error: string;
  code: 'auth_required' | 'invalid_request' | 'provider_error' | 'timeout' | 'quota_exceeded' | 'action_not_entitled';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEOUT_MS      = 25_000;
const MAX_TOKENS      = 1500;  // slightly higher for agents that may embed action blocks
const OPENAI_MODEL    = 'gpt-4o-mini';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS  = 1536;

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

// ─── Provider helpers ─────────────────────────────────────────────────────────

function resolveProvider(): ProviderName {
  const raw = (Deno.env.get('AI_PROVIDER') ?? '').trim().toLowerCase();
  if (raw === 'anthropic') return 'anthropic';
  if (raw !== '' && raw !== 'openai') {
    console.warn(`[ai-chat] Unknown AI_PROVIDER "${raw}" — falling back to openai`);
  }
  return 'openai';
}

async function callOpenAI(
  systemPrompt: string, history: HistoryMessage[], userMessage: string, signal: AbortSignal,
): Promise<ProviderResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body:   JSON.stringify({ model: OPENAI_MODEL, max_tokens: MAX_TOKENS, messages }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('OpenAI: invalid API key');
    if (res.status === 429) throw new Error('OpenAI: rate limit');
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 120)}`);
  }
  const data = await res.json();
  const content = (data?.choices?.[0]?.message?.content as string) ?? '';
  return {
    content,
    usage: {
      promptTokens:     data?.usage?.prompt_tokens     ?? 0,
      completionTokens: data?.usage?.completion_tokens ?? 0,
      totalTokens:      data?.usage?.total_tokens      ?? 0,
      provider: 'openai',
    },
  };
}

async function callAnthropic(
  systemPrompt: string, history: HistoryMessage[], userMessage: string, signal: AbortSignal,
): Promise<ProviderResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body:   JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: MAX_TOKENS, system: systemPrompt, messages }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('Anthropic: invalid API key');
    if (res.status === 429) throw new Error('Anthropic: rate limit');
    throw new Error(`Anthropic error ${res.status}: ${text.slice(0, 120)}`);
  }
  const data = await res.json();
  const content = (data?.content?.[0]?.text as string) ?? '';
  const pt = data?.usage?.input_tokens  ?? 0;
  const ct = data?.usage?.output_tokens ?? 0;
  return { content, usage: { promptTokens: pt, completionTokens: ct, totalTokens: pt + ct, provider: 'anthropic' } };
}

async function callProvider(
  provider: ProviderName, systemPrompt: string, history: HistoryMessage[],
  userMessage: string, signal: AbortSignal,
): Promise<ProviderResult> {
  return provider === 'anthropic'
    ? callAnthropic(systemPrompt, history, userMessage, signal)
    : callOpenAI(systemPrompt, history, userMessage, signal);
}

// ─── Sprint 2: Semantic memory retrieval ─────────────────────────────────────

interface RetrievedMemory {
  title:      string;
  content:    string;
  source:     string;
  tags:       string[];
  similarity: number;
}

async function generateQueryEmbedding(query: string): Promise<number[] | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body:   JSON.stringify({ model: EMBEDDING_MODEL, input: query.slice(0, 2000), dimensions: EMBEDDING_DIMS }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
async function retrieveRelevantMemories(adminClient: any, userId: string, query: string): Promise<RetrievedMemory[]> {
  if (!adminClient) return [];
  const embedding = await generateQueryEmbedding(query);
  if (!embedding) return [];

  try {
    const { data, error } = await adminClient.rpc('search_memories', {
      query_embedding:  JSON.stringify(embedding),
      user_id_param:    userId,
      match_threshold:  0.65,
      match_count:      8,
    });
    if (error) {
      console.warn('[ai-chat] search_memories RPC error:', error.message);
      return [];
    }
    return (data as Array<{ title: string; content: string; source: string; tags: string[]; similarity: number }>) ?? [];
  } catch (err) {
    console.warn('[ai-chat] semantic search failed:', err);
    return [];
  }
}

// ─── Quota + entitlement ──────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function getUserTierId(adminClient: any | null, userId: string): Promise<string> {
  if (!adminClient) return 'free';
  try {
    const { data, error } = await adminClient.from('ai_user_tier').select('tier_id').eq('user_id', userId).single();
    if (error) return 'free';
    return (data as { tier_id: string })?.tier_id ?? 'free';
  } catch { return 'free'; }
}

const PRO_ONLY_ACTIONS = new Set(['monthly_review', 'weekly_plan', 'weekly_review']);

// deno-lint-ignore no-explicit-any
async function checkQuota(adminClient: any | null, userId: string, tierId: string) {
  if (!adminClient) return { exceeded: false, tokensUsed: 0, tokenBudget: 0 };
  try {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const { data: rows, error: usageErr } = await adminClient.from('ai_usage_log').select('total_tokens').eq('user_id', userId).gte('created_at', periodStart);
    if (usageErr) return { exceeded: false, tokensUsed: 0, tokenBudget: 0 };
    const tokensUsed = (rows as { total_tokens: number }[]).reduce((s, r) => s + (r.total_tokens ?? 0), 0);
    const { data: tier, error: tierErr } = await adminClient.from('ai_plan_tiers').select('monthly_token_budget').eq('id', tierId).single();
    if (tierErr) return { exceeded: false, tokensUsed: 0, tokenBudget: 0 };
    const tokenBudget = (tier as { monthly_token_budget: number }).monthly_token_budget;
    return { exceeded: tokensUsed >= tokenBudget, tokensUsed, tokenBudget };
  } catch { return { exceeded: false, tokensUsed: 0, tokenBudget: 0 }; }
}

function classifyAction(msg: string): string {
  if (/\b(weekly review|review my week|review this week)\b/i.test(msg)) return 'weekly_review';
  if (/\b(weekly plan|rebuild.*(week|weekly)|plan.*(week|weekly))\b/i.test(msg)) return 'weekly_plan';
  if (/\b(daily plan|plan (for )?today|plan my day|build my day)\b/i.test(msg)) return 'build_day';
  if (/\b(recover|missed.*tasks?|reschedule|get back on track)\b/i.test(msg)) return 'recover_day';
  if (/\b(monthly review|end of month)\b/i.test(msg)) return 'monthly_review';
  return 'chat';
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function errorResponse(message: string, code: ErrorResponse['code'], status: number): Response {
  return new Response(JSON.stringify({ error: message, code } as ErrorResponse), {
    status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function successResponse(content: string, usage?: TokenUsage, action?: ParsedAction | null): Response {
  const body: SuccessResponse = {
    id:        crypto.randomUUID(),
    role:      'assistant',
    content,
    createdAt: new Date().toISOString(),
    ...(usage  && { usage }),
    ...(action && { action }),
  };
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ─── Agent router ─────────────────────────────────────────────────────────────

function buildAgentSystemPrompt(
  agentType:    AgentType,
  ctx:          ChatContext,
  memories:     RetrievedMemory[],
  memoryCtx:    string,
  personalization: string,
  addActions:   boolean,
): string {
  const today    = new Date(ctx.todayDate + 'T00:00:00');
  const dayName  = DAY_NAMES[today.getDay()];
  const focusByTitle: Record<string, number> = {};
  for (const [title, mins] of Object.entries(ctx.focusSummary.weeklyMinsByGoal)) {
    focusByTitle[title] = mins;
  }
  const todaySchedule = ctx.schedule.filter((e) => e.daysOfWeek.includes(today.getDay()));

  let prompt: string;

  switch (agentType) {
    case 'memory':
      prompt = buildMemoryAgentPrompt({
        todayDate: ctx.todayDate,
        retrievedMemories: memories,
        recentReflections: (ctx.reflections ?? []).slice(0, 7).map((r) => ({ date: r.date, content: r.text })),
        goals: ctx.tracks.map((g) => ({ title: g.title, category: g.category })),
      });
      break;

    case 'planning':
      prompt = buildPlanningAgentPrompt({
        todayDate:         ctx.todayDate,
        dayName,
        fixedStart:        ctx.fixedScheduleStart ?? '06:00',
        fixedEnd:          ctx.fixedScheduleEnd   ?? '22:00',
        goals:             ctx.tracks,
        schedule:          todaySchedule.map((e) => ({ title: e.title, start: e.start, end: e.end, location: e.location })),
        focusSummary:      focusByTitle,
        totalWeeklyMins:   ctx.focusSummary.totalWeeklyMins,
        todayPlan:         ctx.todayPlan?.items.filter((i) => i.type !== 'break'),
        goalIntelligence:  ctx.goalIntelligence ?? {},
        mainFocus:         ctx.mainFocus,
      });
      break;

    case 'learning':
      prompt = buildLearningAgentPrompt({
        todayDate:         ctx.todayDate,
        courses:           ctx.courses ?? [],
        exams:             ctx.exams ?? [],
        assignments:       ctx.assignments ?? [],
        studyFocusMins:    Object.entries(focusByTitle).filter(([k]) => k.toLowerCase().includes('study') || (ctx.tracks.find((g) => g.title === k)?.category === 'study')).reduce((s, [, v]) => s + v, 0),
        retrievedMemories: memories,
        readiness:         ctx.courseReadiness ?? [],
        risks:             ctx.academicRisks ?? [],
        topicWeakness:     ctx.topicWeakness ?? [],
      });
      break;

    case 'builder': {
      const projectFocusMins = Object.entries(focusByTitle)
        .filter(([k]) => {
          const goal = ctx.tracks.find((g) => g.title === k);
          return goal?.category === 'career' || k.toLowerCase().includes('project') || k.toLowerCase().includes('build');
        })
        .reduce((s, [, v]) => s + v, 0);
      prompt = buildBuilderAgentPrompt({
        todayDate:           ctx.todayDate,
        projects:            ctx.projects ?? [],
        milestones:          ctx.milestones ?? [],
        projectIntelligence: ctx.projectIntelligence ?? [],
        projectRisks:        ctx.projectRisks ?? [],
        focusMinsOnProjects: projectFocusMins,
        retrievedMemories:   memories,
      });
      break;
    }

    case 'productivity':
      prompt = buildProductivityAgentPrompt({
        todayDate:         ctx.todayDate,
        energyStyle:       ctx.energyStyle,
        workStyle:         ctx.workStyle,
        mainFocus:         ctx.mainFocus,
        biggestDistraction: ctx.biggestDistraction,
        distractionCount:  ctx.distractionCount ?? 0,
        focusMinsByDay:    {},
        totalWeeklyMins:   ctx.focusSummary.totalWeeklyMins,
        currentStreak:     0,
        rules:             ctx.rules ?? [],
        retrievedMemories: memories,
      });
      break;

    default: // 'life'
      prompt = buildLifeAgentPrompt({
        todayDate:         ctx.todayDate,
        dayName,
        mainFocus:         ctx.mainFocus,
        biggestDistraction: ctx.biggestDistraction,
        goals:             ctx.tracks,
        focusSummary:      focusByTitle,
        totalWeeklyMins:   ctx.focusSummary.totalWeeklyMins,
        distractionCount:  ctx.distractionCount ?? 0,
        retrievedMemories: memories,
        memoryContext:     memoryCtx,
        personalization,
      });
      break;
  }

  // Sprint 4: inject action capability when relevant
  if (addActions) {
    prompt += '\n' + buildActionInstructions();
  }

  return prompt;
}

// ─── Legacy prompt (kept for weekly_review / recover_day paths) ───────────────

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function energyLabel(startMin: number): string {
  const h = Math.floor(startMin / 60);
  if (h < 12) return 'HIGH — deep work recommended';
  if (h < 17) return 'MEDIUM — practice & review';
  return 'LOW — light tasks & reflection';
}

function buildLegacySystemPrompt(ctx: ChatContext, memoryContext = '', personalizationLayer = ''): string {
  const today    = new Date(ctx.todayDate + 'T00:00:00');
  const dayName  = DAY_NAMES[today.getDay()];
  const dow      = today.getDay();

  const trackLines = ctx.tracks.length
    ? [...ctx.tracks].sort((a, b) => a.priority - b.priority)
        .map((g, i) => `${i + 1}. ${g.title} (${g.category}, ${g.weeklyHoursTarget}h/week, priority ${g.priority})`).join('\n')
    : 'None set.';

  const todayEvents = ctx.schedule.filter((e) => e.daysOfWeek.includes(dow)).sort((a, b) => a.start.localeCompare(b.start));
  const scheduleLines = todayEvents.length
    ? todayEvents.map((e) => `• ${e.start}–${e.end}  ${e.title}${e.location ? ` @ ${e.location}` : ''}`).join('\n')
    : '• No fixed events today.';

  const windowStart     = ctx.fixedScheduleStart ?? '06:00';
  const windowEnd       = ctx.fixedScheduleEnd   ?? '22:00';
  const windowStartMins = timeToMins(windowStart);
  const windowEndMins   = timeToMins(windowEnd);

  const busySlots = todayEvents.map((e) => ({ start: timeToMins(e.start), end: timeToMins(e.end) }));
  const freeLines: string[] = [];
  let cursor = windowStartMins;
  for (const slot of busySlots.sort((a, b) => a.start - b.start)) {
    if (cursor < slot.start) {
      const dur = slot.start - cursor;
      const hint = dur < 30 ? 'light task only' : dur >= 45 ? 'deep work eligible' : 'short practice';
      const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
      freeLines.push(`• ${fmt(cursor)}–${fmt(slot.start)} (${dur} min) · ${energyLabel(cursor)} · ${hint}`);
    }
    cursor = Math.max(cursor, slot.end);
  }
  if (cursor < windowEndMins) {
    const dur = windowEndMins - cursor;
    const hint = dur < 30 ? 'light task only' : dur >= 45 ? 'deep work eligible' : 'short practice';
    const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
    freeLines.push(`• ${fmt(cursor)}–${fmt(windowEndMins)} (${dur} min) · ${energyLabel(cursor)} · ${hint}`);
  }

  const focusLines = Object.keys(ctx.focusSummary.weeklyMinsByGoal).length
    ? Object.entries(ctx.focusSummary.weeklyMinsByGoal).map(([id, mins]) => {
        const track = ctx.tracks.find((g) => g.title === id) ?? { title: id, weeklyHoursTarget: 0 };
        const pct = track.weeklyHoursTarget > 0 ? Math.round((mins / (track.weeklyHoursTarget * 60)) * 100) : 0;
        return `• ${track.title}: ${Math.round(mins)} min (${pct}% of target)`;
      }).join('\n')
    : '• No focus sessions this week.';

  const planSection = ctx.todayPlan
    ? ctx.todayPlan.items.filter((i) => i.type !== 'break')
        .map((i) => `• ${i.startTime}–${i.endTime}  ${i.title}${i.completed ? ' ✓' : ''}`).join('\n')
      || '• No work items in today\'s plan.'
    : '• No plan generated yet.';

  const totalH = Math.round(ctx.focusSummary.totalWeeklyMins / 6) / 10;

  return `You are the planning engine of LifeOS — an AI-powered personal operating system.
${personalizationLayer ? '\n' + personalizationLayer + '\n' : ''}
TODAY: ${dayName}, ${ctx.todayDate}
PLANNING WINDOW: ${windowStart}–${windowEnd}
MAIN FOCUS: ${ctx.mainFocus ?? 'Not specified'}
BIGGEST DISTRACTION: ${ctx.biggestDistraction ?? 'Not specified'}

═══ ACTIVE TRACKS / GOALS ═══
${trackLines}

═══ FIXED SCHEDULE TODAY ═══
${scheduleLines}

═══ AVAILABLE FREE TIME ═══
${freeLines.join('\n') || '• No free time — fully blocked.'}

═══ ENERGY PATTERN ═══
• 06:00–12:00 → HIGH focus
• 12:00–17:00 → MEDIUM
• 17:00–22:00 → LOW

═══ FOCUS SESSIONS THIS WEEK ═══
${focusLines}
Total: ~${totalH}h

═══ TODAY'S CURRENT PLAN ═══
${planSection}${memoryContext ? '\n\n' + memoryContext : ''}

═══ COACHING RULES ═══
1. Never stack deep work back-to-back. 2. Prioritise highest-priority goals in peak slots.
3. < 30 min free → light tasks only. ≥ 45 min → deep work eligible.
4. Recovery: reschedule pragmatically, no guilt. 5. Keep replies ≤ 3 short paragraphs.
6. No preamble — lead with the answer.`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 'invalid_request', 405);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return errorResponse('Authentication required', 'auth_required', 401);

  const supabaseUrl     = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return errorResponse('Server misconfigured', 'provider_error', 500);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse('Invalid or expired token', 'auth_required', 401);

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: RequestBody;
  try { body = await req.json() as RequestBody; } catch { return errorResponse('Invalid JSON body', 'invalid_request', 400); }

  const { message, history = [], context, agentType = 'life' } = body;

  if (!message?.trim()) return errorResponse('message is required', 'invalid_request', 400);
  if (!context || typeof context !== 'object') return errorResponse('context is required', 'invalid_request', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(context.todayDate ?? '')) {
    return errorResponse('context.todayDate must be YYYY-MM-DD', 'invalid_request', 400);
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const adminClient    = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
  const provider       = resolveProvider();

  // ── Parallel: preferences, tier, semantic memories ────────────────────────
  const [memoryRecords, tierId, retrievedMemories] = await Promise.all([
    fetchUserMemory(adminClient, user.id),
    getUserTierId(adminClient, user.id),
    retrieveRelevantMemories(adminClient, user.id, message),
  ]);

  const memoryContext        = buildMemoryContext(memoryRecords);
  const personalizationLayer = buildPersonalizationInstructions(memoryRecords);

  // ── Classify + entitlement ────────────────────────────────────────────────
  const action      = classifyAction(message);
  const entitlement = PRO_ONLY_ACTIONS.has(action) && tierId === 'free'
    ? { allowed: false }
    : { allowed: true };
  if (!entitlement.allowed) return errorResponse('This feature requires a Pro subscription', 'action_not_entitled', 403);

  // ── Quota ─────────────────────────────────────────────────────────────────
  const quota = await checkQuota(adminClient, user.id, tierId);
  if (quota.exceeded) return errorResponse('Monthly AI credits exhausted', 'quota_exceeded', 429);

  // ── Build system prompt ───────────────────────────────────────────────────
  let systemPrompt: string;
  const addActionInstructions = isActionRequest(message);

  if (action === 'weekly_review') {
    const weeklyData = await gatherWeeklyData(adminClient, user.id, context.todayDate);
    systemPrompt = buildWeeklyReviewSystemPrompt(context as any, weeklyData, memoryContext, personalizationLayer);
  } else if (action === 'recover_day') {
    const recoveryData = await gatherRecoveryData(adminClient, user.id, context.todayDate);
    systemPrompt = buildRecoverySystemPrompt(context as any, recoveryData, memoryContext, personalizationLayer);
  } else {
    // Sprint 3: true agent routing
    systemPrompt = buildAgentSystemPrompt(
      agentType as AgentType,
      context,
      retrievedMemories,
      memoryContext,
      personalizationLayer,
      addActionInstructions,
    );
  }

  // ── LLM call ──────────────────────────────────────────────────────────────
  const controller   = new AbortController();
  const timer        = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const requestStart = Date.now();

  try {
    const { content: rawContent, usage } = await callProvider(provider, systemPrompt, history, message, controller.signal);
    clearTimeout(timer);

    if (!rawContent.trim()) return errorResponse('Empty response from AI provider', 'provider_error', 502);

    // Sprint 4: parse action block out of response
    const { displayText, action: parsedAction } = parseActionFromResponse(rawContent);

    // ── Fire-and-forget usage log ────────────────────────────────────────
    if (adminClient) {
      const modelName = provider === 'anthropic' ? ANTHROPIC_MODEL : OPENAI_MODEL;
      adminClient.from('ai_usage_log').insert({
        user_id:           user.id,
        provider,
        model:             modelName,
        prompt_tokens:     usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens:      usage.totalTokens,
        action,
        latency_ms:        Date.now() - requestStart,
      }).then(({ error }: { error: { message: string } | null }) => {
        if (error) console.error('[ai-chat] usage log failed:', error.message);
      });
    }

    return successResponse(displayText, usage, parsedAction);
  } catch (err: unknown) {
    clearTimeout(timer);
    const name = err instanceof Error ? err.name : '';
    const msg  = err instanceof Error ? err.message : String(err);
    if (name === 'AbortError' || msg.includes('AbortError') || msg.toLowerCase().includes('aborted')) {
      return errorResponse('AI provider timed out', 'timeout', 504);
    }
    console.error(`[ai-chat] provider=${provider} error:`, msg);
    return errorResponse(`Provider error: ${msg}`, 'provider_error', 502);
  }
});
