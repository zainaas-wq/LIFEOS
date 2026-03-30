/**
 * Batch 15 — Provider Router Tests
 *
 * Tests for selectProvider() routing decisions and modelNameForLogging().
 * These are pure routing logic tests — no network calls, no Deno runtime.
 *
 * Strategy: reproduce the routing table and selection logic in-process
 * with a minimal Deno env stub so we can test in Node (npx tsx).
 *
 * Coverage:
 *   1.  selectProvider — all 5 known aiModes route correctly
 *   2.  selectProvider — unknown/absent mode defaults to OpenAI
 *   3.  selectProvider — FORCE_PROVIDER=openai overrides all modes
 *   4.  selectProvider — FORCE_PROVIDER=nim overrides all modes
 *   5.  selectProvider — fallback is always the other provider
 *   6.  modelNameForLogging — returns correct model string per provider
 *   7.  routeTextRequest — uses primary on success (no fallback)
 *   8.  routeTextRequest — uses fallback when primary throws non-abort error
 *   9.  routeTextRequest — throws (both failed) when fallback also throws
 *   10. routeTextRequest — AbortError propagates immediately, no fallback
 */

// ─── Minimal Deno stub (Node-safe) ───────────────────────────────────────────

let _forceProvider = '';

const Deno = {
  env: {
    get: (key: string) => {
      if (key === 'FORCE_PROVIDER') return _forceProvider;
      return '';
    },
  },
};
(globalThis as any).Deno = Deno;

// ─── Inline routing logic (mirrors providerRouter.ts — no Deno imports) ──────

type ProviderName    = 'openai' | 'nim';
type AIRequestMode   = 'quick_nudge' | 'focused_answer' | 'recovery_coach' | 'strategic_planning' | 'review_reflection';

interface RoutingDecision {
  primary:  ProviderName;
  fallback: ProviderName;
  reason:   string;
}

interface ProviderResult {
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number; provider: ProviderName };
}

interface RouteExecutionResult {
  result:           ProviderResult;
  providerSelected: ProviderName;
  providerUsed:     ProviderName;
  fallbackOccurred: boolean;
  latencyMs:        number;
}

interface HistoryMessage { role: 'user' | 'assistant'; content: string; }

const ROUTING_TABLE: Record<AIRequestMode, { primary: ProviderName; reason: string }> = {
  quick_nudge:        { primary: 'nim',    reason: 'short action request — NIM is faster and cheaper' },
  focused_answer:     { primary: 'nim',    reason: 'conversational — NIM handles well at lower cost' },
  recovery_coach:     { primary: 'openai', reason: 'requires empathy and nuance — OpenAI quality' },
  strategic_planning: { primary: 'openai', reason: 'complex multi-step planning — OpenAI reasoning' },
  review_reflection:  { primary: 'openai', reason: 'interpretive analysis of patterns — OpenAI quality' },
};

function selectProvider(aiMode?: string): RoutingDecision {
  const force = ((globalThis as any).Deno.env.get('FORCE_PROVIDER') ?? '').trim().toLowerCase() as ProviderName | '';
  if (force === 'openai' || force === 'nim') {
    const fallback: ProviderName = force === 'openai' ? 'nim' : 'openai';
    return { primary: force, fallback, reason: 'forced by FORCE_PROVIDER env var' };
  }
  const mode = aiMode as AIRequestMode | undefined;
  if (mode && ROUTING_TABLE[mode]) {
    const entry   = ROUTING_TABLE[mode];
    const fallback: ProviderName = entry.primary === 'openai' ? 'nim' : 'openai';
    return { primary: entry.primary, fallback, reason: entry.reason };
  }
  return { primary: 'openai', fallback: 'nim', reason: 'unknown mode — defaulting to OpenAI' };
}

function modelNameForLogging(provider: ProviderName): string {
  if (provider === 'nim') return 'meta/llama-3.1-8b-instruct';
  return 'gpt-4o-mini';
}

// ─── Stub provider factory ────────────────────────────────────────────────────

function makeStubProvider(name: ProviderName, behaviour: 'ok' | 'throw' | 'abort') {
  return {
    name,
    async callText(_sys: string, _hist: HistoryMessage[], _msg: string, signal: AbortSignal): Promise<ProviderResult> {
      if (behaviour === 'abort') {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }
      if (behaviour === 'throw') {
        throw new Error(`${name} provider error`);
      }
      return {
        content: `reply from ${name}`,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, provider: name },
      };
    },
  };
}

async function routeTextRequestWithProviders(
  providers: Record<ProviderName, ReturnType<typeof makeStubProvider>>,
  systemPrompt: string,
  history: HistoryMessage[],
  userMessage: string,
  signal: AbortSignal,
  aiMode?: string,
): Promise<RouteExecutionResult> {
  const decision = selectProvider(aiMode);
  const startMs  = Date.now();
  const primary  = providers[decision.primary];
  const fallback = providers[decision.fallback];

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
    if (primaryErr instanceof Error && (primaryErr.name === 'AbortError' || primaryMsg.includes('aborted'))) {
      throw primaryErr;
    }
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
      throw new Error(
        `All providers failed. Primary (${decision.primary}): ${primaryMsg}. Fallback (${decision.fallback}): ${fallbackMsg}`,
      );
    }
  }
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

async function assertThrows(fn: () => Promise<unknown>, msgIncludes: string, label: string): Promise<void> {
  try {
    await fn();
    console.error(`  ✗ FAIL: ${label} — expected throw but did not throw`);
    failed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes(msgIncludes)) {
      console.log(`  ✓ PASS: ${label}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${label} — threw but wrong message: "${msg}"`);
      failed++;
    }
  }
}

// ─── Section 1: selectProvider — mode routing ─────────────────────────────────

console.log('\n1. selectProvider — mode routing');

(function () {
  _forceProvider = '';

  const qn = selectProvider('quick_nudge');
  assert(qn.primary === 'nim',    'quick_nudge → primary = nim');
  assert(qn.fallback === 'openai','quick_nudge → fallback = openai');

  const fa = selectProvider('focused_answer');
  assert(fa.primary === 'nim',    'focused_answer → primary = nim');
  assert(fa.fallback === 'openai','focused_answer → fallback = openai');

  const rc = selectProvider('recovery_coach');
  assert(rc.primary === 'openai', 'recovery_coach → primary = openai');
  assert(rc.fallback === 'nim',   'recovery_coach → fallback = nim');

  const sp = selectProvider('strategic_planning');
  assert(sp.primary === 'openai', 'strategic_planning → primary = openai');
  assert(sp.fallback === 'nim',   'strategic_planning → fallback = nim');

  const rr = selectProvider('review_reflection');
  assert(rr.primary === 'openai', 'review_reflection → primary = openai');
  assert(rr.fallback === 'nim',   'review_reflection → fallback = nim');
})();

// ─── Section 2: selectProvider — unknown / absent mode ───────────────────────

console.log('\n2. selectProvider — unknown/absent mode defaults to OpenAI');

(function () {
  _forceProvider = '';

  const unknown = selectProvider('some_future_mode');
  assert(unknown.primary === 'openai',  'unknown mode → primary = openai');
  assert(unknown.fallback === 'nim',    'unknown mode → fallback = nim');
  assert(unknown.reason.includes('unknown'), 'unknown mode → reason mentions unknown');

  const absent = selectProvider(undefined);
  assert(absent.primary === 'openai',   'absent mode → primary = openai');
  assert(absent.fallback === 'nim',     'absent mode → fallback = nim');

  const empty = selectProvider('');
  assert(empty.primary === 'openai',    'empty string mode → primary = openai');
})();

// ─── Section 3: selectProvider — FORCE_PROVIDER=openai ───────────────────────

console.log('\n3. selectProvider — FORCE_PROVIDER=openai overrides all modes');

(function () {
  _forceProvider = 'openai';

  for (const mode of ['quick_nudge', 'focused_answer', 'recovery_coach', 'strategic_planning', 'review_reflection', undefined]) {
    const d = selectProvider(mode as string | undefined);
    assert(d.primary === 'openai', `FORCE=openai, mode=${mode ?? 'undefined'} → primary = openai`);
    assert(d.fallback === 'nim',   `FORCE=openai, mode=${mode ?? 'undefined'} → fallback = nim`);
    assert(d.reason === 'forced by FORCE_PROVIDER env var', `FORCE=openai, mode=${mode ?? 'undefined'} → reason is forced`);
  }
})();

// ─── Section 4: selectProvider — FORCE_PROVIDER=nim ──────────────────────────

console.log('\n4. selectProvider — FORCE_PROVIDER=nim overrides all modes');

(function () {
  _forceProvider = 'nim';

  for (const mode of ['quick_nudge', 'recovery_coach', 'strategic_planning', undefined]) {
    const d = selectProvider(mode as string | undefined);
    assert(d.primary === 'nim',    `FORCE=nim, mode=${mode ?? 'undefined'} → primary = nim`);
    assert(d.fallback === 'openai',`FORCE=nim, mode=${mode ?? 'undefined'} → fallback = openai`);
  }

  _forceProvider = '';
})();

// ─── Section 5: selectProvider — fallback is always the other provider ────────

console.log('\n5. selectProvider — fallback is always the other provider');

(function () {
  _forceProvider = '';
  const modes = ['quick_nudge', 'focused_answer', 'recovery_coach', 'strategic_planning', 'review_reflection'];
  for (const mode of modes) {
    const d = selectProvider(mode);
    assert(
      d.primary !== d.fallback,
      `mode=${mode} — primary (${d.primary}) ≠ fallback (${d.fallback})`,
    );
    assert(
      (d.primary === 'openai' && d.fallback === 'nim') ||
      (d.primary === 'nim'    && d.fallback === 'openai'),
      `mode=${mode} — both providers are valid names`,
    );
  }
})();

// ─── Section 6: modelNameForLogging ──────────────────────────────────────────

console.log('\n6. modelNameForLogging');

(function () {
  assert(modelNameForLogging('openai') === 'gpt-4o-mini',                'openai → gpt-4o-mini');
  assert(modelNameForLogging('nim')    === 'meta/llama-3.1-8b-instruct', 'nim → meta/llama-3.1-8b-instruct');
})();

// ─── Async sections (wrapped in main) ─────────────────────────────────────────

async function main() {

// ─── Section 7: routeTextRequest — primary succeeds (no fallback) ─────────────

console.log('\n7. routeTextRequest — primary succeeds, no fallback');

await (async function () {
  _forceProvider = '';
  const providers = {
    openai: makeStubProvider('openai', 'ok'),
    nim:    makeStubProvider('nim',    'ok'),
  };
  const signal = new AbortController().signal;

  // quick_nudge → NIM primary
  const r1 = await routeTextRequestWithProviders(providers, 'sys', [], 'hello', signal, 'quick_nudge');
  assert(r1.providerSelected === 'nim',    'quick_nudge: providerSelected = nim');
  assert(r1.providerUsed     === 'nim',    'quick_nudge: providerUsed = nim');
  assert(r1.fallbackOccurred === false,    'quick_nudge: no fallback');
  assert(r1.result.content   === 'reply from nim', 'quick_nudge: content from nim');

  // recovery_coach → OpenAI primary
  const r2 = await routeTextRequestWithProviders(providers, 'sys', [], 'help me', signal, 'recovery_coach');
  assert(r2.providerSelected === 'openai', 'recovery_coach: providerSelected = openai');
  assert(r2.providerUsed     === 'openai', 'recovery_coach: providerUsed = openai');
  assert(r2.fallbackOccurred === false,    'recovery_coach: no fallback');
})();

// ─── Section 8: routeTextRequest — primary fails, fallback succeeds ───────────

console.log('\n8. routeTextRequest — primary fails, fallback succeeds');

await (async function () {
  _forceProvider = '';

  // quick_nudge: NIM fails → fallback to OpenAI
  const providers = {
    openai: makeStubProvider('openai', 'ok'),
    nim:    makeStubProvider('nim',    'throw'),
  };
  const signal = new AbortController().signal;

  const r = await routeTextRequestWithProviders(providers, 'sys', [], 'help', signal, 'quick_nudge');
  assert(r.providerSelected === 'nim',    'fallback path: providerSelected = nim (original policy)');
  assert(r.providerUsed     === 'openai', 'fallback path: providerUsed = openai (actual handler)');
  assert(r.fallbackOccurred === true,     'fallback path: fallbackOccurred = true');
  assert(r.result.content   === 'reply from openai', 'fallback path: content from openai');
  assert(typeof r.latencyMs === 'number', 'fallback path: latencyMs is a number');
})();

// ─── Section 9: routeTextRequest — both fail → throws ─────────────────────────

console.log('\n9. routeTextRequest — both providers fail → throws');

await (async function () {
  _forceProvider = '';

  const providers = {
    openai: makeStubProvider('openai', 'throw'),
    nim:    makeStubProvider('nim',    'throw'),
  };
  const signal = new AbortController().signal;

  await assertThrows(
    () => routeTextRequestWithProviders(providers, 'sys', [], 'help', signal, 'recovery_coach'),
    'All providers failed',
    'both fail → error message starts with "All providers failed"',
  );

  await assertThrows(
    () => routeTextRequestWithProviders(providers, 'sys', [], 'help', signal, 'quick_nudge'),
    'Primary (nim)',
    'both fail → error message includes primary provider name',
  );
})();

// ─── Section 10: routeTextRequest — AbortError propagates, no fallback ────────

console.log('\n10. routeTextRequest — AbortError propagates without fallback');

await (async function () {
  _forceProvider = '';

  // nim aborts, openai is ok — but we should NOT fall back on abort
  const providers = {
    openai: makeStubProvider('openai', 'ok'),
    nim:    makeStubProvider('nim',    'abort'),
  };
  const signal = new AbortController().signal;

  await assertThrows(
    () => routeTextRequestWithProviders(providers, 'sys', [], 'hello', signal, 'quick_nudge'),
    'aborted',
    'AbortError propagates without attempting fallback',
  );
})();

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n──────────────────────────────────────────`);
console.log(`Batch 15 Router Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll tests passed.');
}

} // end main

main().catch((err) => { console.error(err); process.exit(1); });
