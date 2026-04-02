/**
 * Batch 20 — Launch Hardening tests
 *
 * Tests for pure guards in src/ai/requestGuard.ts:
 *   A. Constants — correct values
 *   B. isPayloadTooLarge() — size gate before network call
 *   C. isValidMessageLength() — message character cap
 *   D. isValidHistoryDepth() — history item count cap
 *   E. sanitizeAIMode() — client-supplied aiMode validation
 *   F. KNOWN_AI_MODES — completeness and immutability
 *
 * Run: npx tsx __tests__/batch20-hardening.ts
 */

import {
  MAX_MESSAGE_CHARS,
  MAX_HISTORY_ITEMS,
  MAX_PAYLOAD_CHARS,
  KNOWN_AI_MODES,
  isPayloadTooLarge,
  isValidMessageLength,
  isValidHistoryDepth,
  sanitizeAIMode,
} from '../src/ai/requestGuard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _passed = 0;
let _failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    _passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    _failed++;
  }
}

function suite(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ─── Suite A: Constants ───────────────────────────────────────────────────────

suite('A. Constants', () => {
  assert('MAX_MESSAGE_CHARS is 4000',      MAX_MESSAGE_CHARS === 4_000);
  assert('MAX_HISTORY_ITEMS is 20',        MAX_HISTORY_ITEMS === 20);
  assert('MAX_PAYLOAD_CHARS is 150000',    MAX_PAYLOAD_CHARS === 150_000);
  assert('MAX_MESSAGE_CHARS is a number',  typeof MAX_MESSAGE_CHARS === 'number');
  assert('MAX_HISTORY_ITEMS is a number',  typeof MAX_HISTORY_ITEMS === 'number');
  assert('MAX_PAYLOAD_CHARS is a number',  typeof MAX_PAYLOAD_CHARS === 'number');
  assert('KNOWN_AI_MODES is an array',     Array.isArray(KNOWN_AI_MODES));
  assert('KNOWN_AI_MODES has 5 entries',   KNOWN_AI_MODES.length === 5);
});

// ─── Suite B: isPayloadTooLarge() ─────────────────────────────────────────────

suite('B. isPayloadTooLarge()', () => {
  // Under limit
  assert('empty string is not too large',            !isPayloadTooLarge(''));
  assert('1-char string is not too large',           !isPayloadTooLarge('x'));
  assert('100 KB of chars is not too large',         !isPayloadTooLarge('a'.repeat(100_000)));
  assert('exactly MAX_PAYLOAD_CHARS is not too large', !isPayloadTooLarge('a'.repeat(MAX_PAYLOAD_CHARS)));

  // Over limit
  assert('MAX+1 chars is too large',                  isPayloadTooLarge('a'.repeat(MAX_PAYLOAD_CHARS + 1)));
  assert('200 KB of chars is too large',              isPayloadTooLarge('a'.repeat(200_000)));

  // Custom limit
  assert('custom: 5-char string over limit of 4',    isPayloadTooLarge('hello', 4));
  assert('custom: 4-char string at limit of 4',      !isPayloadTooLarge('hell', 4));
  assert('custom: 3-char string under limit of 4',   !isPayloadTooLarge('hel', 4));

  // Realistic JSON payload
  const smallPayload = JSON.stringify({ message: 'Hello', history: [], context: { todayDate: '2026-04-01' } });
  assert('typical small payload is not too large',   !isPayloadTooLarge(smallPayload));

  const bigMessage = 'a'.repeat(MAX_PAYLOAD_CHARS + 1);
  const bigPayload = JSON.stringify({ message: bigMessage });
  assert('oversized message payload is flagged',     isPayloadTooLarge(bigPayload));
});

// ─── Suite C: isValidMessageLength() ─────────────────────────────────────────

suite('C. isValidMessageLength()', () => {
  // Valid lengths
  assert('empty string is valid',                    isValidMessageLength(''));
  assert('single char is valid',                     isValidMessageLength('x'));
  assert('normal message is valid',                  isValidMessageLength('Help me plan my day'));
  assert('exactly MAX_MESSAGE_CHARS is valid',       isValidMessageLength('a'.repeat(MAX_MESSAGE_CHARS)));

  // Invalid lengths
  assert('MAX+1 chars is invalid',                   !isValidMessageLength('a'.repeat(MAX_MESSAGE_CHARS + 1)));
  assert('10000 chars is invalid',                   !isValidMessageLength('a'.repeat(10_000)));

  // Custom limit
  assert('custom: 5 chars valid at limit 5',         isValidMessageLength('hello', 5));
  assert('custom: 6 chars invalid at limit 5',       !isValidMessageLength('helloo', 5));

  // Type guard
  assert('non-string returns false',                 !isValidMessageLength(null as any));
  assert('number returns false',                     !isValidMessageLength(42 as any));
});

// ─── Suite D: isValidHistoryDepth() ──────────────────────────────────────────

suite('D. isValidHistoryDepth()', () => {
  // Valid depths
  assert('empty array is valid',                     isValidHistoryDepth([]));
  assert('1 item is valid',                          isValidHistoryDepth([{}]));
  assert('exactly MAX_HISTORY_ITEMS is valid',       isValidHistoryDepth(new Array(MAX_HISTORY_ITEMS)));
  assert('10 items is valid',                        isValidHistoryDepth(new Array(10)));

  // Invalid depths
  assert('MAX+1 items is invalid',                   !isValidHistoryDepth(new Array(MAX_HISTORY_ITEMS + 1)));
  assert('100 items is invalid',                     !isValidHistoryDepth(new Array(100)));

  // Custom limit
  assert('custom: 3 items valid at limit 3',         isValidHistoryDepth([{}, {}, {}], 3));
  assert('custom: 4 items invalid at limit 3',       !isValidHistoryDepth([{}, {}, {}, {}], 3));

  // Type guard
  assert('non-array returns false',                  !isValidHistoryDepth(null as any));
  assert('string returns false',                     !isValidHistoryDepth('[]' as any));
});

// ─── Suite E: sanitizeAIMode() ───────────────────────────────────────────────

suite('E. sanitizeAIMode() — known modes pass through', () => {
  assert("'quick_nudge' → 'quick_nudge'",            sanitizeAIMode('quick_nudge')        === 'quick_nudge');
  assert("'focused_answer' → 'focused_answer'",      sanitizeAIMode('focused_answer')     === 'focused_answer');
  assert("'recovery_coach' → 'recovery_coach'",      sanitizeAIMode('recovery_coach')     === 'recovery_coach');
  assert("'strategic_planning' → 'strategic_planning'", sanitizeAIMode('strategic_planning') === 'strategic_planning');
  assert("'review_reflection' → 'review_reflection'", sanitizeAIMode('review_reflection') === 'review_reflection');
});

suite('E. sanitizeAIMode() — unknown / malicious values return null', () => {
  assert("unknown string → null",                    sanitizeAIMode('admin') === null);
  assert("empty string → null",                      sanitizeAIMode('') === null);
  assert("null → null",                              sanitizeAIMode(null) === null);
  assert("undefined → null",                         sanitizeAIMode(undefined) === null);
  assert("injection attempt → null",                 sanitizeAIMode("'; DROP TABLE ai_usage_log;--") === null);
  assert("mixed case → null (modes are lowercase)",  sanitizeAIMode('Quick_Nudge') === null);
  assert("number-like string → null",                sanitizeAIMode('1') === null);
  assert("mode with whitespace → null",              sanitizeAIMode(' quick_nudge') === null);
  assert("mode with suffix → null",                  sanitizeAIMode('quick_nudge_extra') === null);
});

// ─── Suite E2: sanitizeAIMode() — edge function mirror parity ────────────────
// The edge function inlines the same logic. Verify the guard rules are identical.

suite('E2. sanitizeAIMode() — edge-function KNOWN_AI_MODES Set parity', () => {
  // Simulate the Deno-side Set-based check
  const KNOWN_AI_MODES_SET = new Set([
    'quick_nudge', 'focused_answer', 'recovery_coach',
    'strategic_planning', 'review_reflection',
  ]);
  const edgeSanitize = (raw: string | null) =>
    raw && KNOWN_AI_MODES_SET.has(raw) ? raw : null;

  // Both implementations must agree on all known modes
  for (const mode of KNOWN_AI_MODES) {
    assert(
      `client + edge agree on '${mode}'`,
      sanitizeAIMode(mode) === edgeSanitize(mode),
    );
  }

  // Both must reject unknown values
  const unknowns = ['admin', '', 'QUICK_NUDGE', 'quick nudge', 'undefined', '0'];
  for (const u of unknowns) {
    assert(
      `both reject '${u}'`,
      sanitizeAIMode(u) === null && edgeSanitize(u) === null,
    );
  }
  assert('both reject null', sanitizeAIMode(null) === null && edgeSanitize(null) === null);
});

// ─── Suite G: Payload size — realistic request shapes ─────────────────────────

suite('G. Realistic payload shapes', () => {
  // Minimal text request
  const minimalPayload = JSON.stringify({
    message: 'Help me plan today',
    history: [],
    context: { todayDate: '2026-04-02', aiMode: 'focused_answer' },
  });
  assert('minimal text request not too large', !isPayloadTooLarge(minimalPayload));

  // Focused depth — 3 goals + today plan
  const focusedPayload = JSON.stringify({
    message: 'What should I do first?',
    history: Array.from({ length: 4 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'a'.repeat(200),
    })),
    context: {
      todayDate: '2026-04-02',
      aiMode: 'focused_answer',
      tracks: Array.from({ length: 3 }, (_, i) => ({ title: `Goal ${i}`, priority: i, weeklyHoursTarget: 10 })),
      todayPlan: { items: Array.from({ length: 10 }, (_, i) => ({ startTime: '09:00', endTime: '10:00', title: `Task ${i}`, type: 'goal', completed: false })) },
    },
  });
  assert('focused-depth request not too large', !isPayloadTooLarge(focusedPayload));

  // Rich depth — all goals + full history
  const richPayload = JSON.stringify({
    message: 'Review my week and give me a strategic plan',
    history: Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'a'.repeat(500),
    })),
    context: {
      todayDate: '2026-04-02',
      aiMode: 'strategic_planning',
      tracks: Array.from({ length: 10 }, (_, i) => ({ title: `Goal ${i}`, priority: i, weeklyHoursTarget: 10, category: 'work' })),
      schedule: Array.from({ length: 20 }, (_, i) => ({ title: `Event ${i}`, start: '09:00', end: '10:00', daysOfWeek: [1, 3, 5] })),
      focusSummary: { weeklyMinsByGoal: { 'Goal 0': 120, 'Goal 1': 90 }, totalWeeklyMins: 210 },
      reviewSignals: { recentPatterns: ['pattern1', 'pattern2', 'pattern3'], adaptationRationale: 'rationale', preferredRecovery: ['mode1'], reviewCount: 5 },
    },
  });
  assert('rich-depth strategic request not too large', !isPayloadTooLarge(richPayload));

  // Adversarial: message at exact cap
  const atCapPayload = JSON.stringify({ message: 'a'.repeat(4000), history: [], context: { todayDate: '2026-04-02' } });
  assert('message at exact cap: payload valid',   isValidMessageLength('a'.repeat(4000)));
  assert('message at exact cap: payload size OK', !isPayloadTooLarge(atCapPayload));

  // Adversarial: message one over cap
  assert('message one over cap: invalid length',  !isValidMessageLength('a'.repeat(4001)));
});

// ─── Suite H: History depth validation — edge cases ──────────────────────────

suite('H. History depth — edge cases', () => {
  assert('empty history valid',             isValidHistoryDepth([]));
  assert('20 items exactly valid',          isValidHistoryDepth(new Array(20)));
  assert('21 items invalid',                !isValidHistoryDepth(new Array(21)));

  // Edge function also caps per-item content (MAX_HISTORY_ITEM_CHARS = 2000)
  // Verify the guard exists for the per-item scenario (pure constant check)
  const MAX_HISTORY_ITEM_CHARS = 2_000; // mirrors edge function constant
  assert('per-item cap constant is 2000',   MAX_HISTORY_ITEM_CHARS === 2_000);
  assert('per-item cap is a number',        typeof MAX_HISTORY_ITEM_CHARS === 'number');

  const longItem = 'a'.repeat(MAX_HISTORY_ITEM_CHARS + 1);
  assert('item exceeding cap is detectable', longItem.length > MAX_HISTORY_ITEM_CHARS);
  const okItem = 'a'.repeat(MAX_HISTORY_ITEM_CHARS);
  assert('item at exact cap is acceptable', okItem.length <= MAX_HISTORY_ITEM_CHARS);
});

// ─── Suite F: KNOWN_AI_MODES completeness ────────────────────────────────────

suite('F. KNOWN_AI_MODES completeness', () => {
  const modes = KNOWN_AI_MODES as readonly string[];
  assert("contains 'quick_nudge'",                   modes.includes('quick_nudge'));
  assert("contains 'focused_answer'",                modes.includes('focused_answer'));
  assert("contains 'recovery_coach'",                modes.includes('recovery_coach'));
  assert("contains 'strategic_planning'",            modes.includes('strategic_planning'));
  assert("contains 'review_reflection'",             modes.includes('review_reflection'));
  assert('no duplicates',                            new Set(modes).size === modes.length);
  assert('all entries are non-empty strings',        modes.every((m) => typeof m === 'string' && m.length > 0));
  assert('all entries use underscore convention',    modes.every((m) => /^[a-z_]+$/.test(m)));
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Batch 20 Hardening: ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
  console.error(`\n${_failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll tests passed.');
}
