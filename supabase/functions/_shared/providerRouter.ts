/**
 * providerRouter.ts — Multi-provider AI routing, fallback, and execution.
 *
 * Batch 16 additions on top of Batch 15:
 *   - Per-provider timeout via execWithTimeout (primary / fallback each get a deadline)
 *   - effectiveFallbackMs caps fallback timeout by remaining total budget
 *   - selectProvider now checks providerHealth before committing to a primary;
 *     unhealthy primary is swapped with fallback so healthy providers are preferred
 *   - recordProviderSuccess / recordProviderFailure called after every attempt
 *   - RouteExecutionResult carries timeoutOccurred, failureReason, healthAtSelection
 *   - Throws GatewayError (not plain Error) on total failure, carrying observability fields
 *
 * Credit safety contract (unchanged from Batch 15):
 *   Credits are consumed by index.ts BEFORE calling routeTextRequest().
 *   This module NEVER touches the credit ledger.
 *   If both providers fail → throw GatewayError → index.ts refunds.
 *
 * Routing policy (text mode — voice/image stay on OpenAI):
 *
 *   Mode                  Normal primary   Rationale
 *   ─────────────────────────────────────────────────────────────────────────────
 *   quick_nudge           NIM              Short, action-first — fast + cheap
 *   focused_answer        NIM              Conversational — NIM handles well
 *   recovery_coach        OpenAI           Empathy/nuance — OpenAI quality
 *   strategic_planning    OpenAI           Complex multi-step — OpenAI reasoning
 *   review_reflection     OpenAI           Interpretive analysis — OpenAI quality
 *   (unknown / absent)    OpenAI           Safe quality default
 *
 * Health override:
 *   If the routing-table primary is UNHEALTHY, its fallback is promoted to primary.
 *   FORCE_PROVIDER bypasses the health check entirely (explicit operator intent).
 */

import { OpenAIAdapter } from './providers/openai.ts';
import { NIMAdapter }    from './providers/nim.ts';
import type {
  AIRequestMode,
  GatewayError as IGatewayError,
  HistoryMessage,
  ProviderAdapter,
  ProviderName,
  RouteExecutionResult,
  RoutingDecision,
} from './providers/types.ts';
import { GatewayError } from './providers/types.ts';
import {
  execWithTimeout,
  effectiveFallbackMs,
  DEFAULT_BUDGET,
  TimeoutError,
} from './requestBudget.ts';
import type { RequestBudget } from './requestBudget.ts';
import {
  getHealthSnapshot,
  getProviderHealth,
  recordProviderSuccess,
  recordProviderFailure,
} from './providerHealth.ts';

// ─── Provider singletons ──────────────────────────────────────────────────────

const OPENAI = new OpenAIAdapter();
const NIM    = new NIMAdapter();

const PROVIDERS: Record<ProviderName, ProviderAdapter> = {
  openai: OPENAI,
  nim:    NIM,
};

// ─── Routing table ────────────────────────────────────────────────────────────

const ROUTING_TABLE: Record<AIRequestMode, { primary: ProviderName; reason: string }> = {
  quick_nudge:        { primary: 'nim',    reason: 'short action request — NIM is faster and cheaper' },
  focused_answer:     { primary: 'nim',    reason: 'conversational — NIM handles well at lower cost' },
  recovery_coach:     { primary: 'openai', reason: 'requires empathy and nuance — OpenAI quality' },
  strategic_planning: { primary: 'openai', reason: 'complex multi-step planning — OpenAI reasoning' },
  review_reflection:  { primary: 'openai', reason: 'interpretive analysis of patterns — OpenAI quality' },
};

// ─── selectProvider ───────────────────────────────────────────────────────────

/**
 * Determine primary + fallback provider for a request.
 *
 * Priority order:
 *   1. FORCE_PROVIDER env var  — operator override, bypasses health check
 *   2. Routing table + health  — if table primary is unhealthy, promote fallback
 *   3. Default (OpenAI)        — for unknown or absent aiMode
 */
export function selectProvider(aiMode?: string): RoutingDecision {
  // 1. Env override (bypasses health check — explicit operator intent)
  const force = (Deno.env.get('FORCE_PROVIDER') ?? '').trim().toLowerCase() as ProviderName | '';
  if (force === 'openai' || force === 'nim') {
    const fallback: ProviderName = force === 'openai' ? 'nim' : 'openai';
    return { primary: force, fallback, reason: 'forced by FORCE_PROVIDER env var' };
  }

  // 2. Routing table
  const mode  = aiMode as AIRequestMode | undefined;
  const entry = mode ? ROUTING_TABLE[mode] : undefined;

  let primary: ProviderName  = entry?.primary ?? 'openai';
  let fallback: ProviderName = primary === 'openai' ? 'nim' : 'openai';
  let reason: string         = entry?.reason ?? 'unknown mode — defaulting to OpenAI';

  // 3. Health check — if table primary is unhealthy, promote fallback
  const primaryHealth = getProviderHealth(primary);
  if (primaryHealth === 'unhealthy') {
    console.warn(
      `[providerRouter] primary "${primary}" is UNHEALTHY — promoting "${fallback}" for mode=${aiMode ?? 'unknown'}`,
    );
    return {
      primary:  fallback,
      fallback: primary,
      reason:   `${reason} [primary unhealthy — swapped to ${fallback}]`,
    };
  }

  return { primary, fallback, reason };
}

// ─── routeTextRequest ─────────────────────────────────────────────────────────

/**
 * Execute a text request through the routing + timeout + fallback layer.
 *
 * Flow:
 *   1. Snapshot health state at selection time (for observability)
 *   2. selectProvider(aiMode) → { primary, fallback }
 *   3. execWithTimeout(primary, budget.primaryMs) — TimeoutError on deadline
 *   4. On primary failure (TimeoutError or provider error, NOT AbortError):
 *        a. recordProviderFailure(primary)
 *        b. compute effectiveFallbackMs from remaining budget
 *        c. execWithTimeout(fallback, effectiveFallbackMs)
 *        d. On fallback success: recordProviderSuccess(fallback); return with fallbackOccurred=true
 *        e. On fallback failure: recordProviderFailure(fallback); throw GatewayError
 *   5. Parent AbortError → propagate immediately (no fallback — user cancelled / outer timer)
 *
 * Throws GatewayError on total failure (both providers failed).
 * Never touches the credit ledger.
 */
export async function routeTextRequest(
  systemPrompt: string,
  history:      HistoryMessage[],
  userMessage:  string,
  signal:       AbortSignal,
  aiMode?:      string,
  budget:       RequestBudget = DEFAULT_BUDGET,
): Promise<RouteExecutionResult> {
  const healthAtSelection = getHealthSnapshot();
  const decision          = selectProvider(aiMode);
  const startMs           = Date.now();

  let timeoutOccurred = false;

  // ── Primary attempt ────────────────────────────────────────────────────────
  try {
    const result = await execWithTimeout(
      (s) => PROVIDERS[decision.primary].callText(systemPrompt, history, userMessage, s),
      budget.primaryMs,
      signal,
      decision.primary,
    );
    recordProviderSuccess(decision.primary);
    return {
      result,
      providerSelected:  decision.primary,
      providerUsed:      decision.primary,
      fallbackOccurred:  false,
      latencyMs:         Date.now() - startMs,
      timeoutOccurred:   false,
      failureReason:     null,
      healthAtSelection,
    };
  } catch (primaryErr: unknown) {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    // Parent signal aborted (client cancel or outer 25 s timer) — propagate, do NOT fallback
    if (
      primaryErr instanceof Error &&
      primaryErr.name === 'AbortError'
    ) {
      throw primaryErr;
    }

    if (primaryErr instanceof TimeoutError) {
      timeoutOccurred = true;
    }

    recordProviderFailure(decision.primary);

    console.warn(
      `[providerRouter] primary "${decision.primary}" failed (mode=${aiMode ?? 'unknown'}): ${primaryMsg}` +
      ` — fallback to "${decision.fallback}"`,
    );

    // ── Fallback attempt ─────────────────────────────────────────────────────
    const elapsedMs   = Date.now() - startMs;
    const fallbackMs  = effectiveFallbackMs(budget, elapsedMs);

    try {
      const result = await execWithTimeout(
        (s) => PROVIDERS[decision.fallback].callText(systemPrompt, history, userMessage, s),
        fallbackMs,
        signal,
        decision.fallback,
      );
      recordProviderSuccess(decision.fallback);
      return {
        result,
        providerSelected:  decision.primary,
        providerUsed:      decision.fallback,
        fallbackOccurred:  true,
        latencyMs:         Date.now() - startMs,
        timeoutOccurred,
        failureReason:     primaryMsg,
        healthAtSelection,
      };
    } catch (fallbackErr: unknown) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      if (fallbackErr instanceof TimeoutError) timeoutOccurred = true;
      recordProviderFailure(decision.fallback);
      console.error(
        `[providerRouter] fallback "${decision.fallback}" also failed: ${fallbackMsg}`,
      );
      throw new GatewayError(
        `All providers failed. Primary (${decision.primary}): ${primaryMsg}. ` +
        `Fallback (${decision.fallback}): ${fallbackMsg}`,
        timeoutOccurred,
        healthAtSelection,
      );
    }
  }
}

// ─── modelNameForLogging ──────────────────────────────────────────────────────

/**
 * Returns the model string for ai_usage_log, given the provider that ran.
 */
export function modelNameForLogging(provider: ProviderName): string {
  if (provider === 'nim') return 'meta/llama-3.1-8b-instruct';
  return 'gpt-4o-mini';
}
