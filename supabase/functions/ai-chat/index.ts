/**
 * LifeOS — ai-chat Edge Function
 *
 * POST /functions/v1/ai-chat
 * Authorization: Bearer <supabase-jwt>
 *
 * Body:     { message, history, context }
 * Response: { id, role, content, createdAt } | { error, code }
 *
 * Provider routing (Supabase secret AI_PROVIDER):
 *   "openai"    → OpenAI gpt-4o-mini          (default)
 *   "anthropic" → Anthropic claude-haiku-4-5-20251001
 *   <unknown>   → warns to console, falls back to openai
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrackItem {
  title: string;
  category: string;
  weeklyHoursTarget: number;
  priority: number;
}

interface ScheduleItem {
  title: string;
  start: string;
  end: string;
  daysOfWeek: number[];
  location?: string;
}

interface FrictionItem {
  type: string;
  label: string;
  loggedToday: number;
}

interface PlanItem {
  startTime: string;
  endTime: string;
  title: string;
  type: string;
  completed?: boolean;
}

interface ChatContext {
  todayDate: string;
  mainFocus?: string;
  biggestDistraction?: string;
  fixedScheduleStart?: string;
  fixedScheduleEnd?: string;
  tracks: TrackItem[];
  schedule: ScheduleItem[];
  frictions: FrictionItem[];
  focusSummary: {
    weeklyMinsByGoal: Record<string, number>;
    totalWeeklyMins: number;
  };
  todayPlan?: {
    date: string;
    items: PlanItem[];
  };
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  message: string;
  history: HistoryMessage[];
  context: ChatContext;
}

// Token usage as returned by the provider — measurement layer, not user-facing.
// Used internally for usage logging (Block B) and credit deduction (Block C).
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  provider: ProviderName;
}

// Internal return type of every provider call.
interface ProviderResult {
  content: string;
  usage: TokenUsage;
}

interface SuccessResponse {
  id: string;
  role: 'assistant';
  content: string;
  createdAt: string;
  // Optional — present on every successful call once the provider returns usage data.
  // Clients that do not read this field are unaffected (backward-compatible).
  usage?: TokenUsage;
}

interface ErrorResponse {
  error: string;
  code: 'auth_required' | 'invalid_request' | 'provider_error' | 'timeout' | 'quota_exceeded' | 'action_not_entitled';
}

// ─── Provider abstraction ─────────────────────────────────────────────────────

type ProviderName = 'openai' | 'anthropic';

/**
 * Reads AI_PROVIDER, validates it, and returns the canonical provider name.
 * Falls back to 'openai' for any unknown/missing value, with a console warning.
 */
function resolveProvider(): ProviderName {
  const raw = (Deno.env.get('AI_PROVIDER') ?? '').trim().toLowerCase();
  if (raw === 'anthropic') return 'anthropic';
  if (raw !== '' && raw !== 'openai') {
    console.warn(`[ai-chat] Unknown AI_PROVIDER value "${raw}" — falling back to openai`);
  }
  return 'openai';
}

/**
 * Dispatches to the correct provider function.
 * Both providers return ProviderResult { content, usage }.
 * The shared response contract is assembled by the caller.
 */
async function callProvider(
  provider: ProviderName,
  systemPrompt: string,
  history: HistoryMessage[],
  userMessage: string,
  signal: AbortSignal,
): Promise<ProviderResult> {
  if (provider === 'anthropic') {
    return callAnthropic(systemPrompt, history, userMessage, signal);
  }
  return callOpenAI(systemPrompt, history, userMessage, signal);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 25_000;
const MAX_TOKENS = 1024;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const OPENAI_MODEL    = 'gpt-4o-mini';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

// Applied to every response so cross-origin fetches from the app always work.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

// ─── System prompt (server-side only) ────────────────────────────────────────

function energyLabel(startMin: number): string {
  const h = Math.floor(startMin / 60);
  if (h < 12) return 'HIGH — deep work recommended';
  if (h < 17) return 'MEDIUM — practice & review';
  return 'LOW — light tasks & reflection';
}

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function buildSystemPrompt(ctx: ChatContext, memoryContext = '', personalizationLayer = ''): string {
  const today = new Date(ctx.todayDate + 'T00:00:00');
  const dow = today.getDay();
  const dayName = DAY_NAMES[dow];

  // Tracks (goals)
  const trackLines = ctx.tracks.length
    ? [...ctx.tracks]
        .sort((a, b) => a.priority - b.priority)
        .map(
          (g, i) =>
            `${i + 1}. ${g.title} (${g.category}, ${g.weeklyHoursTarget}h/week, priority ${g.priority})`,
        )
        .join('\n')
    : 'None set yet.';

  // Today's schedule events
  const todayEvents = ctx.schedule
    .filter((e) => e.daysOfWeek.includes(dow))
    .sort((a, b) => a.start.localeCompare(b.start));
  const scheduleLines = todayEvents.length
    ? todayEvents
        .map((e) => `• ${e.start}–${e.end}  ${e.title}${e.location ? ` @ ${e.location}` : ''}`)
        .join('\n')
    : '• No fixed events today — full day available.';

  // Fixed planning window
  const windowStart = ctx.fixedScheduleStart ?? '06:00';
  const windowEnd   = ctx.fixedScheduleEnd   ?? '22:00';
  const windowStartMins = timeToMins(windowStart);
  const windowEndMins   = timeToMins(windowEnd);

  // Free time (naive: full window minus scheduled events)
  const busySlots = todayEvents.map((e) => ({
    start: timeToMins(e.start),
    end:   timeToMins(e.end),
  }));
  const freeLines: string[] = [];
  let cursor = windowStartMins;
  for (const slot of busySlots.sort((a, b) => a.start - b.start)) {
    if (cursor < slot.start) {
      const dur  = slot.start - cursor;
      const hint = dur < 30 ? 'light task only' : dur >= 45 ? 'deep work eligible' : 'short practice';
      freeLines.push(
        `• ${Math.floor(cursor / 60).toString().padStart(2, '0')}:${(cursor % 60).toString().padStart(2, '0')}–` +
        `${Math.floor(slot.start / 60).toString().padStart(2, '0')}:${(slot.start % 60).toString().padStart(2, '0')}` +
        ` (${dur} min) · ${energyLabel(cursor)} · ${hint}`,
      );
    }
    cursor = Math.max(cursor, slot.end);
  }
  if (cursor < windowEndMins) {
    const dur  = windowEndMins - cursor;
    const hint = dur < 30 ? 'light task only' : dur >= 45 ? 'deep work eligible' : 'short practice';
    freeLines.push(
      `• ${Math.floor(cursor / 60).toString().padStart(2, '0')}:${(cursor % 60).toString().padStart(2, '0')}–` +
      `${Math.floor(windowEndMins / 60).toString().padStart(2, '0')}:${(windowEndMins % 60).toString().padStart(2, '0')}` +
      ` (${dur} min) · ${energyLabel(cursor)} · ${hint}`,
    );
  }
  const freeSection = freeLines.length
    ? freeLines.join('\n')
    : '• No free time in window — fully blocked.';

  // Frictions with today's count
  const frictionLines = ctx.frictions.length
    ? ctx.frictions
        .filter((f) => f.loggedToday > 0)
        .map((f) => `• ${f.label}: ${f.loggedToday} log${f.loggedToday !== 1 ? 's' : ''} today`)
        .join('\n') || '• No distractions logged today.'
    : '• No distraction tracking configured.';

  // Focus summary
  const totalH = Math.round(ctx.focusSummary.totalWeeklyMins / 6) / 10;
  const focusLines =
    Object.keys(ctx.focusSummary.weeklyMinsByGoal).length
      ? Object.entries(ctx.focusSummary.weeklyMinsByGoal)
          .map(([id, mins]) => {
            const track = ctx.tracks.find((g) => g.title === id) ?? { title: id, weeklyHoursTarget: 0 };
            const target = track.weeklyHoursTarget * 60;
            const pct = target > 0 ? Math.round((mins / target) * 100) : 0;
            return `• ${track.title}: ${Math.round(mins)} min logged (${pct}% of weekly target)`;
          })
          .join('\n')
      : '• No focus sessions logged this week.';

  // Today's plan (if available)
  const planSection = ctx.todayPlan
    ? ctx.todayPlan.items
        .filter((i) => i.type !== 'break')
        .map((i) => `• ${i.startTime}–${i.endTime}  ${i.title}${i.completed ? ' ✓' : ''}`)
        .join('\n') || "• No work items in today's plan."
    : '• No plan generated yet for today.';

  return `You are the planning engine of LifeOS — an AI-powered personal operating system.
Your role is personal strategist and coach, not a simple scheduler.
Think about energy, priorities, human limits, and long-term consistency.
${personalizationLayer ? '\n' + personalizationLayer + '\n' : ''}
TODAY: ${dayName}, ${ctx.todayDate}
PLANNING WINDOW: ${windowStart}–${windowEnd}
MAIN FOCUS: ${ctx.mainFocus ?? 'Not specified'}
BIGGEST DISTRACTION: ${ctx.biggestDistraction ?? 'Not specified'}

═══ ACTIVE TRACKS / GOALS (ranked by priority) ═══
${trackLines}

═══ FIXED SCHEDULE TODAY ═══
${scheduleLines}

═══ AVAILABLE FREE TIME ═══
${freeSection}

═══ ENERGY PATTERN ═══
• 06:00–12:00 → HIGH focus (deep work, hard problems, new learning)
• 12:00–17:00 → MEDIUM (practice, review, light meetings)
• 17:00–22:00 → LOW (light reading, reflection, admin)

═══ DISTRACTION LOG (today) ═══
${frictionLines}

═══ FOCUS SESSIONS THIS WEEK ═══
${focusLines}
Total: ~${totalH}h logged this week

═══ TODAY'S CURRENT PLAN ═══
${planSection}${memoryContext ? '\n\n' + memoryContext : ''}

═══ COACHING RULES ═══
1. Never stack deep work back-to-back — suggest 10–15 min breaks between blocks.
2. Prioritise highest-priority goals in the earliest high-energy free slots.
3. Free blocks < 30 min → suggest light tasks (review, reading) only.
4. Free blocks ≥ 45 min → suggest focused 45–90 min deep work sessions.
5. If asked about distractions, be specific and tactical — not generic.
6. If asked to recover a missed day, reschedule pragmatically, no guilt.
7. End-of-day advice should always include a reflection prompt.
8. Keep replies concise: ≤ 3 short paragraphs unless generating a full plan.
9. No preamble — lead with the answer or action.`;
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function errorResponse(message: string, code: ErrorResponse['code'], status: number): Response {
  const body: ErrorResponse = { error: message, code };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function successResponse(content: string, usage?: TokenUsage): Response {
  const body: SuccessResponse = {
    id:        crypto.randomUUID(),
    role:      'assistant',
    content,
    createdAt: new Date().toISOString(),
    ...(usage !== undefined && { usage }),
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ─── Provider: OpenAI ─────────────────────────────────────────────────────────

async function callOpenAI(
  systemPrompt: string,
  history: HistoryMessage[],
  userMessage: string,
  signal: AbortSignal,
): Promise<ProviderResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY secret is not configured');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${apiKey}`,
    },
    body:   JSON.stringify({ model: OPENAI_MODEL, max_tokens: MAX_TOKENS, messages }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('OpenAI: invalid API key');
    if (res.status === 429) throw new Error('OpenAI: rate limit reached');
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 120)}`);
  }

  const data = await res.json();
  const content = (data?.choices?.[0]?.message?.content as string) ?? '';
  const usage: TokenUsage = {
    promptTokens:     data?.usage?.prompt_tokens     ?? 0,
    completionTokens: data?.usage?.completion_tokens ?? 0,
    totalTokens:      data?.usage?.total_tokens      ?? 0,
    provider:         'openai',
  };
  return { content, usage };
}

// ─── Provider: Anthropic ──────────────────────────────────────────────────────

async function callAnthropic(
  systemPrompt: string,
  history: HistoryMessage[],
  userMessage: string,
  signal: AbortSignal,
): Promise<ProviderResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY secret is not configured');

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('Anthropic: invalid API key');
    if (res.status === 429) throw new Error('Anthropic: rate limit reached');
    throw new Error(`Anthropic error ${res.status}: ${text.slice(0, 120)}`);
  }

  const data = await res.json();
  const content = (data?.content?.[0]?.text as string) ?? '';
  // Anthropic returns input_tokens / output_tokens (no total — we compute it)
  const promptTokens     = data?.usage?.input_tokens  ?? 0;
  const completionTokens = data?.usage?.output_tokens ?? 0;
  const usage: TokenUsage = {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    provider:    'anthropic',
  };
  return { content, usage };
}

// ─── Quota check ──────────────────────────────────────────────────────────────

interface QuotaResult {
  exceeded: boolean;
  tokensUsed: number;
  tokenBudget: number;
}

/**
 * Resolves the tier ID for a user from ai_user_tier.
 *
 * Fail-open: returns 'free' on any DB error or missing row so an
 * infrastructure failure never blocks the user.
 */
async function getUserTierId(
  // deno-lint-ignore no-explicit-any
  adminClient: any | null,
  userId: string,
): Promise<string> {
  if (!adminClient) return 'free';
  try {
    const { data, error } = await adminClient
      .from('ai_user_tier')
      .select('tier_id')
      .eq('user_id', userId)
      .single();

    if (error) {
      // PGRST116 = "no rows" — pre-migration user or trigger failure; default to free.
      if (error.code !== 'PGRST116') {
        console.error('[ai-chat] getUserTierId failed:', error.message);
      } else {
        console.warn('[ai-chat] no tier row for user', userId, '— defaulting to free');
      }
      return 'free';
    }
    return (data as { tier_id: string })?.tier_id ?? 'free';
  } catch (err: unknown) {
    console.error('[ai-chat] getUserTierId threw:', err instanceof Error ? err.message : String(err));
    return 'free';
  }
}

// ─── Pro-only actions ─────────────────────────────────────────────────────────

const PRO_ONLY_ACTIONS = new Set(['monthly_review', 'weekly_plan', 'weekly_review']);

interface EntitlementResult {
  allowed: boolean;
}

/**
 * Returns { allowed: false } if a Free user attempts a Pro-only action.
 * Pure sync — no DB queries.
 */
function validateEntitlement(tierId: string, action: string): EntitlementResult {
  if (PRO_ONLY_ACTIONS.has(action) && tierId === 'free') {
    return { allowed: false };
  }
  return { allowed: true };
}

// ─── Quota check ──────────────────────────────────────────────────────────────

/**
 * Checks whether the user has exhausted their monthly token budget.
 *
 * Billing period = UTC midnight on the 1st of the current month.
 * tierId must be pre-resolved by the caller (via getUserTierId) so this
 * function makes exactly 2 DB queries: usage sum + tier budget.
 *
 * Fail-open: any DB error returns { exceeded: false } so an infrastructure
 * failure never blocks the user.
 */
async function checkQuota(
  // deno-lint-ignore no-explicit-any
  adminClient: any | null,
  userId: string,
  tierId: string,
): Promise<QuotaResult> {
  if (!adminClient) return { exceeded: false, tokensUsed: 0, tokenBudget: 0 };

  try {
    const now = new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();

    // ── 1. Sum this month's token usage ────────────────────────────────────
    const { data: rows, error: usageErr } = await adminClient
      .from('ai_usage_log')
      .select('total_tokens')
      .eq('user_id', userId)
      .gte('created_at', periodStart);

    if (usageErr) {
      console.error('[ai-chat] quota usage query failed:', usageErr.message);
      return { exceeded: false, tokensUsed: 0, tokenBudget: 0 };
    }

    const tokensUsed = (rows as { total_tokens: number }[])
      .reduce((sum, r) => sum + (r.total_tokens ?? 0), 0);

    // ── 2. Get budget for this tier (tierId resolved by caller) ───────────
    const { data: tier, error: tierErr } = await adminClient
      .from('ai_plan_tiers')
      .select('monthly_token_budget')
      .eq('id', tierId)
      .single();

    if (tierErr) {
      console.error('[ai-chat] plan tier query failed:', tierErr.message);
      return { exceeded: false, tokensUsed: 0, tokenBudget: 0 };
    }

    const tokenBudget = (tier as { monthly_token_budget: number }).monthly_token_budget;
    return { exceeded: tokensUsed >= tokenBudget, tokensUsed, tokenBudget };
  } catch (err: unknown) {
    console.error('[ai-chat] checkQuota threw:', err instanceof Error ? err.message : String(err));
    return { exceeded: false, tokensUsed: 0, tokenBudget: 0 };
  }
}

// ─── Action classifier ────────────────────────────────────────────────────────

/**
 * Classifies the user message into one of the defined action types.
 * Used as the `action` field in ai_usage_log for credit weighting later.
 * Defaults to 'chat' for any unrecognised pattern.
 */
function classifyAction(msg: string): 'chat' | 'build_day' | 'recover_day' | 'monthly_review' | 'weekly_plan' | 'weekly_review' {
  if (/\b(weekly review|review my week|review this week|week.{0,5}review)\b/i.test(msg)) return 'weekly_review';
  if (/\b(weekly plan|rebuild.*(week|weekly)|plan.*(week|weekly)|week.*plan)\b/i.test(msg)) return 'weekly_plan';
  if (/\b(daily plan|plan (for )?today|today.s plan|plan my day|build my day|generate.*day)\b/i.test(msg)) return 'build_day';
  if (/\b(recover|missed.*tasks?|reschedule|get back on track)\b/i.test(msg)) return 'recover_day';
  if (/\b(monthly review|end of month|month review)\b/i.test(msg)) return 'monthly_review';
  return 'chat';
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 'invalid_request', 405);
  }

  // ── Auth: verify JWT ──────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Authentication required', 'auth_required', 401);
  }

  const supabaseUrl     = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return errorResponse('Server misconfigured', 'provider_error', 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return errorResponse('Invalid or expired token', 'auth_required', 401);
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return errorResponse('Invalid JSON body', 'invalid_request', 400);
  }

  const { message, history = [], context } = body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return errorResponse('message is required', 'invalid_request', 400);
  }
  if (!context || typeof context !== 'object') {
    return errorResponse('context is required', 'invalid_request', 400);
  }

  // Validate todayDate early — a malformed date causes new Date(...) to return
  // Invalid Date, which propagates NaN silently through the entire system prompt
  // (day-of-week = undefined, free-time slots = NaN).  Reject here instead.
  if (
    typeof context.todayDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(context.todayDate)
  ) {
    return errorResponse('context.todayDate must be YYYY-MM-DD', 'invalid_request', 400);
  }

  // ── Admin client (needed for memory fetch, tier resolution, quota, usage log)
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const adminClient    = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

  // ── Fetch user memory + resolve tier in parallel (independent DB lookups) ─
  // Memory is fetched before prompt build so context is available server-side.
  // The client never sends memory; it is always sourced from Supabase directly.
  const [memoryRecords, tierId] = await Promise.all([
    fetchUserMemory(adminClient, user.id),
    getUserTierId(adminClient, user.id),
  ]);
  const memoryContext          = buildMemoryContext(memoryRecords);
  const personalizationLayer   = buildPersonalizationInstructions(memoryRecords);

  // ── Classify action (must precede prompt build — weekly_review uses a different prompt)
  const action   = classifyAction(message);

  // ── Tier resolution ───────────────────────────────────────────────────────
  const provider = resolveProvider();

  // ── Entitlement check ─────────────────────────────────────────────────────
  const entitlement = validateEntitlement(tierId, action);
  if (!entitlement.allowed) {
    return errorResponse('This feature requires a Pro subscription', 'action_not_entitled', 403);
  }

  // ── Quota check ───────────────────────────────────────────────────────────
  const quota = await checkQuota(adminClient, user.id, tierId);
  if (quota.exceeded) {
    return errorResponse('Monthly AI credits exhausted', 'quota_exceeded', 429);
  }

  // ── Build system prompt — path depends on action ──────────────────────────
  let systemPrompt: string;
  if (action === 'weekly_review') {
    const weeklyData = await gatherWeeklyData(adminClient, user.id, context.todayDate);
    systemPrompt = buildWeeklyReviewSystemPrompt(context, weeklyData, memoryContext, personalizationLayer);
  } else if (action === 'recover_day') {
    const recoveryData = await gatherRecoveryData(adminClient, user.id, context.todayDate);
    systemPrompt = buildRecoverySystemPrompt(context, recoveryData, memoryContext, personalizationLayer);
  } else {
    systemPrompt = buildSystemPrompt(context, memoryContext, personalizationLayer);
  }

  const controller     = new AbortController();
  const timer          = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const requestStart   = Date.now();

  try {
    const { content, usage } = await callProvider(provider, systemPrompt, history, message, controller.signal);
    clearTimeout(timer);

    if (!content.trim()) {
      return errorResponse('Empty response from AI provider', 'provider_error', 502);
    }

    // ── Fire-and-forget usage log ─────────────────────────────────────────
    // Uses service role to bypass RLS — user_id comes from verified JWT, not
    // the request body, so records cannot be forged by the client.
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
        if (error) console.error('[ai-chat] usage log insert failed:', error.message);
      });
    } else {
      console.warn('[ai-chat] SUPABASE_SERVICE_ROLE_KEY not set — usage not logged');
    }

    return successResponse(content, usage);
  } catch (err: unknown) {
    clearTimeout(timer);

    const name = err instanceof Error ? err.name : '';
    const msg  = err instanceof Error ? err.message : String(err);

    // AbortError is the standard signal for timeout — check name first,
    // then fall back to message content for runtimes that differ.
    if (name === 'AbortError' || msg.includes('AbortError') || msg.toLowerCase().includes('aborted')) {
      return errorResponse('AI provider timed out', 'timeout', 504);
    }

    console.error(`[ai-chat] provider=${provider} error:`, msg);
    return errorResponse(`Provider error: ${msg}`, 'provider_error', 502);
  }
});
