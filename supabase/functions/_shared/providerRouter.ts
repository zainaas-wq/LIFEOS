/**
 * providerRouter.ts — Multi-provider AI routing, fallback, and execution.
 *
 * Responsibilities:
 *   1. Select primary + fallback provider from request mode and env policy
 *   2. Execute primary → on failure, execute fallback once
 *   3. Return full RouteExecutionResult (provider selected, used, fallback flag, latency)
 *   4. NEVER charge credits twice — caller deducts once; this layer only executes
 *
 * Credit safety contract:
 *   - Credits are consumed by index.ts BEFORE calling routeTextRequest().
 *   - If primary succeeds: credits stay deducted. Done.
 *   - If primary fails AND fallback succeeds: credits stay deducted. Done.
 *     (One deduction covers the whole logical request, regardless of provider used.)
 *   - If primary AND fallback both fail: caller (index.ts) refunds credits.
 *   - This module NEVER touches the credit ledger.
 *
 * Routing policy (text mode only — voice/image stay on OpenAI):
 *
 *   Mode                  Primary   Fallback   Rationale
 *   ─────────────────────────────────────────────────────────────────────────
 *   quick_nudge           NIM       OpenAI     Short, action-first — NIM is fast + cheap
 *   focused_answer        NIM       OpenAI     Conversational — NIM handles well
 *   recovery_coach        OpenAI    NIM        Needs empathy + nuance — OpenAI quality
 *   strategic_planning    OpenAI    NIM        Complex multi-step reasoning — OpenAI
 *   review_reflection     OpenAI    NIM        Interpretive, pattern-rich — OpenAI
 *   (unknown / absent)   OpenAI    NIM        Safe default — prefer quality
 *
 * Policy override:
 *   FORCE_PROVIDER env var overrides the routing table entirely.
 *   Set to "openai" or "nim" to pin all text requests to one provider.
 *   Useful for testing, cost management, or provider outage mitigation.
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

// ─── Provider singletons (instantiated once per function invocation) ──────────

const OPENAI = new OpenAIAdapter();
const NIM    = new NIMAdapter();

const PROVIDERS: Record<ProviderName, ProviderAdapter> = {
  openai: OPENAI,
  nim:    NIM,
};

// ─── Routing table ────────────────────────────────────────────────────────────

/**
 * Mode-to-provider routing table.
 * Fallback is always the other provider.
 */
const ROUTING_TABLE: Record<AIRequestMode, { primary: ProviderName; reason: string }> = {
  quick_nudge:       { primary: 'nim',    reason: 'short action request — NIM is faster and cheaper' },
  focused_answer:    { primary: 'nim',    reason: 'conversational — NIM handles well at lower cost' },
  recovery_coach:    { primary: 'openai', reason: 'requires empathy and nuance — OpenAI quality' },
  strategic_planning:{ primary: 'openai', reason: 'complex multi-step planning — OpenAI reasoning' },
  review_reflection: { primary: 'openai', reason: 'interpretive analysis of patterns — OpenAI quality' },
};

// ─── selectProvider ───────────────────────────────────────────────────────────

/**
 * Determine which provider to use as primary and which as fallback.
 *
 * Respects FORCE_PROVIDER env override, then routing table, then defaults to OpenAI.
 */
export function selectProvider(aiMode?: string): RoutingDecision {
  // Env override: FORCE_PROVIDER pins everything
  const force = (Deno.env.get('FORCE_PROVIDER') ?? '').trim().toLowerCase() as ProviderName | '';
  if (force === 'openai' || force === 'nim') {
    const fallback: ProviderName = force === 'openai' ? 'nim' : 'openai';
    return {
      primary:  force,
      fallback,
      reason:   `forced by FORCE_PROVIDER env var`,
    };
  }

  const mode = aiMode as AIRequestMode | undefined;
  if (mode && ROUTING_TABLE[mode]) {
    const entry = ROUTING_TABLE[mode];
    const fallback: ProviderName = entry.primary === 'openai' ? 'nim' : 'openai';
    return { primary: entry.primary, fallback, reason: entry.reason };
  }

  // Unknown mode: safe default
  return { primary: 'openai', fallback: 'nim', reason: 'unknown mode — defaulting to OpenAI' };
}

// ─── routeTextRequest ─────────────────────────────────────────────────────────

/**
 * Execute a text request through the routing + fallback layer.
 *
 * Flow:
 *   1. selectProvider(aiMode) → { primary, fallback }
 *   2. Try primary provider
 *   3. On primary failure → log warning → try fallback provider
 *   4. On fallback failure → throw (caller refunds credits)
 *
 * Returns RouteExecutionResult with full observability metadata.
 * Never touches the credit ledger.
 */
export async function routeTextRequest(
  systemPrompt: string,
  history:      HistoryMessage[],
  userMessage:  string,
  signal:       AbortSignal,
  aiMode?:      string,
): Promise<RouteExecutionResult> {
  const decision = selectProvider(aiMode);
  const startMs  = Date.now();

  const primary  = PROVIDERS[decision.primary];
  const fallback = PROVIDERS[decision.fallback];

  // ── Primary attempt ────────────────────────────────────────────────────────
  try {
    const result = await primary.callText(systemPrompt, history, userMessage, signal);
    return {
      result,
      providerSelected: decision.primary,
      providerUsed:     decision.primary,
      fallbackOccurred: false,
      latencyMs:        Date.now() - startMs,
    };
  } catch (primaryErr: unknown) {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    // Abort signal fired — do not attempt fallback, let caller handle
    if (
      primaryErr instanceof Error &&
      (primaryErr.name === 'AbortError' || primaryMsg.includes('aborted'))
    ) {
      throw primaryErr;
    }

    console.warn(
      `[providerRouter] primary provider "${decision.primary}" failed (mode=${aiMode ?? 'unknown'}): ${primaryMsg}` +
      ` — attempting fallback to "${decision.fallback}"`,
    );

    // ── Fallback attempt ─────────────────────────────────────────────────────
    try {
      const result = await fallback.callText(systemPrompt, history, userMessage, signal);
      return {
        result,
        providerSelected: decision.primary,
        providerUsed:     decision.fallback,
        fallbackOccurred: true,
        latencyMs:        Date.now() - startMs,
      };
    } catch (fallbackErr: unknown) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      console.error(
        `[providerRouter] fallback provider "${decision.fallback}" also failed: ${fallbackMsg}`,
      );
      // Both providers failed — throw so index.ts refunds credits
      throw new Error(
        `All providers failed. Primary (${decision.primary}): ${primaryMsg}. ` +
        `Fallback (${decision.fallback}): ${fallbackMsg}`,
      );
    }
  }
}

// ─── modelNameForLogging ──────────────────────────────────────────────────────

/**
 * Returns the model name string for ai_usage_log, given the provider that actually ran.
 */
export function modelNameForLogging(provider: ProviderName): string {
  if (provider === 'nim') return 'meta/llama-3.1-8b-instruct';
  return 'gpt-4o-mini';
}
