/**
 * providerRouter.ts — Multi-provider AI routing, fallback, and execution.
 *
 * Batch 17: operator control layer integrated into routing priority.
 *
 * Routing priority (highest to lowest):
 *   1. FORCE_PROVIDER (operatorPolicy) — pins provider, skips health/cheap/table
 *   2. DISABLED_PROVIDERS (operatorPolicy) — skips disabled primary, promotes fallback
 *   3. FORCE_CHEAP_MODE / low-balance auto (operatorPolicy) — routes to NIM for eligible modes
 *   4. Provider health check (providerHealth) — swaps unhealthy primary with fallback
 *   5. Routing table / default — mode-based preference
 *
 * Fallback control:
 *   - DISABLE_FALLBACK_MODES or disabled fallback provider → fallbackDisabled=true → no fallback
 *   - allDisabled (both providers in DISABLED_PROVIDERS) → throw GatewayError immediately
 *
 * Credit safety contract (unchanged from Batch 15/16):
 *   Credits consumed by index.ts BEFORE calling routeTextRequest().
 *   This module NEVER touches the credit ledger.
 *   If both providers fail → throw GatewayError → index.ts refunds.
 *
 * Routing table (text mode; voice/image remain on OpenAI):
 *
 *   Mode                  Normal primary   Rationale
 *   ─────────────────────────────────────────────────────────────────────────────
 *   quick_nudge           NIM              Short, action-first — fast + cheap
 *   focused_answer        NIM              Conversational — NIM handles well
 *   recovery_coach        OpenAI           Empathy/nuance — OpenAI quality
 *   strategic_planning    OpenAI           Complex multi-step — OpenAI reasoning
 *   review_reflection     OpenAI           Interpretive analysis — OpenAI quality
 *   (unknown / absent)    OpenAI           Safe quality default
 */

import { OpenAIAdapter } from './providers/openai.ts';
import { NIMAdapter }    from './providers/nim.ts';
import type {
  AIRequestMode,
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
import {
  getForcedProvider,
  isProviderDisabled,
  shouldForceCheapMode,
  shouldBypassFallback,
} from './operatorPolicy.ts';

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
 * Determine primary + fallback provider using full operator policy + health state.
 *
 * All operator observability fields are populated so index.ts can log them.
 *
 * @param aiMode   Request mode string (from client orchestration layer).
 * @param balance  Credit balance after deduction; used for auto-cheap-mode trigger.
 */
export function selectProvider(aiMode?: string, balance?: number | null): RoutingDecision {
  // Operator field accumulators
  let operatorForcedProvider:   ProviderName | null = null;
  let operatorCheapMode:        boolean             = false;
  let operatorDisabledProvider: ProviderName | null = null;

  // ── Step 1: FORCE_PROVIDER (absolute override) ────────────────────────────
  const forced = getForcedProvider();
  if (forced) {
    operatorForcedProvider = forced;
    const fallback: ProviderName  = forced === 'openai' ? 'nim' : 'openai';
    const fallbackDisabled        = isProviderDisabled(fallback) || shouldBypassFallback(aiMode);
    const allDisabled             = false; // forced provider is never considered disabled
    return {
      primary: forced, fallback,
      reason: 'forced by FORCE_PROVIDER operator override',
      operatorForcedProvider, operatorCheapMode, operatorDisabledProvider,
      fallbackDisabled, allDisabled,
    };
  }

  // ── Step 2: Routing table base decision ────────────────────────────────────
  const mode  = aiMode as AIRequestMode | undefined;
  const entry = mode ? ROUTING_TABLE[mode] : undefined;
  let primary: ProviderName  = entry?.primary ?? 'openai';
  let fallback: ProviderName = primary === 'openai' ? 'nim' : 'openai';
  let reason: string         = entry?.reason ?? 'unknown mode — defaulting to OpenAI';

  // ── Step 3: Cheap mode override (eligible modes only) ─────────────────────
  const cheapMode = shouldForceCheapMode(balance ?? null, aiMode);
  if (cheapMode) {
    operatorCheapMode = true;
    primary           = 'nim';
    fallback          = 'openai';
    reason            = `cheap mode active — routing to NIM (mode=${aiMode ?? 'unknown'})`;
  }

  // ── Step 4: Disabled provider check ───────────────────────────────────────
  const primaryDisabled  = isProviderDisabled(primary);
  const fallbackDisabledByPolicy = isProviderDisabled(fallback);

  if (primaryDisabled) {
    operatorDisabledProvider = primary;
    if (fallbackDisabledByPolicy) {
      // Both disabled — no provider can serve this request
      console.error('[providerRouter] BOTH providers are disabled — all requests will fail');
      return {
        primary, fallback,
        reason: `all providers disabled`,
        operatorForcedProvider, operatorCheapMode, operatorDisabledProvider,
        fallbackDisabled: true, allDisabled: true,
      };
    }
    // Promote fallback to primary position
    const tmp = primary;
    primary   = fallback;
    fallback  = tmp;
    reason    = `${reason} [${operatorDisabledProvider} disabled — promoted ${primary}]`;
  }

  // ── Step 5: Health check ───────────────────────────────────────────────────
  if (getProviderHealth(primary) === 'unhealthy') {
    console.warn(
      `[providerRouter] primary "${primary}" is UNHEALTHY — promoting "${fallback}" for mode=${aiMode ?? 'unknown'}`,
    );
    const tmp = primary;
    primary   = fallback;
    fallback  = tmp;
    reason    = `${reason} [primary unhealthy — swapped to ${primary}]`;
  }

  // ── Step 6: Fallback disabled? ────────────────────────────────────────────
  const fallbackDisabled =
    fallbackDisabledByPolicy          ||  // fallback provider is in DISABLED_PROVIDERS
    isProviderDisabled(fallback)       ||  // re-check after swaps (edge case)
    shouldBypassFallback(aiMode);         // aiMode is in DISABLE_FALLBACK_MODES

  return {
    primary, fallback, reason,
    operatorForcedProvider, operatorCheapMode, operatorDisabledProvider,
    fallbackDisabled, allDisabled: false,
  };
}

// ─── routeTextRequest ─────────────────────────────────────────────────────────

/**
 * Execute a text request through the routing + timeout + fallback layer.
 *
 * Batch 17 additions:
 *   - Accepts `balance` for cheap-mode auto-trigger
 *   - Checks allDisabled → throws GatewayError immediately
 *   - Checks fallbackDisabled → skips fallback on primary failure
 *   - Populates operator observability fields in RouteExecutionResult
 *
 * Credit safety: this function never touches the credit ledger.
 * Throws GatewayError on total failure (index.ts refunds credits).
 */
export async function routeTextRequest(
  systemPrompt: string,
  history:      HistoryMessage[],
  userMessage:  string,
  signal:       AbortSignal,
  aiMode?:      string,
  budget:       RequestBudget = DEFAULT_BUDGET,
  balance?:     number | null,
): Promise<RouteExecutionResult> {
  const healthAtSelection = getHealthSnapshot();
  const decision          = selectProvider(aiMode, balance);
  const startMs           = Date.now();

  // Pull operator fields for inclusion in the result
  const { operatorForcedProvider, operatorCheapMode, operatorDisabledProvider } = decision;

  // ── Guard: all providers disabled ─────────────────────────────────────────
  if (decision.allDisabled) {
    throw new GatewayError(
      'All providers are disabled by operator policy (DISABLED_PROVIDERS)',
      false,
      healthAtSelection,
    );
  }

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
      operatorForcedProvider,
      operatorCheapMode,
      operatorDisabledProvider,
    };
  } catch (primaryErr: unknown) {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    // Parent signal aborted (client cancel / outer timer) — propagate, do NOT fallback
    if (primaryErr instanceof Error && primaryErr.name === 'AbortError') {
      throw primaryErr;
    }

    if (primaryErr instanceof TimeoutError) timeoutOccurred = true;
    recordProviderFailure(decision.primary);

    // ── Guard: fallback disabled ───────────────────────────────────────────
    if (decision.fallbackDisabled) {
      console.warn(
        `[providerRouter] primary "${decision.primary}" failed and fallback is disabled ` +
        `(mode=${aiMode ?? 'unknown'}): ${primaryMsg}`,
      );
      throw new GatewayError(
        `Primary (${decision.primary}) failed and fallback is disabled: ${primaryMsg}`,
        timeoutOccurred,
        healthAtSelection,
      );
    }

    console.warn(
      `[providerRouter] primary "${decision.primary}" failed (mode=${aiMode ?? 'unknown'}): ${primaryMsg}` +
      ` — fallback to "${decision.fallback}"`,
    );

    // ── Fallback attempt ─────────────────────────────────────────────────────
    const elapsedMs  = Date.now() - startMs;
    const fallbackMs = effectiveFallbackMs(budget, elapsedMs);

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
        operatorForcedProvider,
        operatorCheapMode,
        operatorDisabledProvider,
      };
    } catch (fallbackErr: unknown) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      if (fallbackErr instanceof TimeoutError) timeoutOccurred = true;
      recordProviderFailure(decision.fallback);
      console.error(`[providerRouter] fallback "${decision.fallback}" also failed: ${fallbackMsg}`);
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
