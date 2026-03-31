/**
 * operatorPolicy.ts — Operator control layer for the AI provider gateway.
 *
 * All functions are PURE — they read from Deno.env and return a value.
 * No side effects, no state mutation, fully unit-testable.
 *
 * Environment variable reference:
 *
 *   FORCE_PROVIDER              'openai' | 'nim' | ''
 *     Pins ALL text requests to a single provider, bypassing routing table
 *     and health checks. Use for outage mitigation or controlled testing.
 *
 *   DISABLED_PROVIDERS          Comma-separated provider names, e.g. "nim"
 *     Prevents listed providers from being selected as primary. If the
 *     routing table would have chosen a disabled provider, the other is
 *     promoted. If both are disabled, all requests fail immediately.
 *
 *   FORCE_CHEAP_MODE            'true' | 'false' | ''
 *     Routes ALL eligible requests to the cheapest provider (NIM).
 *     Quality-critical modes (recovery_coach, strategic_planning,
 *     review_reflection) are EXEMPT and continue to use OpenAI.
 *     Also auto-activates when user credit balance ≤ LOW_BALANCE_THRESHOLD.
 *
 *   MAX_CREDITS_PER_REQUEST     Positive integer string, e.g. "2"
 *     Caps the credit cost of any single request. Requests costing more
 *     than this value are rejected before provider execution.
 *     Unset or invalid → no cap.
 *
 *   DISABLE_FALLBACK_MODES      Comma-separated aiMode list, e.g. "quick_nudge"
 *     When a request's aiMode is listed, primary provider failure does NOT
 *     trigger a fallback attempt. Useful for cost control when you know
 *     NIM is the cheapest path and you'd rather fail-fast than pay OpenAI
 *     fallback rates.
 */

import type { ProviderName } from './providers/types.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Modes where quality is critical and cheap-mode override is NEVER applied.
 * These always prefer OpenAI regardless of FORCE_CHEAP_MODE or low balance.
 */
export const QUALITY_CRITICAL_MODES = new Set<string>([
  'recovery_coach',
  'strategic_planning',
  'review_reflection',
]);

/**
 * When the user's credit balance is at or below this threshold, cheap mode
 * auto-activates for eligible (non-quality-critical) modes.
 */
export const LOW_BALANCE_THRESHOLD = 5;

// ─── getForcedProvider ────────────────────────────────────────────────────────

/**
 * Returns the operator-forced provider, or null if not set.
 *
 * FORCE_PROVIDER env var overrides routing table, disabled-provider logic,
 * health checks, and cheap mode. It is the highest-priority control.
 */
export function getForcedProvider(): ProviderName | null {
  const val = (Deno.env.get('FORCE_PROVIDER') ?? '').trim().toLowerCase();
  if (val === 'openai' || val === 'nim') return val;
  return null;
}

// ─── isProviderDisabled ───────────────────────────────────────────────────────

/**
 * Returns true if the provider appears in DISABLED_PROVIDERS.
 *
 * DISABLED_PROVIDERS is a comma-separated list:  "nim"  or  "nim,openai"
 * Whitespace around names is trimmed.
 */
export function isProviderDisabled(provider: ProviderName): boolean {
  const raw  = Deno.env.get('DISABLED_PROVIDERS') ?? '';
  if (!raw.trim()) return false;
  const list = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(provider);
}

// ─── shouldForceCheapMode ─────────────────────────────────────────────────────

/**
 * Returns true when requests should be routed to the cheapest provider (NIM).
 *
 * Quality-critical modes are always exempt — returns false for those regardless
 * of operator flags or balance.
 *
 * Activates when:
 *   1. FORCE_CHEAP_MODE=true  (explicit operator override), or
 *   2. balance is not null AND balance ≤ LOW_BALANCE_THRESHOLD (auto-trigger)
 *
 * @param balance  Current credit balance after deduction, or null if unknown.
 * @param aiMode   Current request mode (quality-critical modes are exempt).
 */
export function shouldForceCheapMode(balance: number | null, aiMode?: string): boolean {
  // Quality-critical modes are always exempt
  if (aiMode && QUALITY_CRITICAL_MODES.has(aiMode)) return false;

  // Explicit operator override
  const forced = (Deno.env.get('FORCE_CHEAP_MODE') ?? '').trim().toLowerCase();
  if (forced === 'true') return true;

  // Auto cheap mode: user is low on credits
  if (balance !== null && balance <= LOW_BALANCE_THRESHOLD) return true;

  return false;
}

// ─── getMaxCreditsPerRequest ──────────────────────────────────────────────────

/**
 * Returns the operator-configured per-request credit cap, or null if not set.
 *
 * MAX_CREDITS_PER_REQUEST must be a positive integer string.
 * Invalid or missing values return null (no cap applied).
 */
export function getMaxCreditsPerRequest(): number | null {
  const raw = (Deno.env.get('MAX_CREDITS_PER_REQUEST') ?? '').trim();
  if (!raw) return null;
  const val = parseInt(raw, 10);
  if (isNaN(val) || val <= 0) return null;
  return val;
}

// ─── shouldBypassFallback ─────────────────────────────────────────────────────

/**
 * Returns true when the fallback provider should NOT be attempted for this aiMode.
 *
 * DISABLE_FALLBACK_MODES is a comma-separated list of aiMode strings.
 * Example: "quick_nudge,focused_answer" → if primary fails for these modes,
 *          the request fails immediately rather than falling back to OpenAI.
 *
 * Use case: cost control — if NIM (cheap primary) fails on quick_nudge,
 *           failing fast is cheaper than paying OpenAI for a fallback.
 */
export function shouldBypassFallback(aiMode?: string): boolean {
  if (!aiMode) return false;
  const raw  = Deno.env.get('DISABLE_FALLBACK_MODES') ?? '';
  if (!raw.trim()) return false;
  const list = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(aiMode.toLowerCase());
}
