/**
 * Batch 16 — Reliability Tests
 *
 * Tests for:
 *   A. requestBudget — TimeoutError, execWithTimeout, effectiveFallbackMs
 *   B. providerHealth — circuit breaker state machine
 *   C. providerRouter — health-aware selectProvider + timeout-aware routing
 *
 * All logic is inlined so tests run in Node via `npx tsx` with no Deno runtime.
 * The Deno.env stub from Batch 15 is reused for FORCE_PROVIDER.
 */

// ─── Deno stub ────────────────────────────────────────────────────────────────

let _forceProvider = '';
(globalThis as any).Deno = {
  env: { get: (k: string) => k === 'FORCE_PROVIDER' ? _forceProvider : '' },
};

// ─── Inline: TimeoutError ─────────────────────────────────────────────────────

class TimeoutError extends Error {
  constructor(public readonly providerLabel: string, public readonly timeoutMs: number) {
    super(`${providerLabel} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

// ─── Inline: execWithTimeout ──────────────────────────────────────────────────

async function execWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal: AbortSignal,
  label: string,
): Promise<T> {
  if (parentSignal.aborted) {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    throw err;
  }

  const controller = new AbortController();
  let timedOut = false;

  const onParentAbort = (): void => { controller.abort(); };
  parentSignal.addEventListener('abort', onParentAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fn(controller.signal);
  } catch (err) {
    if (timedOut && err instanceof Error && err.name === 'AbortError') {
      throw new TimeoutError(label, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', onParentAbort);
  }
}

// ─── Inline: effectiveFallbackMs ─────────────────────────────────────────────

const MIN_FALLBACK_MS = 3_000;

interface RequestBudget { totalMs: number; primaryMs: number; fallbackMs: number; }

const DEFAULT_BUDGET: RequestBudget = { totalMs: 28_000, primaryMs: 10_000, fallbackMs: 12_000 };

function effectiveFallbackMs(budget: RequestBudget, elapsedMs: number): number {
  const remaining = budget.totalMs - elapsedMs;
  if (remaining <= MIN_FALLBACK_MS) return MIN_FALLBACK_MS;
  return Math.min(budget.fallbackMs, remaining);
}

// ─── Inline: providerHealth ───────────────────────────────────────────────────

type ProviderName      = 'openai' | 'nim';
type ProviderHealthState = 'healthy' | 'unhealthy';

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS       = 60_000;

interface HealthEntry { consecutiveFailures: number; unhealthyUntilMs: number | null; }

// Shared mutable state (module scope equivalent)
const _healthState: Record<ProviderName, HealthEntry> = {
  openai: { consecutiveFailures: 0, unhealthyUntilMs: null },
  nim:    { consecutiveFailures: 0, unhealthyUntilMs: null },
};

function getProviderHealth(p: ProviderName): ProviderHealthState {
  const e = _healthState[p];
  if (e.unhealthyUntilMs !== null) {
    if (Date.now() < e.unhealthyUntilMs) return 'unhealthy';
    e.consecutiveFailures = 0;
    e.unhealthyUntilMs    = null;
  }
  return 'healthy';
}
function recordProviderSuccess(p: ProviderName): void {
  _healthState[p].consecutiveFailures = 0;
  _healthState[p].unhealthyUntilMs    = null;
}
function recordProviderFailure(p: ProviderName): void {
  const e = _healthState[p];
  if (e.unhealthyUntilMs !== null && Date.now() < e.unhealthyUntilMs) return;
  e.consecutiveFailures += 1;
  if (e.consecutiveFailures >= FAILURE_THRESHOLD) {
    e.unhealthyUntilMs = Date.now() + COOLDOWN_MS;
  }
}
function getConsecutiveFailures(p: ProviderName): number { return _healthState[p].consecutiveFailures; }
function getHealthSnapshot(): Record<ProviderName, ProviderHealthState> {
  return { openai: getProviderHealth('openai'), nim: getProviderHealth('nim') };
}
function resetAll(): void {
  _healthState.openai = { consecutiveFailures: 0, unhealthyUntilMs: null };
  _healthState.nim    = { consecutiveFailures: 0, unhealthyUntilMs: null };
}
function forceUnhealthy(p: ProviderName, untilMs: number): void {
  _healthState[p].consecutiveFailures = FAILURE_THRESHOLD;
  _healthState[p].unhealthyUntilMs    = untilMs;
}

// ─── Inline: routing table + selectProvider ───────────────────────────────────

type AIRequestMode = 'quick_nudge' | 'focused_answer' | 'recovery_coach' | 'strategic_planning' | 'review_reflection';

interface RoutingDecision { primary: ProviderName; fallback: ProviderName; reason: string; }

const ROUTING_TABLE: Record<AIRequestMode, { primary: ProviderName }> = {
  quick_nudge:        { primary: 'nim' },
  focused_answer:     { primary: 'nim' },
  recovery_coach:     { primary: 'openai' },
  strategic_planning: { primary: 'openai' },
  review_reflection:  { primary: 'openai' },
};

function selectProvider(aiMode?: string): RoutingDecision {
  const force = (_forceProvider ?? '').trim().toLowerCase() as ProviderName | '';
  if (force === 'openai' || force === 'nim') {
    const fallback: ProviderName = force === 'openai' ? 'nim' : 'openai';
    return { primary: force, fallback, reason: 'forced by FORCE_PROVIDER env var' };
  }
  const mode  = aiMode as AIRequestMode | undefined;
  const entry = mode ? ROUTING_TABLE[mode] : undefined;
  let primary: ProviderName  = entry?.primary ?? 'openai';
  let fallback: ProviderName = primary === 'openai' ? 'nim' : 'openai';
  let reason = mode ? `table routing for ${mode}` : 'unknown mode — defaulting to OpenAI';

  // Health check
  if (getProviderHealth(primary) === 'unhealthy') {
    return { primary: fallback, fallback: primary, reason: `${reason} [primary unhealthy — swapped]` };
  }
  return { primary, fallback, reason };
}

// ─── Inline: GatewayError ────────────────────────────────────────────────────

class GatewayError extends Error {
  constructor(
    message: string,
    public readonly timeoutOccurred: boolean,
    public readonly healthAtSelection: Record<ProviderName, ProviderHealthState>,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

// ─── Inline: routeTextRequest ─────────────────────────────────────────────────

interface HistoryMessage { role: 'user' | 'assistant'; content: string; }
interface ProviderResult { content: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number; provider: ProviderName }; }
interface RouteExecutionResult {
  result: ProviderResult; providerSelected: ProviderName; providerUsed: ProviderName;
  fallbackOccurred: boolean; latencyMs: number;
  timeoutOccurred: boolean; failureReason: string | null;
  healthAtSelection: Record<ProviderName, ProviderHealthState>;
}

interface StubProvider {
  name: ProviderName;
  callText(_sys: string, _hist: HistoryMessage[], _msg: string, signal: AbortSignal): Promise<ProviderResult>;
}

function makeStub(name: ProviderName, behaviour: 'ok' | 'throw' | 'slow', slowMs = 0): StubProvider {
  return {
    name,
    callText(_s: string, _h: HistoryMessage[], _m: string, signal: AbortSignal): Promise<ProviderResult> {
      if (behaviour === 'throw') return Promise.reject(new Error(`${name} provider error`));
      if (behaviour === 'slow') {
        return new Promise<ProviderResult>((resolve, reject) => {
          const t = setTimeout(
            () => resolve({ content: `reply from ${name}`, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, provider: name } }),
            slowMs,
          );
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
          }, { once: true });
        });
      }
      return Promise.resolve({ content: `reply from ${name}`, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, provider: name } });
    },
  };
}

async function routeTextRequestWith(
  providers: Record<ProviderName, StubProvider>,
  _sys: string, _hist: HistoryMessage[], msg: string,
  signal: AbortSignal, aiMode?: string, budget: RequestBudget = DEFAULT_BUDGET,
): Promise<RouteExecutionResult> {
  const healthAtSelection = getHealthSnapshot();
  const decision          = selectProvider(aiMode);
  const startMs           = Date.now();
  let timeoutOccurred     = false;

  try {
    const result = await execWithTimeout(
      (s) => providers[decision.primary].callText('', [], msg, s),
      budget.primaryMs, signal, decision.primary,
    );
    recordProviderSuccess(decision.primary);
    return { result, providerSelected: decision.primary, providerUsed: decision.primary,
             fallbackOccurred: false, latencyMs: Date.now() - startMs,
             timeoutOccurred: false, failureReason: null, healthAtSelection };
  } catch (primaryErr: unknown) {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    if (primaryErr instanceof Error && primaryErr.name === 'AbortError') throw primaryErr;
    if (primaryErr instanceof TimeoutError) timeoutOccurred = true;
    recordProviderFailure(decision.primary);

    const fallbackMs = effectiveFallbackMs(budget, Date.now() - startMs);
    try {
      const result = await execWithTimeout(
        (s) => providers[decision.fallback].callText('', [], msg, s),
        fallbackMs, signal, decision.fallback,
      );
      recordProviderSuccess(decision.fallback);
      return { result, providerSelected: decision.primary, providerUsed: decision.fallback,
               fallbackOccurred: true, latencyMs: Date.now() - startMs,
               timeoutOccurred, failureReason: primaryMsg, healthAtSelection };
    } catch (fallbackErr: unknown) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      if (fallbackErr instanceof TimeoutError) timeoutOccurred = true;
      recordProviderFailure(decision.fallback);
      throw new GatewayError(
        `All providers failed. Primary (${decision.primary}): ${primaryMsg}. Fallback (${decision.fallback}): ${fallbackMsg}`,
        timeoutOccurred, healthAtSelection,
      );
    }
  }
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0; let failed = 0;
function assert(cond: boolean, label: string): void {
  if (cond) { console.log(`  ✓ PASS: ${label}`); passed++; }
  else       { console.error(`  ✗ FAIL: ${label}`); failed++; }
}
async function assertThrowsName(fn: () => Promise<unknown>, name: string, label: string): Promise<void> {
  try { await fn(); console.error(`  ✗ FAIL: ${label} — did not throw`); failed++; }
  catch (e: unknown) {
    const got = e instanceof Error ? e.name : '?';
    if (got === name) { console.log(`  ✓ PASS: ${label}`); passed++; }
    else { console.error(`  ✗ FAIL: ${label} — threw ${got}, wanted ${name}`); failed++; }
  }
}
async function assertThrowsMsg(fn: () => Promise<unknown>, substr: string, label: string): Promise<void> {
  try { await fn(); console.error(`  ✗ FAIL: ${label} — did not throw`); failed++; }
  catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes(substr)) { console.log(`  ✓ PASS: ${label}`); passed++; }
    else { console.error(`  ✗ FAIL: ${label} — message was: "${msg}"`); failed++; }
  }
}

async function main() {

// ═══════════════════════════════════════════════════════════════════════════════
// A. requestBudget
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nA. requestBudget — execWithTimeout');

// A1: completes normally within timeout
await (async () => {
  const fastFn = async (_s: AbortSignal) => 'done';
  const result = await execWithTimeout(fastFn, 500, new AbortController().signal, 'test');
  assert(result === 'done', 'A1: returns result when fn completes within timeout');
})();

// Signal-aware slow fn — respects abort so our timer can interrupt it
function signalAwareSlow(delayMs: number): (s: AbortSignal) => Promise<string> {
  return (s: AbortSignal) => new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => resolve('late'), delayMs);
    s.addEventListener('abort', () => {
      clearTimeout(t);
      const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
    }, { once: true });
  });
}

// A2: throws TimeoutError when fn takes longer than timeout
await assertThrowsName(
  () => execWithTimeout(signalAwareSlow(300), 20, new AbortController().signal, 'slow-provider'),
  'TimeoutError',
  'A2: throws TimeoutError when fn exceeds deadline',
);

// A3: TimeoutError carries correct label and timeoutMs
await (async () => {
  try {
    await execWithTimeout(signalAwareSlow(300), 20, new AbortController().signal, 'nim');
  } catch (e: unknown) {
    assert(e instanceof TimeoutError, 'A3a: thrown error is instanceof TimeoutError');
    assert((e as TimeoutError).providerLabel === 'nim', 'A3b: providerLabel = nim');
    assert((e as TimeoutError).timeoutMs === 20, 'A3c: timeoutMs = 20');
  }
})();

// A4: parent AbortError propagates as AbortError (NOT TimeoutError)
await assertThrowsName(
  () => {
    const ac = new AbortController();
    const fn = (_s: AbortSignal) => new Promise<string>((_, rej) => {
      _s.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
    });
    setTimeout(() => ac.abort(), 10);
    return execWithTimeout(fn, 500, ac.signal, 'test');
  },
  'AbortError',
  'A4: parent abort propagates as AbortError (not TimeoutError)',
);

// A5: fast path — parent already aborted on entry
await assertThrowsName(
  () => {
    const ac = new AbortController();
    ac.abort();
    return execWithTimeout(async () => 'should not run', 1000, ac.signal, 'test');
  },
  'AbortError',
  'A5: throws AbortError immediately when parent signal already aborted',
);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nA2. effectiveFallbackMs');

(function () {
  const budget = { totalMs: 28_000, primaryMs: 10_000, fallbackMs: 12_000 };

  // No elapsed — fallback gets full fallbackMs
  assert(effectiveFallbackMs(budget, 0) === 12_000, 'B1: 0ms elapsed → 12000ms fallback');

  // Primary used 9s → remaining 19s → capped at fallbackMs (12s)
  assert(effectiveFallbackMs(budget, 9_000) === 12_000, 'B2: 9s elapsed → capped at fallbackMs (12s)');

  // Primary used 17s → remaining 11s → capped at remaining (11s < 12s)
  assert(effectiveFallbackMs(budget, 17_000) === 11_000, 'B3: 17s elapsed → capped at remaining (11s)');

  // Budget nearly exhausted → MIN_FALLBACK_MS floor
  assert(effectiveFallbackMs(budget, 27_000) === MIN_FALLBACK_MS, 'B4: 27s elapsed → MIN_FALLBACK_MS floor');

  // Budget over-exhausted → still MIN_FALLBACK_MS (last-chance)
  assert(effectiveFallbackMs(budget, 30_000) === MIN_FALLBACK_MS, 'B5: over-budget → MIN_FALLBACK_MS floor');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// B. providerHealth — circuit breaker
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nB. providerHealth — circuit breaker state machine');

(function () {
  resetAll();

  // B1: providers start healthy
  assert(getProviderHealth('openai') === 'healthy', 'B1a: openai starts healthy');
  assert(getProviderHealth('nim')    === 'healthy', 'B1b: nim starts healthy');

  // B2: failures below threshold do not mark unhealthy
  recordProviderFailure('nim');
  assert(getConsecutiveFailures('nim') === 1,        'B2a: 1 failure recorded');
  assert(getProviderHealth('nim')      === 'healthy', 'B2b: still healthy at 1 failure');

  recordProviderFailure('nim');
  assert(getConsecutiveFailures('nim') === 2,        'B2c: 2 failures recorded');
  assert(getProviderHealth('nim')      === 'healthy', 'B2d: still healthy at 2 failures');

  // B3: at threshold, becomes unhealthy
  recordProviderFailure('nim');
  assert(getConsecutiveFailures('nim') === 3,          'B3a: 3 failures recorded');
  assert(getProviderHealth('nim')      === 'unhealthy', 'B3b: unhealthy at 3 failures (threshold)');

  // B4: additional failures do not accumulate while in cooldown
  recordProviderFailure('nim');
  assert(getConsecutiveFailures('nim') === 3, 'B4: no accumulation while in cooldown');

  // B5: openai unaffected by nim failures
  assert(getProviderHealth('openai') === 'healthy', 'B5: openai unaffected');

  // B6: success resets state
  resetAll();
  recordProviderFailure('openai');
  recordProviderFailure('openai');
  recordProviderSuccess('openai');
  assert(getConsecutiveFailures('openai') === 0,      'B6a: success resets counter');
  assert(getProviderHealth('openai')      === 'healthy', 'B6b: healthy after success');

  // B7: auto-heal when cooldown expires
  resetAll();
  forceUnhealthy('nim', Date.now() - 1); // expired 1ms ago
  assert(getProviderHealth('nim') === 'healthy', 'B7: auto-heals when cooldown expires');
  assert(getConsecutiveFailures('nim') === 0,    'B7b: counter reset after auto-heal');

  // B8: still unhealthy within cooldown
  resetAll();
  forceUnhealthy('nim', Date.now() + 60_000);
  assert(getProviderHealth('nim') === 'unhealthy', 'B8: still unhealthy within cooldown');

  // B9: getHealthSnapshot returns both providers
  resetAll();
  forceUnhealthy('nim', Date.now() + 60_000);
  const snap = getHealthSnapshot();
  assert(snap.openai === 'healthy',   'B9a: snapshot openai = healthy');
  assert(snap.nim    === 'unhealthy', 'B9b: snapshot nim = unhealthy');

  resetAll();
})();

// ═══════════════════════════════════════════════════════════════════════════════
// C. selectProvider — health-aware routing
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nC. selectProvider — health-aware routing');

(function () {
  _forceProvider = '';
  resetAll();

  // C1: normal routing unchanged when both healthy
  const qn = selectProvider('quick_nudge');
  assert(qn.primary === 'nim',    'C1a: quick_nudge → nim primary (healthy)');
  assert(qn.fallback === 'openai','C1b: quick_nudge → openai fallback');

  const rc = selectProvider('recovery_coach');
  assert(rc.primary === 'openai', 'C1c: recovery_coach → openai primary (healthy)');
  assert(rc.fallback === 'nim',   'C1d: recovery_coach → nim fallback');

  // C2: unhealthy primary → swapped with fallback
  forceUnhealthy('nim', Date.now() + 60_000);
  const qnUnhealthy = selectProvider('quick_nudge');
  assert(qnUnhealthy.primary  === 'openai', 'C2a: nim unhealthy → openai promoted to primary');
  assert(qnUnhealthy.fallback === 'nim',    'C2b: nim demoted to fallback');
  assert(qnUnhealthy.reason.includes('unhealthy'), 'C2c: reason reflects swap');
  resetAll();

  // C3: unhealthy primary on OpenAI-side mode
  forceUnhealthy('openai', Date.now() + 60_000);
  const rcUnhealthy = selectProvider('recovery_coach');
  assert(rcUnhealthy.primary  === 'nim',    'C3a: openai unhealthy → nim promoted');
  assert(rcUnhealthy.fallback === 'openai', 'C3b: openai demoted to fallback');
  resetAll();

  // C4: FORCE_PROVIDER bypasses health check
  _forceProvider = 'openai';
  forceUnhealthy('openai', Date.now() + 60_000);
  const forced = selectProvider('quick_nudge');
  assert(forced.primary === 'openai', 'C4: FORCE_PROVIDER ignores health — openai pinned even if unhealthy');
  _forceProvider = '';
  resetAll();

  // C5: both providers healthy → no swap for unknown mode
  const unknown = selectProvider('some_future_mode');
  assert(unknown.primary === 'openai', 'C5: unknown mode defaults to openai when healthy');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// D. routeTextRequest — timeout + fallback + health integration
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nD. routeTextRequest — timeout + fallback + health integration');

await (async () => {
  _forceProvider = '';
  const signal = new AbortController().signal;

  // D1: primary success — no fallback, no timeout
  resetAll();
  const providers1 = { openai: makeStub('openai', 'ok'), nim: makeStub('nim', 'ok') };
  const r1 = await routeTextRequestWith(providers1, '', [], 'hi', signal, 'quick_nudge');
  assert(r1.providerSelected  === 'nim',   'D1a: quick_nudge selected nim');
  assert(r1.providerUsed      === 'nim',   'D1b: nim used directly');
  assert(r1.fallbackOccurred  === false,   'D1c: no fallback');
  assert(r1.timeoutOccurred   === false,   'D1d: no timeout');
  assert(r1.failureReason     === null,    'D1e: no failure reason');
  assert(typeof r1.healthAtSelection.openai === 'string', 'D1f: healthAtSelection populated');

  // D2: primary throws (non-timeout) → fallback used
  resetAll();
  const providers2 = { openai: makeStub('openai', 'ok'), nim: makeStub('nim', 'throw') };
  const r2 = await routeTextRequestWith(providers2, '', [], 'hi', signal, 'quick_nudge');
  assert(r2.providerSelected  === 'nim',    'D2a: nim still selected (policy)');
  assert(r2.providerUsed      === 'openai', 'D2b: openai used via fallback');
  assert(r2.fallbackOccurred  === true,     'D2c: fallback occurred');
  assert(r2.timeoutOccurred   === false,    'D2d: no timeout (throw, not timeout)');
  assert(r2.failureReason     !== null,     'D2e: failureReason set');
  assert(r2.failureReason!.includes('nim provider error'), 'D2f: failureReason contains primary msg');

  // D3: primary TIMES OUT → fallback used, timeoutOccurred=true
  resetAll();
  const slowBudget = { totalMs: 28_000, primaryMs: 20, fallbackMs: 12_000 };
  const providers3 = { openai: makeStub('openai', 'ok'), nim: makeStub('nim', 'slow', 200) };
  const r3 = await routeTextRequestWith(providers3, '', [], 'hi', signal, 'quick_nudge', slowBudget);
  assert(r3.fallbackOccurred === true,    'D3a: fallback after primary timeout');
  assert(r3.timeoutOccurred  === true,    'D3b: timeoutOccurred=true when primary times out');
  assert(r3.providerUsed     === 'openai','D3c: openai used after nim timeout');
  assert(r3.failureReason!.includes('timed out'), 'D3d: failureReason mentions timeout');

  // D4: primary succeeds with health-swapped provider (nim unhealthy)
  resetAll();
  forceUnhealthy('nim', Date.now() + 60_000);
  const providers4 = { openai: makeStub('openai', 'ok'), nim: makeStub('nim', 'throw') };
  const r4 = await routeTextRequestWith(providers4, '', [], 'hi', signal, 'quick_nudge');
  // nim unhealthy → selectProvider returns {primary:'openai', fallback:'nim'}
  // providerSelected = 'openai' (the effective health-aware selection)
  assert(r4.providerSelected === 'openai', 'D4a: providerSelected = openai (health-aware swap)');
  assert(r4.providerUsed     === 'openai', 'D4b: openai actually ran (swapped primary)');
  assert(r4.fallbackOccurred === false,    'D4c: no fallback — openai ran as promoted primary');
  resetAll();

  // D5: both providers throw → GatewayError
  const providers5 = { openai: makeStub('openai', 'throw'), nim: makeStub('nim', 'throw') };
  await assertThrowsName(
    () => routeTextRequestWith(providers5, '', [], 'hi', signal, 'recovery_coach'),
    'GatewayError',
    'D5: both fail → GatewayError thrown',
  );
  resetAll();

  // D6: GatewayError carries timeoutOccurred and healthAtSelection
  const smallPrimary = { totalMs: 28_000, primaryMs: 20, fallbackMs: 12_000 };
  const providers6 = { openai: makeStub('openai', 'throw'), nim: makeStub('nim', 'slow', 300) };
  try {
    await routeTextRequestWith(providers6, '', [], 'hi', signal, 'quick_nudge', smallPrimary);
    assert(false, 'D6: expected GatewayError');
  } catch (e: unknown) {
    assert(e instanceof GatewayError,     'D6a: thrown error is GatewayError');
    assert((e as GatewayError).timeoutOccurred === true, 'D6b: timeoutOccurred=true in GatewayError');
    assert(typeof (e as GatewayError).healthAtSelection === 'object', 'D6c: healthAtSelection in GatewayError');
  }
  resetAll();

  // D7: parent AbortError propagates without fallback
  const ac = new AbortController();
  const providers7 = { openai: makeStub('openai', 'ok'), nim: makeStub('nim', 'slow', 500) };
  setTimeout(() => ac.abort(), 10);
  await assertThrowsName(
    () => routeTextRequestWith(providers7, '', [], 'hi', ac.signal, 'quick_nudge'),
    'AbortError',
    'D7: parent AbortError propagates — no fallback',
  );
  resetAll();

  // D8: health state updated after success / failure
  const providers8 = { openai: makeStub('openai', 'ok'), nim: makeStub('nim', 'throw') };
  await routeTextRequestWith(providers8, '', [], 'hi', signal, 'quick_nudge');
  // nim should have 1 failure recorded (not yet unhealthy)
  assert(getConsecutiveFailures('nim') === 1,        'D8a: nim failure count incremented after primary fail');
  assert(getProviderHealth('openai')   === 'healthy', 'D8b: openai still healthy after success');
  resetAll();

  // D9: failure threshold integration — 3 gateway calls with nim always failing
  const providers9 = { openai: makeStub('openai', 'ok'), nim: makeStub('nim', 'throw') };
  for (let i = 0; i < 3; i++) {
    await routeTextRequestWith(providers9, '', [], 'hi', signal, 'quick_nudge');
  }
  assert(getProviderHealth('nim') === 'unhealthy', 'D9: nim marked unhealthy after 3 primary failures through router');
  // 4th call: nim unhealthy → openai promoted to primary (no fallback needed)
  resetAll();
})();

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n──────────────────────────────────────────`);
console.log(`Batch 16 Reliability Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll tests passed.');
}

} // end main

main().catch((err) => { console.error(err); process.exit(1); });
