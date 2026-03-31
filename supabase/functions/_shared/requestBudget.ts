/**
 * requestBudget.ts — Per-provider timeout control and budget management.
 *
 * Responsibilities:
 *   1. Define the request budget policy (total / primary / fallback timeouts)
 *   2. Provide execWithTimeout() — wraps any async fn with an explicit deadline
 *   3. Expose TimeoutError so callers can distinguish provider timeout vs other failure
 *
 * Budget policy (defaults):
 *   totalMs    28 000 ms  ─ Supabase edge function hard wall is ~30 s; outer
 *                           AbortController fires at 25 s as safety net (index.ts).
 *                           The budget stays comfortably inside both limits.
 *   primaryMs  10 000 ms  ─ primary provider must respond within this window
 *   fallbackMs 12 000 ms  ─ cap on fallback attempt; further capped by remaining total
 *
 * AbortSignal contract:
 *   - Parent signal aborts (client cancelled / outer timer fires):
 *       AbortError propagates unchanged — do NOT attempt fallback.
 *   - Our timer fires before fn completes:
 *       TimeoutError is thrown — caller SHOULD attempt fallback.
 *   - The two cases are distinguishable because TimeoutError.name !== 'AbortError'.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RequestBudget {
  totalMs:    number;
  primaryMs:  number;
  fallbackMs: number;
}

// ─── TimeoutError ──────────────────────────────────────────────────────────────

/**
 * Thrown by execWithTimeout when the per-provider deadline fires.
 * name === 'TimeoutError' (not 'AbortError') so routers can distinguish the two.
 */
export class TimeoutError extends Error {
  constructor(
    public readonly providerLabel: string,
    public readonly timeoutMs: number,
  ) {
    super(`${providerLabel} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

// ─── Default budget ────────────────────────────────────────────────────────────

export const DEFAULT_BUDGET: RequestBudget = {
  totalMs:    28_000,
  primaryMs:  10_000,
  fallbackMs: 12_000,
};

// ─── execWithTimeout ──────────────────────────────────────────────────────────

/**
 * Execute fn(signal) with an explicit deadline.
 *
 * - If fn completes before deadline: result is returned normally.
 * - If deadline fires first: TimeoutError is thrown (caller can try fallback).
 * - If parentSignal aborts first: AbortError propagates (caller should NOT retry).
 * - If parentSignal was already aborted on entry: AbortError thrown immediately.
 *
 * The `fn` MUST honour the provided AbortSignal for cancellation to work.
 */
export async function execWithTimeout<T>(
  fn:           (signal: AbortSignal) => Promise<T>,
  timeoutMs:    number,
  parentSignal: AbortSignal,
  label:        string,
): Promise<T> {
  // Fast path — parent was already aborted before we were called
  if (parentSignal.aborted) {
    const err = new Error('The operation was aborted.');
    err.name  = 'AbortError';
    throw err;
  }

  const controller = new AbortController();
  let timedOut     = false;

  // When the parent aborts, forward to our child controller
  const onParentAbort = (): void => { controller.abort(); };
  parentSignal.addEventListener('abort', onParentAbort, { once: true });

  // Our per-provider deadline
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fn(controller.signal);
  } catch (err) {
    // Our timer fired → the abort came from us, not the parent
    if (timedOut && err instanceof Error && err.name === 'AbortError') {
      throw new TimeoutError(label, timeoutMs);
    }
    // Parent aborted, or genuine provider error — propagate unchanged
    throw err;
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', onParentAbort);
  }
}

// ─── effectiveFallbackMs ──────────────────────────────────────────────────────

const MIN_FALLBACK_MS = 3_000;

/**
 * Computes the actual timeout to give the fallback provider.
 *
 * Rules:
 *   - Never exceeds budget.fallbackMs
 *   - Never exceeds remaining total budget (totalMs − elapsed)
 *   - Always at least MIN_FALLBACK_MS so the fallback gets a real shot
 *     even if the primary consumed almost all budget (last-chance attempt)
 */
export function effectiveFallbackMs(budget: RequestBudget, elapsedMs: number): number {
  const remaining = budget.totalMs - elapsedMs;
  if (remaining <= MIN_FALLBACK_MS) return MIN_FALLBACK_MS;
  return Math.min(budget.fallbackMs, remaining);
}
