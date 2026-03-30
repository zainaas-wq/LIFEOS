/**
 * LifeOS — ai-chat Edge Function  (Batch 11: credit-aware multimodal gateway)
 *
 * POST /functions/v1/ai-chat
 * Authorization: Bearer <supabase-jwt>
 *
 * Request modes:
 *   text  (default) — { message, history, context }                        cost = 1 credit
 *   voice           — { voice_data: base64, voice_mime, history, context }  cost = 2 credits
 *   image           — { image_data: base64, message?, context }              cost = 3 credits
 *
 * Response: { id, role, content, createdAt, credits_remaining } | { error, code }
 *
 * Credit flow (server-authoritative, never trusted from client):
 *   1. Resolve tier from ai_user_tier
 *   2. Call consume_ai_credits PG function — bootstraps row, handles refill, deducts atomically
 *   3. On provider failure → call refund_ai_credits
 *   4. Log usage to ai_usage_log (request_mode + credits_used)
 *
 * Provider routing (Supabase secret AI_PROVIDER):
 *   "openai"    → OpenAI gpt-4o-mini / whisper-1 / gpt-4o (vision)   (default)
 *   "anthropic" → Anthropic claude-haiku-4-5-20251001 (text only)
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

// ─── Credit costs (server-authoritative) ─────────────────────────────────────

const CREDIT_COSTS = {
  text:  1,
  voice: 2,
  image: 3,
} as const;

type RequestMode = keyof typeof CREDIT_COSTS;

const TIER_ALLOWANCE: Record<string, number> = {
  free: 20,
  pro:  1000,
  max:  1000,
};

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
  // Text mode
  message?: string;
  history?: HistoryMessage[];
  context?: ChatContext;
  // Voice mode
  voice_data?: string;  // base64-encoded audio
  voice_mime?: string;  // e.g. 'audio/m4a', 'audio/webm'
  // Image mode
  image_data?: string;  // base64-encoded JPEG/PNG
  // request_mode — defaults to 'text' when absent (backward compat)
  request_mode?: RequestMode;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  provider: ProviderName;
}

interface ProviderResult {
  content: string;
  usage: TokenUsage;
}

interface SuccessResponse {
  id: string;
  role: 'assistant';
  content: string;
  createdAt: string;
  credits_remaining?: number;
  usage?: TokenUsage;
}

interface ErrorResponse {
  error: string;
  code:
    | 'auth_required'
    | 'invalid_request'
    | 'provider_error'
    | 'timeout'
    | 'quota_exceeded'
    | 'action_not_entitled'
    | 'insufficient_credits';
}

// ─── Provider abstraction ─────────────────────────────────────────────────────

type ProviderName = 'openai' | 'anthropic';

function resolveProvider(): ProviderName {
  const raw = (Deno.env.get('AI_PROVIDER') ?? '').trim().toLowerCase();
  if (raw === 'anthropic') return 'anthropic';
  if (raw !== '' && raw !== 'openai') {
    console.warn(`[ai-chat] Unknown AI_PROVIDER value "${raw}" — falling back to openai`);
  }
  return 'openai';
}

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

const TIMEOUT_MS      = 25_000;
const MAX_TOKENS      = 1024;
const MAX_IMG_TOKENS  = 1024;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const OPENAI_MODEL        = 'gpt-4o-mini';
const OPENAI_VISION_MODEL = 'gpt-4o';
const OPENAI_AUDIO_MODEL  = 'whisper-1';
const ANTHROPIC_MODEL     = 'claude-haiku-4-5-20251001';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

// ─── System prompt ────────────────────────────────────────────────────────────

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
  const today   = new Date(ctx.todayDate + 'T00:00:00');
  const dow     = today.getDay();
  const dayName = DAY_NAMES[dow];

  const trackLines = ctx.tracks.length
    ? [...ctx.tracks]
        .sort((a, b) => a.priority - b.priority)
        .map((g, i) => `${i + 1}. ${g.title} (${g.category}, ${g.weeklyHoursTarget}h/week, priority ${g.priority})`)
        .join('\n')
    : 'None set yet.';

  const todayEvents = ctx.schedule
    .filter((e) => e.daysOfWeek.includes(dow))
    .sort((a, b) => a.start.localeCompare(b.start));
  const scheduleLines = todayEvents.length
    ? todayEvents.map((e) => `• ${e.start}–${e.end}  ${e.title}${e.location ? ` @ ${e.location}` : ''}`).join('\n')
    : '• No fixed events today — full day available.';

  const windowStart = ctx.fixedScheduleStart ?? '06:00';
  const windowEnd   = ctx.fixedScheduleEnd   ?? '22:00';
  const windowStartMins = timeToMins(windowStart);
  const windowEndMins   = timeToMins(windowEnd);

  const busySlots = todayEvents.map((e) => ({ start: timeToMins(e.start), end: timeToMins(e.end) }));
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
  const freeSection = freeLines.length ? freeLines.join('\n') : '• No free time in window — fully blocked.';

  const frictionLines = ctx.frictions.length
    ? ctx.frictions.filter((f) => f.loggedToday > 0).map((f) => `• ${f.label}: ${f.loggedToday} log${f.loggedToday !== 1 ? 's' : ''} today`).join('\n') || '• No distractions logged today.'
    : '• No distraction tracking configured.';

  const totalH = Math.round(ctx.focusSummary.totalWeeklyMins / 6) / 10;
  const focusLines = Object.keys(ctx.focusSummary.weeklyMinsByGoal).length
    ? Object.entries(ctx.focusSummary.weeklyMinsByGoal).map(([id, mins]) => {
        const track = ctx.tracks.find((g) => g.title === id) ?? { title: id, weeklyHoursTarget: 0 };
        const target = track.weeklyHoursTarget * 60;
        const pct = target > 0 ? Math.round((mins / target) * 100) : 0;
        return `• ${track.title}: ${Math.round(mins)} min logged (${pct}% of weekly target)`;
      }).join('\n')
    : '• No focus sessions logged this week.';

  const planSection = ctx.todayPlan
    ? ctx.todayPlan.items.filter((i) => i.type !== 'break').map((i) => `• ${i.startTime}–${i.endTime}  ${i.title}${i.completed ? ' ✓' : ''}`).join('\n') || "• No work items in today's plan."
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

function successResponse(content: string, creditsRemaining?: number, usage?: TokenUsage): Response {
  const body: SuccessResponse = {
    id:        crypto.randomUUID(),
    role:      'assistant',
    content,
    createdAt: new Date().toISOString(),
    ...(creditsRemaining !== undefined && { credits_remaining: creditsRemaining }),
    ...(usage !== undefined && { usage }),
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ─── Provider: OpenAI (text) ──────────────────────────────────────────────────

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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body:   JSON.stringify({ model: OPENAI_MODEL, max_tokens: MAX_TOKENS, messages }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('OpenAI: invalid API key');
    if (res.status === 429) throw new Error('OpenAI: rate limit reached');
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 120)}`);
  }

  const data    = await res.json();
  const content = (data?.choices?.[0]?.message?.content as string) ?? '';
  const usage: TokenUsage = {
    promptTokens:     data?.usage?.prompt_tokens     ?? 0,
    completionTokens: data?.usage?.completion_tokens ?? 0,
    totalTokens:      data?.usage?.total_tokens      ?? 0,
    provider:         'openai',
  };
  return { content, usage };
}

// ─── Provider: OpenAI Vision (image analysis) ────────────────────────────────

async function callOpenAIVision(
  systemPrompt: string,
  userMessage: string,
  imageBase64: string,
  signal: AbortSignal,
): Promise<ProviderResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY secret is not configured');

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userMessage || 'Analyze this image and help me with my planning.' },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'low' },
        },
      ],
    },
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body:   JSON.stringify({ model: OPENAI_VISION_MODEL, max_tokens: MAX_IMG_TOKENS, messages }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('OpenAI Vision: invalid API key');
    if (res.status === 429) throw new Error('OpenAI Vision: rate limit reached');
    throw new Error(`OpenAI Vision error ${res.status}: ${text.slice(0, 120)}`);
  }

  const data    = await res.json();
  const content = (data?.choices?.[0]?.message?.content as string) ?? '';
  const usage: TokenUsage = {
    promptTokens:     data?.usage?.prompt_tokens     ?? 0,
    completionTokens: data?.usage?.completion_tokens ?? 0,
    totalTokens:      data?.usage?.total_tokens      ?? 0,
    provider:         'openai',
  };
  return { content, usage };
}

// ─── Provider: OpenAI Whisper (voice transcription) ──────────────────────────

async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  signal: AbortSignal,
): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY secret is not configured');

  // Decode base64 to binary
  const binary   = atob(audioBase64);
  const bytes    = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const ext      = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
    : mimeType.includes('webm') ? 'webm'
    : mimeType.includes('mp3')  ? 'mp3'
    : 'mp3';

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), `audio.${ext}`);
  form.append('model', OPENAI_AUDIO_MODEL);
  form.append('language', 'en');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body:   form,
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Whisper error ${res.status}: ${text.slice(0, 120)}`);
  }

  const data = await res.json();
  return (data?.text as string) ?? '';
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
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: MAX_TOKENS, system: systemPrompt, messages }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('Anthropic: invalid API key');
    if (res.status === 429) throw new Error('Anthropic: rate limit reached');
    throw new Error(`Anthropic error ${res.status}: ${text.slice(0, 120)}`);
  }

  const data             = await res.json();
  const content          = (data?.content?.[0]?.text as string) ?? '';
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

// ─── Tier resolution ──────────────────────────────────────────────────────────

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

// ─── Credit consumption (replaces token-based quota) ─────────────────────────

interface ConsumeResult {
  success: boolean;
  balanceAfter: number;
  errorCode: string | null;
}

/**
 * Calls consume_ai_credits PG function via service-role client.
 * Fail-open: any DB error returns success=true so infra failures never block users.
 */
async function consumeAICredits(
  // deno-lint-ignore no-explicit-any
  adminClient: any | null,
  userId: string,
  cost: number,
  tierAllowance: number,
): Promise<ConsumeResult> {
  if (!adminClient) {
    console.warn('[ai-chat] no adminClient — skipping credit check (fail-open)');
    return { success: true, balanceAfter: tierAllowance, errorCode: null };
  }
  try {
    const { data, error } = await adminClient.rpc('consume_ai_credits', {
      p_user_id:        userId,
      p_cost:           cost,
      p_tier_allowance: tierAllowance,
    });

    if (error) {
      console.error('[ai-chat] consume_ai_credits RPC error:', error.message);
      return { success: true, balanceAfter: 0, errorCode: null }; // fail-open
    }

    // RPC returns a SETOF with one row
    const row = Array.isArray(data) ? data[0] : data;
    return {
      success:      row?.success      ?? true,
      balanceAfter: row?.balance_after ?? 0,
      errorCode:    row?.error_code    ?? null,
    };
  } catch (err: unknown) {
    console.error('[ai-chat] consumeAICredits threw:', err instanceof Error ? err.message : String(err));
    return { success: true, balanceAfter: 0, errorCode: null }; // fail-open
  }
}

/**
 * Refunds credits on provider failure.
 * Fire-and-forget — errors are logged but not surfaced.
 */
async function refundAICredits(
  // deno-lint-ignore no-explicit-any
  adminClient: any | null,
  userId: string,
  amount: number,
): Promise<void> {
  if (!adminClient || amount <= 0) return;
  try {
    const { error } = await adminClient.rpc('refund_ai_credits', {
      p_user_id: userId,
      p_amount:  amount,
    });
    if (error) console.error('[ai-chat] refund_ai_credits failed:', error.message);
  } catch (err: unknown) {
    console.error('[ai-chat] refundAICredits threw:', err instanceof Error ? err.message : String(err));
  }
}

// ─── Pro-only actions ─────────────────────────────────────────────────────────

const PRO_ONLY_ACTIONS = new Set(['monthly_review', 'weekly_plan', 'weekly_review']);

function validateEntitlement(tierId: string, action: string): boolean {
  if (PRO_ONLY_ACTIONS.has(action) && tierId === 'free') return false;
  return true;
}

// ─── Action classifier ────────────────────────────────────────────────────────

function classifyAction(msg: string): 'chat' | 'build_day' | 'recover_day' | 'monthly_review' | 'weekly_plan' | 'weekly_review' | 'voice_request' | 'image_request' {
  if (/\b(weekly review|review my week|review this week|week.{0,5}review)\b/i.test(msg)) return 'weekly_review';
  if (/\b(weekly plan|rebuild.*(week|weekly)|plan.*(week|weekly)|week.*plan)\b/i.test(msg)) return 'weekly_plan';
  if (/\b(daily plan|plan (for )?today|today.s plan|plan my day|build my day|generate.*day)\b/i.test(msg)) return 'build_day';
  if (/\b(recover|missed.*tasks?|reschedule|get back on track)\b/i.test(msg)) return 'recover_day';
  if (/\b(monthly review|end of month|month review)\b/i.test(msg)) return 'monthly_review';
  return 'chat';
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 'invalid_request', 405);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Authentication required', 'auth_required', 401);
  }

  const supabaseUrl     = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('ANON_KEY');
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

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return errorResponse('Invalid JSON body', 'invalid_request', 400);
  }

  // ── Determine request mode ────────────────────────────────────────────────
  const requestMode: RequestMode = body.image_data
    ? 'image'
    : body.voice_data
    ? 'voice'
    : (body.request_mode ?? 'text');

  // ── Validate required fields by mode ──────────────────────────────────────
  if (requestMode === 'image' && !body.image_data) {
    return errorResponse('image_data is required for image mode', 'invalid_request', 400);
  }
  if (requestMode === 'voice' && !body.voice_data) {
    return errorResponse('voice_data is required for voice mode', 'invalid_request', 400);
  }
  if (requestMode === 'text') {
    const { message, context } = body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return errorResponse('message is required', 'invalid_request', 400);
    }
    if (!context || typeof context !== 'object') {
      return errorResponse('context is required', 'invalid_request', 400);
    }
    if (typeof context.todayDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(context.todayDate)) {
      return errorResponse('context.todayDate must be YYYY-MM-DD', 'invalid_request', 400);
    }
  }

  // ── Admin client ───────────────────────────────────────────────────────────
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
  const adminClient    = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

  // ── Resolve tier ──────────────────────────────────────────────────────────
  const tierId      = await getUserTierId(adminClient, user.id);
  const allowance   = TIER_ALLOWANCE[tierId] ?? 20;
  const creditCost  = CREDIT_COSTS[requestMode];

  // ── Credit check (atomic — consumes if sufficient) ────────────────────────
  const creditResult = await consumeAICredits(adminClient, user.id, creditCost, allowance);
  if (!creditResult.success && creditResult.errorCode === 'insufficient_credits') {
    return errorResponse('Insufficient AI credits', 'insufficient_credits', 402);
  }

  // ── Route to provider ─────────────────────────────────────────────────────
  const provider     = resolveProvider();
  const controller   = new AbortController();
  const timer        = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const requestStart = Date.now();

  let textContent = '';
  let tokenUsage: TokenUsage | undefined;

  try {
    if (requestMode === 'image') {
      // ── Image analysis path ─────────────────────────────────────────────
      const context   = body.context;
      const sysPr     = context ? buildSystemPrompt(context) : 'You are a helpful planning assistant.';
      const userMsg   = (body.message ?? '').trim() || 'Analyze this image and help me with my planning.';
      const { content, usage } = await callOpenAIVision(sysPr, userMsg, body.image_data!, controller.signal);
      clearTimeout(timer);
      textContent = content;
      tokenUsage  = usage;

    } else if (requestMode === 'voice') {
      // ── Voice path: transcribe → text chat ──────────────────────────────
      const transcript = await transcribeAudio(
        body.voice_data!,
        body.voice_mime ?? 'audio/mp3',
        controller.signal,
      );
      if (!transcript.trim()) {
        clearTimeout(timer);
        await refundAICredits(adminClient, user.id, creditCost);
        return errorResponse('Could not transcribe audio', 'provider_error', 502);
      }

      const context      = body.context;
      const history      = body.history ?? [];
      const [memRecs, _tierId2] = await Promise.all([
        fetchUserMemory(adminClient, user.id),
        Promise.resolve(tierId),
      ]);
      const memCtx  = buildMemoryContext(memRecs);
      const persTxt = buildPersonalizationInstructions(memRecs);
      const sysPr   = context ? buildSystemPrompt(context, memCtx, persTxt) : 'You are a helpful planning assistant.';
      const { content, usage } = await callProvider(provider, sysPr, history, transcript, controller.signal);
      clearTimeout(timer);
      textContent = `_Transcribed: "${transcript}"_\n\n${content}`;
      tokenUsage  = usage;

    } else {
      // ── Text path (default) ──────────────────────────────────────────────
      const { message, history = [], context } = body as {
        message: string;
        history: HistoryMessage[];
        context: ChatContext;
      };

      const action = classifyAction(message);

      // Entitlement check (Pro-only actions)
      if (!validateEntitlement(tierId, action)) {
        clearTimeout(timer);
        await refundAICredits(adminClient, user.id, creditCost);
        return errorResponse('This feature requires a Pro subscription', 'action_not_entitled', 403);
      }

      const [memRecs] = await Promise.all([fetchUserMemory(adminClient, user.id)]);
      const memCtx    = buildMemoryContext(memRecs);
      const persTxt   = buildPersonalizationInstructions(memRecs);

      let systemPrompt: string;
      if (action === 'weekly_review') {
        const weeklyData = await gatherWeeklyData(adminClient, user.id, context.todayDate);
        systemPrompt = buildWeeklyReviewSystemPrompt(context, weeklyData, memCtx, persTxt);
      } else if (action === 'recover_day') {
        const recoveryData = await gatherRecoveryData(adminClient, user.id, context.todayDate);
        systemPrompt = buildRecoverySystemPrompt(context, recoveryData, memCtx, persTxt);
      } else {
        systemPrompt = buildSystemPrompt(context, memCtx, persTxt);
      }

      const { content, usage } = await callProvider(provider, systemPrompt, history, message, controller.signal);
      clearTimeout(timer);
      textContent = content;
      tokenUsage  = usage;

      // Log action-specific usage
      if (adminClient) {
        const modelName = provider === 'anthropic' ? ANTHROPIC_MODEL : OPENAI_MODEL;
        adminClient.from('ai_usage_log').insert({
          user_id:           user.id,
          provider,
          model:             modelName,
          prompt_tokens:     tokenUsage?.promptTokens     ?? 0,
          completion_tokens: tokenUsage?.completionTokens ?? 0,
          total_tokens:      tokenUsage?.totalTokens      ?? 0,
          action,
          request_mode:      requestMode,
          credits_used:      creditCost,
          latency_ms:        Date.now() - requestStart,
        }).then(({ error }: { error: { message: string } | null }) => {
          if (error) console.error('[ai-chat] usage log insert failed:', error.message);
        });
      }

      if (!textContent.trim()) {
        await refundAICredits(adminClient, user.id, creditCost);
        return errorResponse('Empty response from AI provider', 'provider_error', 502);
      }

      return successResponse(textContent, creditResult.balanceAfter, tokenUsage);
    }

    // ── Log usage for voice/image paths ──────────────────────────────────
    if (!textContent.trim()) {
      await refundAICredits(adminClient, user.id, creditCost);
      return errorResponse('Empty response from AI provider', 'provider_error', 502);
    }

    if (adminClient) {
      const modelName = requestMode === 'image' ? OPENAI_VISION_MODEL
        : requestMode === 'voice'  ? OPENAI_AUDIO_MODEL
        : provider === 'anthropic' ? ANTHROPIC_MODEL : OPENAI_MODEL;

      adminClient.from('ai_usage_log').insert({
        user_id:           user.id,
        provider:          'openai',
        model:             modelName,
        prompt_tokens:     tokenUsage?.promptTokens     ?? 0,
        completion_tokens: tokenUsage?.completionTokens ?? 0,
        total_tokens:      tokenUsage?.totalTokens      ?? 0,
        action:            requestMode === 'voice' ? 'voice_request' : 'image_request',
        request_mode:      requestMode,
        credits_used:      creditCost,
        latency_ms:        Date.now() - requestStart,
      }).then(({ error }: { error: { message: string } | null }) => {
        if (error) console.error('[ai-chat] usage log insert failed:', error.message);
      });
    }

    return successResponse(textContent, creditResult.balanceAfter, tokenUsage);

  } catch (err: unknown) {
    clearTimeout(timer);
    // Refund credits — provider failed after deduction
    await refundAICredits(adminClient, user.id, creditCost);

    const name = err instanceof Error ? err.name : '';
    const msg  = err instanceof Error ? err.message : String(err);

    if (name === 'AbortError' || msg.includes('AbortError') || msg.toLowerCase().includes('aborted')) {
      return errorResponse('AI provider timed out', 'timeout', 504);
    }
    console.error(`[ai-chat] provider=${provider} mode=${requestMode} error:`, msg);
    return errorResponse(`Provider error: ${msg}`, 'provider_error', 502);
  }
});
