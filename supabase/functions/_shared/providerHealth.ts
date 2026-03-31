/**
 * providerHealth.ts — Lightweight in-process circuit breaker for AI providers.
 *
 * State model:
 *   healthy   — provider responding normally; eligible as primary
 *   unhealthy — provider exceeded FAILURE_THRESHOLD consecutive failures;
 *               skipped as primary for COOLDOWN_MS, then auto-heals
 *
 * Important — scope of state:
 *   State lives at module scope. In Deno Deploy / Supabase edge functions a
 *   single isolate can serve many sequential requests; state persists within
 *   that isolate but not across isolates or cold starts.
 *
 *   This is intentional. The circuit breaker is a guard against hammering a
 *   provider that is failing RIGHT NOW, not a distributed coordination lock.
 *   An unhealthy mark in one isolate will not affect other isolates — which
 *   is acceptable for the blast radius we need to limit.
 *
 * Thresholds (tuned for production safety):
 *   FAILURE_THRESHOLD = 3   — failures before marking unhealthy
 *   COOLDOWN_MS       = 60s — time before auto-heal probe
 */

import type { ProviderName, ProviderHealthState } from './providers/types.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

export const FAILURE_THRESHOLD = 3;
export const COOLDOWN_MS       = 60_000; // 1 minute

// ─── Internal state ───────────────────────────────────────────────────────────

interface HealthEntry {
  consecutiveFailures: number;
  unhealthyUntilMs:    number | null; // null → healthy
}

// Module-level singleton — persists across requests within one isolate
const _state: Record<ProviderName, HealthEntry> = {
  openai: { consecutiveFailures: 0, unhealthyUntilMs: null },
  nim:    { consecutiveFailures: 0, unhealthyUntilMs: null },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns 'healthy' or 'unhealthy' for a provider.
 * Side effect: auto-heals the entry when cooldown has expired.
 */
export function getProviderHealth(provider: ProviderName): ProviderHealthState {
  const entry = _state[provider];
  if (entry.unhealthyUntilMs !== null) {
    if (Date.now() < entry.unhealthyUntilMs) return 'unhealthy';
    // Cooldown expired — reset and report healthy for this probe
    entry.consecutiveFailures = 0;
    entry.unhealthyUntilMs    = null;
  }
  return 'healthy';
}

/**
 * Record a successful call — resets consecutive failure counter.
 */
export function recordProviderSuccess(provider: ProviderName): void {
  _state[provider].consecutiveFailures = 0;
  _state[provider].unhealthyUntilMs    = null;
}

/**
 * Record a failed call. Marks provider unhealthy once FAILURE_THRESHOLD is reached.
 * No-op if the provider is already in an active cooldown period.
 */
export function recordProviderFailure(provider: ProviderName): void {
  const entry = _state[provider];
  // Already in cooldown — do not accumulate further (avoids counter overflow)
  if (entry.unhealthyUntilMs !== null && Date.now() < entry.unhealthyUntilMs) return;
  entry.consecutiveFailures += 1;
  if (entry.consecutiveFailures >= FAILURE_THRESHOLD) {
    entry.unhealthyUntilMs = Date.now() + COOLDOWN_MS;
    console.warn(
      `[providerHealth] "${provider}" marked UNHEALTHY after ${entry.consecutiveFailures}` +
      ` consecutive failures. Cooldown ${COOLDOWN_MS / 1_000}s.`,
    );
  }
}

/**
 * Current consecutive failure count — for observability and testing.
 */
export function getConsecutiveFailures(provider: ProviderName): number {
  return _state[provider].consecutiveFailures;
}

/**
 * Returns a point-in-time snapshot of health for both providers.
 * Attached to RouteExecutionResult / GatewayError for logging.
 */
export function getHealthSnapshot(): Record<ProviderName, ProviderHealthState> {
  return {
    openai: getProviderHealth('openai'),
    nim:    getProviderHealth('nim'),
  };
}

/**
 * Reset a single provider's health state.
 * FOR TESTING ONLY — do not call in the production request path.
 */
export function resetProviderHealth(provider: ProviderName): void {
  _state[provider] = { consecutiveFailures: 0, unhealthyUntilMs: null };
}

/**
 * Reset all providers to healthy.
 * FOR TESTING ONLY.
 */
export function resetAllProviderHealth(): void {
  resetProviderHealth('openai');
  resetProviderHealth('nim');
}

/**
 * Force a provider into an unhealthy state with a specific expiry timestamp.
 * Useful in tests to simulate expired or active cooldowns without sleeping.
 * FOR TESTING ONLY.
 */
export function _forceUnhealthy(provider: ProviderName, untilMs: number): void {
  _state[provider].consecutiveFailures = FAILURE_THRESHOLD;
  _state[provider].unhealthyUntilMs    = untilMs;
}
