/**
 * Batch 17 — Operator Policy Tests
 *
 * Tests for:
 *   A. operatorPolicy — all 5 pure functions with Deno.env stub
 *   B. selectProvider — operator-aware routing decisions
 *   C. routeTextRequest — allDisabled + fallbackDisabled integration
 *
 * All logic inlined for Node (npx tsx) — no Deno runtime required.
 */

// ─── Deno env stub ────────────────────────────────────────────────────────────

const _env: Record<string, string> = {};

function setEnv(key: string, val: string)  { _env[key] = val; }
function clearEnv(key: string)             { delete _env[key]; }
function clearAllEnv()                     { for (const k of Object.keys(_env)) delete _env[k]; }

(globalThis as any).Deno = { env: { get: (k: string) => _env[k] ?? '' } };

// ─── Inline: operatorPolicy ───────────────────────────────────────────────────

type ProviderName = 'openai' | 'nim';

const QUALITY_CRITICAL_MODES = new Set(['recovery_coach', 'strategic_planning', 'review_reflection']);
const LOW_BALANCE_THRESHOLD  = 5;

function getForcedProvider(): ProviderName | null {
  const val = (_env['FORCE_PROVIDER'] ?? '').trim().toLowerCase();
  if (val === 'openai' || val === 'nim') return val;
  return null;
}

function isProviderDisabled(p: ProviderName): boolean {
  const raw = _env['DISABLED_PROVIDERS'] ?? '';
  if (!raw.trim()) return false;
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(p);
}

function shouldForceCheapMode(balance: number | null, aiMode?: string): boolean {
  if (aiMode && QUALITY_CRITICAL_MODES.has(aiMode)) return false;
  if ((_env['FORCE_CHEAP_MODE'] ?? '').trim().toLowerCase() === 'true') return true;
  if (balance !== null && balance <= LOW_BALANCE_THRESHOLD) return true;
  return false;
}

function getMaxCreditsPerRequest(): number | null {
  const raw = (_env['MAX_CREDITS_PER_REQUEST'] ?? '').trim();
  if (!raw) return null;
  const val = parseInt(raw, 10);
  if (isNaN(val) || val <= 0) return null;
  return val;
}

function shouldBypassFallback(aiMode?: string): boolean {
  if (!aiMode) return false;
  const raw = _env['DISABLE_FALLBACK_MODES'] ?? '';
  if (!raw.trim()) return false;
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(aiMode.toLowerCase());
}

// ─── Inline: providerHealth ───────────────────────────────────────────────────

type ProviderHealthState = 'healthy' | 'unhealthy';

interface HealthEntry { consecutiveFailures: number; unhealthyUntilMs: number | null; }
const _hState: Record<ProviderName, HealthEntry> = {
  openai: { consecutiveFailures: 0, unhealthyUntilMs: null },
  nim:    { consecutiveFailures: 0, unhealthyUntilMs: null },
};
function getProviderHealth(p: ProviderName): ProviderHealthState {
  const e = _hState[p];
  if (e.unhealthyUntilMs !== null) {
    if (Date.now() < e.unhealthyUntilMs) return 'unhealthy';
    e.consecutiveFailures = 0; e.unhealthyUntilMs = null;
  }
  return 'healthy';
}
function recordProviderSuccess(p: ProviderName) { _hState[p].consecutiveFailures = 0; _hState[p].unhealthyUntilMs = null; }
function recordProviderFailure(p: ProviderName) {
  const e = _hState[p];
  if (e.unhealthyUntilMs !== null && Date.now() < e.unhealthyUntilMs) return;
  e.consecutiveFailures++;
  if (e.consecutiveFailures >= 3) e.unhealthyUntilMs = Date.now() + 60_000;
}
function getHealthSnapshot(): Record<ProviderName, ProviderHealthState> {
  return { openai: getProviderHealth('openai'), nim: getProviderHealth('nim') };
}
function resetAllHealth() {
  _hState.openai = { consecutiveFailures: 0, unhealthyUntilMs: null };
  _hState.nim    = { consecutiveFailures: 0, unhealthyUntilMs: null };
}
function forceUnhealthy(p: ProviderName) { _hState[p].consecutiveFailures = 3; _hState[p].unhealthyUntilMs = Date.now() + 60_000; }

// ─── Inline: routing types + selectProvider ───────────────────────────────────

type AIRequestMode = 'quick_nudge' | 'focused_answer' | 'recovery_coach' | 'strategic_planning' | 'review_reflection';

interface RoutingDecision {
  primary: ProviderName; fallback: ProviderName; reason: string;
  operatorForcedProvider: ProviderName | null;
  operatorCheapMode: boolean;
  operatorDisabledProvider: ProviderName | null;
  fallbackDisabled: boolean;
  allDisabled: boolean;
}

const ROUTING_TABLE: Record<AIRequestMode, { primary: ProviderName }> = {
  quick_nudge:        { primary: 'nim' },
  focused_answer:     { primary: 'nim' },
  recovery_coach:     { primary: 'openai' },
  strategic_planning: { primary: 'openai' },
  review_reflection:  { primary: 'openai' },
};

function selectProvider(aiMode?: string, balance?: number | null): RoutingDecision {
  let operatorForcedProvider:   ProviderName | null = null;
  let operatorCheapMode:        boolean             = false;
  let operatorDisabledProvider: ProviderName | null = null;

  // 1. FORCE_PROVIDER
  const forced = getForcedProvider();
  if (forced) {
    operatorForcedProvider = forced;
    const fallback: ProviderName = forced === 'openai' ? 'nim' : 'openai';
    const fallbackDisabled = isProviderDisabled(fallback) || shouldBypassFallback(aiMode);
    return { primary: forced, fallback, reason: 'forced by FORCE_PROVIDER',
             operatorForcedProvider, operatorCheapMode, operatorDisabledProvider,
             fallbackDisabled, allDisabled: false };
  }

  // 2. Routing table
  const mode  = aiMode as AIRequestMode | undefined;
  const entry = mode ? ROUTING_TABLE[mode] : undefined;
  let primary: ProviderName  = entry?.primary ?? 'openai';
  let fallback: ProviderName = primary === 'openai' ? 'nim' : 'openai';
  let reason = mode ? `table: ${mode}` : 'unknown mode — defaulting to OpenAI';

  // 3. Cheap mode
  const cheapMode = shouldForceCheapMode(balance ?? null, aiMode);
  if (cheapMode) {
    operatorCheapMode = true;
    primary = 'nim'; fallback = 'openai';
    reason = `cheap mode active`;
  }

  // 4. Disabled provider
  const primaryDisabled         = isProviderDisabled(primary);
  const fallbackDisabledByPol   = isProviderDisabled(fallback);

  if (primaryDisabled) {
    operatorDisabledProvider = primary;
    if (fallbackDisabledByPol) {
      return { primary, fallback, reason: 'all providers disabled',
               operatorForcedProvider, operatorCheapMode, operatorDisabledProvider,
               fallbackDisabled: true, allDisabled: true };
    }
    const tmp = primary; primary = fallback; fallback = tmp;
    reason = `${reason} [${operatorDisabledProvider} disabled]`;
  }

  // 5. Health
  if (getProviderHealth(primary) === 'unhealthy') {
    const tmp = primary; primary = fallback; fallback = tmp;
    reason = `${reason} [primary unhealthy — swapped]`;
  }

  // 6. Fallback disabled?
  const fallbackDisabled =
    fallbackDisabledByPol || isProviderDisabled(fallback) || shouldBypassFallback(aiMode);

  return { primary, fallback, reason, operatorForcedProvider, operatorCheapMode,
           operatorDisabledProvider, fallbackDisabled, allDisabled: false };
}

// ─── Inline: GatewayError + routeTextRequest stub ────────────────────────────

class GatewayError extends Error {
  constructor(msg: string,
    public readonly timeoutOccurred: boolean,
    public readonly healthAtSelection: Record<ProviderName, ProviderHealthState>) {
    super(msg); this.name = 'GatewayError';
  }
}

interface ProviderResult { content: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number; provider: ProviderName }; }
interface RouteExecutionResult {
  result: ProviderResult; providerSelected: ProviderName; providerUsed: ProviderName;
  fallbackOccurred: boolean; latencyMs: number; timeoutOccurred: boolean;
  failureReason: string | null; healthAtSelection: Record<ProviderName, ProviderHealthState>;
  operatorForcedProvider: ProviderName | null; operatorCheapMode: boolean;
  operatorDisabledProvider: ProviderName | null;
}

type ProviderBehaviour = 'ok' | 'throw';
function makeProvider(name: ProviderName, b: ProviderBehaviour) {
  return {
    async callText(): Promise<ProviderResult> {
      if (b === 'throw') throw new Error(`${name} failed`);
      return { content: `reply from ${name}`, usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15, provider: name } };
    },
  };
}

async function routeWith(
  providers: Record<ProviderName, { callText(): Promise<ProviderResult> }>,
  aiMode?: string, balance?: number | null,
): Promise<RouteExecutionResult> {
  const healthAtSelection = getHealthSnapshot();
  const decision          = selectProvider(aiMode, balance);
  const startMs           = Date.now();
  const { operatorForcedProvider, operatorCheapMode, operatorDisabledProvider } = decision;

  if (decision.allDisabled) {
    throw new GatewayError('All providers disabled', false, healthAtSelection);
  }

  try {
    const result = await providers[decision.primary].callText();
    recordProviderSuccess(decision.primary);
    return { result, providerSelected: decision.primary, providerUsed: decision.primary,
             fallbackOccurred: false, latencyMs: Date.now() - startMs,
             timeoutOccurred: false, failureReason: null, healthAtSelection,
             operatorForcedProvider, operatorCheapMode, operatorDisabledProvider };
  } catch (primaryErr: unknown) {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    recordProviderFailure(decision.primary);
    if (decision.fallbackDisabled) {
      throw new GatewayError(`Primary failed, fallback disabled: ${primaryMsg}`, false, healthAtSelection);
    }
    try {
      const result = await providers[decision.fallback].callText();
      recordProviderSuccess(decision.fallback);
      return { result, providerSelected: decision.primary, providerUsed: decision.fallback,
               fallbackOccurred: true, latencyMs: Date.now() - startMs,
               timeoutOccurred: false, failureReason: primaryMsg, healthAtSelection,
               operatorForcedProvider, operatorCheapMode, operatorDisabledProvider };
    } catch (fbErr: unknown) {
      const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
      recordProviderFailure(decision.fallback);
      throw new GatewayError(`All providers failed. ${primaryMsg} / ${fbMsg}`, false, healthAtSelection);
    }
  }
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0; let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) { console.log(`  ✓ PASS: ${label}`); passed++; }
  else       { console.error(`  ✗ FAIL: ${label}`); failed++; }
}
async function assertThrowsName(fn: () => Promise<unknown>, name: string, label: string) {
  try { await fn(); console.error(`  ✗ FAIL: ${label} — did not throw`); failed++; }
  catch (e: unknown) {
    const got = e instanceof Error ? e.name : '?';
    if (got === name) { console.log(`  ✓ PASS: ${label}`); passed++; }
    else { console.error(`  ✗ FAIL: ${label} — threw ${got}, wanted ${name}`); failed++; }
  }
}
async function assertThrowsMsg(fn: () => Promise<unknown>, substr: string, label: string) {
  try { await fn(); console.error(`  ✗ FAIL: ${label} — did not throw`); failed++; }
  catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes(substr)) { console.log(`  ✓ PASS: ${label}`); passed++; }
    else { console.error(`  ✗ FAIL: ${label} — msg: "${msg}"`); failed++; }
  }
}

async function main() {

// ═══════════════════════════════════════════════════════════════════════════════
// A. operatorPolicy — pure functions
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nA1. getForcedProvider');
(function () {
  clearAllEnv();
  assert(getForcedProvider() === null, 'A1a: empty env → null');
  setEnv('FORCE_PROVIDER', 'openai');
  assert(getForcedProvider() === 'openai', 'A1b: FORCE_PROVIDER=openai → openai');
  setEnv('FORCE_PROVIDER', 'nim');
  assert(getForcedProvider() === 'nim', 'A1c: FORCE_PROVIDER=nim → nim');
  setEnv('FORCE_PROVIDER', 'OPENAI');  // uppercase
  assert(getForcedProvider() === 'openai', 'A1d: uppercase OPENAI → openai');
  setEnv('FORCE_PROVIDER', 'anthropic');
  assert(getForcedProvider() === null, 'A1e: unknown provider → null');
  setEnv('FORCE_PROVIDER', '  nim  '); // whitespace
  assert(getForcedProvider() === 'nim', 'A1f: trimmed whitespace');
  clearAllEnv();
})();

console.log('\nA2. isProviderDisabled');
(function () {
  clearAllEnv();
  assert(!isProviderDisabled('nim'),    'A2a: empty env → nim not disabled');
  assert(!isProviderDisabled('openai'), 'A2b: empty env → openai not disabled');
  setEnv('DISABLED_PROVIDERS', 'nim');
  assert( isProviderDisabled('nim'),    'A2c: nim in list → disabled');
  assert(!isProviderDisabled('openai'), 'A2d: openai not in list → enabled');
  setEnv('DISABLED_PROVIDERS', 'nim,openai');
  assert(isProviderDisabled('nim'),    'A2e: both listed → nim disabled');
  assert(isProviderDisabled('openai'), 'A2f: both listed → openai disabled');
  setEnv('DISABLED_PROVIDERS', ' nim , openai '); // spaces
  assert(isProviderDisabled('nim'),    'A2g: whitespace trimmed');
  setEnv('DISABLED_PROVIDERS', 'NIM'); // uppercase
  assert(isProviderDisabled('nim'),    'A2h: case insensitive');
  clearAllEnv();
})();

console.log('\nA3. shouldForceCheapMode');
(function () {
  clearAllEnv();
  // Quality-critical modes always return false
  assert(!shouldForceCheapMode(null,  'recovery_coach'),    'A3a: recovery_coach exempt (null balance)');
  assert(!shouldForceCheapMode(0,     'strategic_planning'),'A3b: strategic_planning exempt (zero balance)');
  assert(!shouldForceCheapMode(null,  'review_reflection'), 'A3c: review_reflection exempt');
  setEnv('FORCE_CHEAP_MODE', 'true');
  assert(!shouldForceCheapMode(null,  'recovery_coach'),    'A3d: recovery_coach exempt even with FORCE_CHEAP_MODE');
  assert( shouldForceCheapMode(null,  'quick_nudge'),       'A3e: FORCE_CHEAP_MODE → quick_nudge → true');
  assert( shouldForceCheapMode(null,  'focused_answer'),    'A3f: FORCE_CHEAP_MODE → focused_answer → true');
  assert( shouldForceCheapMode(null,  undefined),           'A3g: FORCE_CHEAP_MODE → no mode → true');
  clearAllEnv();
  // Auto cheap on low balance (≤5)
  assert( shouldForceCheapMode(5,     'quick_nudge'),       'A3h: balance=5 (threshold) → cheap');
  assert( shouldForceCheapMode(3,     'focused_answer'),    'A3i: balance=3 → cheap');
  assert( shouldForceCheapMode(0,     'quick_nudge'),       'A3j: balance=0 → cheap');
  assert(!shouldForceCheapMode(6,     'quick_nudge'),       'A3k: balance=6 → not cheap');
  assert(!shouldForceCheapMode(null,  'quick_nudge'),       'A3l: balance=null → not cheap (no auto)');
  // FORCE_CHEAP_MODE=false explicit
  setEnv('FORCE_CHEAP_MODE', 'false');
  assert(!shouldForceCheapMode(null,  'quick_nudge'),       'A3m: FORCE_CHEAP_MODE=false → not cheap');
  clearAllEnv();
})();

console.log('\nA4. getMaxCreditsPerRequest');
(function () {
  clearAllEnv();
  assert(getMaxCreditsPerRequest() === null, 'A4a: empty env → null (no cap)');
  setEnv('MAX_CREDITS_PER_REQUEST', '3');
  assert(getMaxCreditsPerRequest() === 3,    'A4b: "3" → 3');
  setEnv('MAX_CREDITS_PER_REQUEST', '10');
  assert(getMaxCreditsPerRequest() === 10,   'A4c: "10" → 10');
  setEnv('MAX_CREDITS_PER_REQUEST', '0');
  assert(getMaxCreditsPerRequest() === null, 'A4d: "0" → null (must be positive)');
  setEnv('MAX_CREDITS_PER_REQUEST', '-5');
  assert(getMaxCreditsPerRequest() === null, 'A4e: "-5" → null');
  setEnv('MAX_CREDITS_PER_REQUEST', 'abc');
  assert(getMaxCreditsPerRequest() === null, 'A4f: "abc" → null');
  setEnv('MAX_CREDITS_PER_REQUEST', '  2  ');
  assert(getMaxCreditsPerRequest() === 2,    'A4g: whitespace trimmed → 2');
  clearAllEnv();
})();

console.log('\nA5. shouldBypassFallback');
(function () {
  clearAllEnv();
  assert(!shouldBypassFallback(undefined),      'A5a: no mode → false');
  assert(!shouldBypassFallback('quick_nudge'),   'A5b: empty env → false');
  setEnv('DISABLE_FALLBACK_MODES', 'quick_nudge');
  assert( shouldBypassFallback('quick_nudge'),   'A5c: quick_nudge in list → true');
  assert(!shouldBypassFallback('recovery_coach'),'A5d: recovery_coach not in list → false');
  setEnv('DISABLE_FALLBACK_MODES', 'quick_nudge,focused_answer');
  assert( shouldBypassFallback('quick_nudge'),   'A5e: multi-list quick_nudge → true');
  assert( shouldBypassFallback('focused_answer'),'A5f: multi-list focused_answer → true');
  assert(!shouldBypassFallback('recovery_coach'),'A5g: multi-list recovery_coach → false');
  setEnv('DISABLE_FALLBACK_MODES', 'QUICK_NUDGE'); // uppercase
  assert( shouldBypassFallback('quick_nudge'),   'A5h: case insensitive');
  clearAllEnv();
})();

// ═══════════════════════════════════════════════════════════════════════════════
// B. selectProvider — operator-aware routing
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nB1. FORCE_PROVIDER overrides everything');
(function () {
  clearAllEnv(); resetAllHealth();
  setEnv('FORCE_PROVIDER', 'nim');
  const d = selectProvider('recovery_coach'); // would normally be openai
  assert(d.primary === 'nim',              'B1a: FORCE_PROVIDER=nim → primary=nim');
  assert(d.operatorForcedProvider === 'nim','B1b: operatorForcedProvider set');
  assert(d.operatorCheapMode === false,     'B1c: cheap mode not set (forced override)');
  clearAllEnv();
})();

console.log('\nB2. DISABLED_PROVIDERS swaps primary');
(function () {
  clearAllEnv(); resetAllHealth();
  setEnv('DISABLED_PROVIDERS', 'nim');
  const d = selectProvider('quick_nudge'); // table: nim
  assert(d.primary === 'openai',                     'B2a: nim disabled → openai promoted');
  assert(d.operatorDisabledProvider === 'nim',        'B2b: operatorDisabledProvider=nim');
  assert(d.fallbackDisabled === true,                 'B2c: fallback disabled (nim is fallback and disabled)');
  assert(d.allDisabled === false,                     'B2d: not allDisabled');
  clearAllEnv();
})();

console.log('\nB3. Both providers disabled → allDisabled');
(function () {
  clearAllEnv(); resetAllHealth();
  setEnv('DISABLED_PROVIDERS', 'nim,openai');
  const d = selectProvider('quick_nudge');
  assert(d.allDisabled === true,          'B3a: both disabled → allDisabled=true');
  assert(d.fallbackDisabled === true,     'B3b: fallbackDisabled=true when allDisabled');
  clearAllEnv();
})();

console.log('\nB4. Cheap mode routes to NIM for eligible modes');
(function () {
  clearAllEnv(); resetAllHealth();
  setEnv('FORCE_CHEAP_MODE', 'true');
  const qn = selectProvider('quick_nudge');    // table: nim; cheap: nim
  assert(qn.primary === 'nim',             'B4a: quick_nudge cheap → nim');
  assert(qn.operatorCheapMode === true,    'B4b: operatorCheapMode=true');
  const rc = selectProvider('recovery_coach'); // table: openai; cheap: EXEMPT
  assert(rc.primary === 'openai',          'B4c: recovery_coach exempt from cheap mode');
  assert(rc.operatorCheapMode === false,   'B4d: operatorCheapMode=false for quality-critical');
  const fa = selectProvider('focused_answer'); // table: nim; cheap: nim
  assert(fa.primary === 'nim',             'B4e: focused_answer cheap → nim');
  clearAllEnv();
})();

console.log('\nB5. Auto cheap on low balance');
(function () {
  clearAllEnv(); resetAllHealth();
  const d1 = selectProvider('quick_nudge', 3); // balance 3 ≤ 5
  assert(d1.primary === 'nim',          'B5a: balance=3 → cheap → nim');
  assert(d1.operatorCheapMode === true, 'B5b: operatorCheapMode=true');
  const d2 = selectProvider('quick_nudge', 10); // balance 10 > 5
  assert(d2.primary === 'nim',          'B5c: balance=10, table=nim → nim (no cheap needed)');
  assert(d2.operatorCheapMode === false,'B5d: operatorCheapMode=false at balance=10');
  // quality-critical exempt even at balance=0
  const d3 = selectProvider('recovery_coach', 0);
  assert(d3.primary === 'openai',       'B5e: recovery_coach at balance=0 still openai');
  assert(d3.operatorCheapMode === false,'B5f: exempt from cheap mode');
})();

console.log('\nB6. DISABLE_FALLBACK_MODES → fallbackDisabled');
(function () {
  clearAllEnv(); resetAllHealth();
  setEnv('DISABLE_FALLBACK_MODES', 'quick_nudge');
  const d = selectProvider('quick_nudge');
  assert(d.fallbackDisabled === true,  'B6a: quick_nudge in DISABLE_FALLBACK_MODES → fallbackDisabled');
  const d2 = selectProvider('recovery_coach');
  assert(d2.fallbackDisabled === false,'B6b: recovery_coach not listed → fallback enabled');
  clearAllEnv();
})();

console.log('\nB7. Disabled fallback provider → fallbackDisabled');
(function () {
  clearAllEnv(); resetAllHealth();
  // quick_nudge table: nim primary, openai fallback. Disable openai (the fallback).
  setEnv('DISABLED_PROVIDERS', 'openai');
  const d = selectProvider('quick_nudge');
  // primary=nim (not disabled), fallback=openai (disabled) → fallbackDisabled
  assert(d.primary === 'nim',          'B7a: nim still primary');
  assert(d.fallbackDisabled === true,  'B7b: openai (fallback) disabled → fallbackDisabled');
  clearAllEnv();
})();

console.log('\nB8. Operator fields null when no policy active');
(function () {
  clearAllEnv(); resetAllHealth();
  const d = selectProvider('quick_nudge', 50);
  assert(d.operatorForcedProvider === null,   'B8a: no force → null');
  assert(d.operatorCheapMode === false,        'B8b: no cheap → false');
  assert(d.operatorDisabledProvider === null,  'B8c: no disabled → null');
  assert(d.fallbackDisabled === false,         'B8d: no disable-fallback → false');
  assert(d.allDisabled === false,              'B8e: not all disabled');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// C. routeTextRequest — operator policy integration
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nC1. allDisabled → GatewayError immediately');
await (async () => {
  clearAllEnv(); resetAllHealth();
  setEnv('DISABLED_PROVIDERS', 'nim,openai');
  const providers = { openai: makeProvider('openai', 'ok'), nim: makeProvider('nim', 'ok') };
  await assertThrowsName(
    () => routeWith(providers, 'quick_nudge'),
    'GatewayError',
    'C1: allDisabled → GatewayError without calling any provider',
  );
  clearAllEnv();
})();

console.log('\nC2. fallbackDisabled → GatewayError on primary failure, no fallback');
await (async () => {
  clearAllEnv(); resetAllHealth();
  setEnv('DISABLE_FALLBACK_MODES', 'quick_nudge');
  const providers = { openai: makeProvider('openai', 'ok'), nim: makeProvider('nim', 'throw') };
  await assertThrowsMsg(
    () => routeWith(providers, 'quick_nudge'),
    'fallback disabled',
    'C2a: nim fails + fallbackDisabled → GatewayError with no fallback',
  );
  clearAllEnv();
})();

console.log('\nC3. Normal flow unchanged when no env vars set');
await (async () => {
  clearAllEnv(); resetAllHealth();
  const providers = { openai: makeProvider('openai', 'ok'), nim: makeProvider('nim', 'ok') };
  const r = await routeWith(providers, 'quick_nudge', 50);
  assert(r.providerUsed === 'nim',             'C3a: quick_nudge, no policy → nim');
  assert(r.operatorForcedProvider === null,    'C3b: no operator fields');
  assert(r.operatorCheapMode === false,        'C3c: no cheap mode');
  assert(r.operatorDisabledProvider === null,  'C3d: no disabled provider');
})();

console.log('\nC4. Cheap mode routes to NIM + operator fields in result');
await (async () => {
  clearAllEnv(); resetAllHealth();
  setEnv('FORCE_CHEAP_MODE', 'true');
  const providers = { openai: makeProvider('openai', 'ok'), nim: makeProvider('nim', 'ok') };
  const r = await routeWith(providers, 'focused_answer');
  assert(r.providerUsed === 'nim',        'C4a: cheap mode → nim');
  assert(r.operatorCheapMode === true,    'C4b: operatorCheapMode=true in result');
  clearAllEnv();
})();

console.log('\nC5. FORCE_PROVIDER overrides routing + operator fields in result');
await (async () => {
  clearAllEnv(); resetAllHealth();
  setEnv('FORCE_PROVIDER', 'openai');
  const providers = { openai: makeProvider('openai', 'ok'), nim: makeProvider('nim', 'ok') };
  const r = await routeWith(providers, 'quick_nudge'); // would normally be nim
  assert(r.providerUsed === 'openai',             'C5a: FORCE_PROVIDER=openai → openai');
  assert(r.operatorForcedProvider === 'openai',   'C5b: operatorForcedProvider in result');
  clearAllEnv();
})();

console.log('\nC6. Disabled primary → fallback succeeds, observability correct');
await (async () => {
  clearAllEnv(); resetAllHealth();
  setEnv('DISABLED_PROVIDERS', 'nim');  // nim disabled → openai promoted to primary
  const providers = { openai: makeProvider('openai', 'ok'), nim: makeProvider('nim', 'throw') };
  // With nim disabled, openai IS the primary (not fallback), so no fallback used
  const r = await routeWith(providers, 'quick_nudge');
  assert(r.providerUsed === 'openai',              'C6a: openai ran (promoted primary)');
  assert(r.fallbackOccurred === false,             'C6b: no fallback needed');
  assert(r.operatorDisabledProvider === 'nim',     'C6c: operatorDisabledProvider=nim');
  clearAllEnv();
})();

console.log('\nC7. getMaxCreditsPerRequest — cap enforced correctly');
(function () {
  clearAllEnv();
  assert(getMaxCreditsPerRequest() === null, 'C7a: unset → null');
  setEnv('MAX_CREDITS_PER_REQUEST', '2');
  const cap = getMaxCreditsPerRequest()!;
  assert(cap === 2,             'C7b: cap=2');
  assert(1 <= cap,              'C7c: text (cost=1) passes cap');
  assert(2 <= cap,              'C7d: voice (cost=2) at limit passes cap');
  assert(!(3 <= cap),           'C7e: image (cost=3) would exceed cap → reject');
  clearAllEnv();
})();

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n──────────────────────────────────────────`);
console.log(`Batch 17 Operator Policy Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) { console.error(`\n${failed} test(s) FAILED`); process.exit(1); }
else             { console.log('\nAll tests passed.'); }

} // end main

main().catch((e) => { console.error(e); process.exit(1); });
