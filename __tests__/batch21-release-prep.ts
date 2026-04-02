/**
 * Batch 21 — Release Prep tests
 *
 * Verifies pure-function contracts that matter for launch readiness.
 * Tests are scoped to modules that have no react-native transitive imports,
 * so the suite runs cleanly with: npx tsx __tests__/batch21-release-prep.ts
 *
 *   A. computeSubscriptionState — free / trial / pro boundaries
 *   B. getTodayDate format      — YYYY-MM-DD, stable, sensible values
 *   C. KNOWN_AI_MODES parity    — client array matches edge function Set
 *   D. Guard chain integration  — realistic send-flow vetting
 *   E. Trial boundary math      — exact-day transitions
 *   F. Payload budget           — launch request shapes within limits
 *
 * Run: npx tsx __tests__/batch21-release-prep.ts
 */

import { computeSubscriptionState, TRIAL_DAYS } from '../src/lib/trialUtils';
import {
  KNOWN_AI_MODES,
  isPayloadTooLarge,
  isValidMessageLength,
  isValidHistoryDepth,
  sanitizeAIMode,
  MAX_MESSAGE_CHARS,
  MAX_HISTORY_ITEMS,
  MAX_PAYLOAD_CHARS,
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

/** Inline equivalent of getTodayDate() — same logic, no react-native deps. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns an ISO date string N days before today. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Suite A: computeSubscriptionState ───────────────────────────────────────

suite('A. computeSubscriptionState — pro', () => {
  const today = todayISO();

  const s1 = computeSubscriptionState(today, true);
  assert("pro + trial today → 'pro'",        s1 === 'pro');

  const s2 = computeSubscriptionState(null, true);
  assert("pro + no trial → 'pro'",           s2 === 'pro');

  const s3 = computeSubscriptionState('2020-01-01', true);
  assert("pro + ancient trial → 'pro'",      s3 === 'pro');
});

suite('A. computeSubscriptionState — trial_active', () => {
  const today = todayISO();
  const yesterday = daysAgo(1);
  const twoDaysAgo = daysAgo(2);

  const s1 = computeSubscriptionState(today, false);
  assert("trial started today → trial_active",       s1 === 'trial_active');

  const s2 = computeSubscriptionState(yesterday, false);
  assert("trial started yesterday → trial_active",   s2 === 'trial_active');

  const s3 = computeSubscriptionState(twoDaysAgo, false);
  assert("trial started 2 days ago → trial_active",  s3 === 'trial_active');
});

suite('A. computeSubscriptionState — trial_expired', () => {
  const threeDaysAgo = daysAgo(3);
  const weekAgo = daysAgo(7);

  const s1 = computeSubscriptionState(null, false);
  assert("no trial start → trial_expired",           s1 === 'trial_expired');

  const s2 = computeSubscriptionState(threeDaysAgo, false);
  assert("trial started 3 days ago → trial_expired", s2 === 'trial_expired');

  const s3 = computeSubscriptionState(weekAgo, false);
  assert("trial started 7 days ago → trial_expired", s3 === 'trial_expired');

  const s4 = computeSubscriptionState('2020-01-01', false);
  assert("ancient trial start → trial_expired",      s4 === 'trial_expired');
});

// ─── Suite B: getTodayDate format ─────────────────────────────────────────────

suite('B. getTodayDate format (inline equivalent)', () => {
  const d = todayISO();
  assert('returns a string',             typeof d === 'string');
  assert('format is YYYY-MM-DD',         /^\d{4}-\d{2}-\d{2}$/.test(d));
  assert('stable within same tick',      d === todayISO());

  const parts = d.split('-');
  const month = parseInt(parts[1], 10);
  const day   = parseInt(parts[2], 10);
  assert('year is 4 chars',             parts[0].length === 4);
  assert('month in 1–12',               month >= 1 && month <= 12);
  assert('day in 1–31',                 day >= 1 && day <= 31);
});

// ─── Suite C: KNOWN_AI_MODES parity ──────────────────────────────────────────

suite('C. KNOWN_AI_MODES — client/edge parity', () => {
  // Mirrors the Set inlined in supabase/functions/ai-chat/index.ts
  const EDGE_MODES = new Set([
    'quick_nudge', 'focused_answer', 'recovery_coach',
    'strategic_planning', 'review_reflection',
  ]);

  assert('same cardinality (5)',         KNOWN_AI_MODES.length === EDGE_MODES.size);

  for (const mode of KNOWN_AI_MODES) {
    assert(`edge Set contains '${mode}'`, EDGE_MODES.has(mode));
  }

  for (const mode of Array.from(EDGE_MODES)) {
    assert(`client array contains '${mode}'`,
      (KNOWN_AI_MODES as readonly string[]).includes(mode));
  }
});

// ─── Suite D: Guard chain — realistic send flow ───────────────────────────────

suite('D. Guard chain — typical user message', () => {
  const msg = 'What should I work on this morning?';
  const history = Array.from({ length: 6 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'message content here',
  }));
  const context = { todayDate: todayISO(), aiMode: 'focused_answer' };

  assert('message length valid',         isValidMessageLength(msg));
  assert('history depth valid',          isValidHistoryDepth(history));
  assert('aiMode sanitizes correctly',   sanitizeAIMode(context.aiMode) === 'focused_answer');

  const wireStr = JSON.stringify({ message: msg, history, context });
  assert('payload within limit',         !isPayloadTooLarge(wireStr));
});

suite('D. Guard chain — rejection cases', () => {
  assert('4001-char msg rejected',       !isValidMessageLength('a'.repeat(4001)));
  assert('21-item history rejected',     !isValidHistoryDepth(new Array(21)));
  assert("'admin' mode → null",          sanitizeAIMode('admin') === null);
  assert("null mode → null",             sanitizeAIMode(null) === null);
  assert("injected mode → null",         sanitizeAIMode("'; DROP TABLE--") === null);
  assert('200KB payload rejected',       isPayloadTooLarge('a'.repeat(200_000)));
});

// ─── Suite E: Trial boundary math ─────────────────────────────────────────────

suite('E. Trial boundary math', () => {
  assert(`TRIAL_DAYS constant is ${TRIAL_DAYS}`, TRIAL_DAYS === 3);

  // Day 0 (today) → active
  assert('trial day 0 → active',
    computeSubscriptionState(todayISO(), false) === 'trial_active');

  // Day TRIAL_DAYS (exactly) → expired
  assert(`trial day ${TRIAL_DAYS} → expired`,
    computeSubscriptionState(daysAgo(TRIAL_DAYS), false) === 'trial_expired');

  // Day TRIAL_DAYS - 1 → active (still within window)
  assert(`trial day ${TRIAL_DAYS - 1} → active`,
    computeSubscriptionState(daysAgo(TRIAL_DAYS - 1), false) === 'trial_active');
});

// ─── Suite F: Payload budget ──────────────────────────────────────────────────

suite('F. Payload budget — launch request shapes', () => {
  // Minimal
  const minimal = JSON.stringify({
    message: 'Help me plan today',
    history: [],
    context: { todayDate: todayISO(), aiMode: 'focused_answer' },
  });
  assert('minimal payload within limit',    !isPayloadTooLarge(minimal));

  // Focused — 4 history turns + plan items
  const focused = JSON.stringify({
    message: 'What should I do first?',
    history: Array.from({ length: 4 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'a'.repeat(300),
    })),
    context: {
      todayDate: todayISO(),
      aiMode: 'focused_answer',
      todayPlan: {
        items: Array.from({ length: 10 }, (_, i) => ({
          startTime: '09:00', endTime: '10:00',
          title: `Task ${i}`, type: 'goal', completed: false,
        })),
      },
    },
  });
  assert('focused payload within limit',    !isPayloadTooLarge(focused));

  // Strategic — 8 history turns + full context
  const strategic = JSON.stringify({
    message: 'Review my week and give me a strategic plan',
    history: Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'a'.repeat(500),
    })),
    context: {
      todayDate: todayISO(),
      aiMode: 'strategic_planning',
      tracks: Array.from({ length: 10 }, (_, i) => ({
        title: `Goal ${i}`, priority: i, weeklyHoursTarget: 10,
      })),
    },
  });
  assert('strategic payload within limit',  !isPayloadTooLarge(strategic));

  // Adversarial — message at exact cap + minimal overhead
  const atCap = JSON.stringify({
    message: 'a'.repeat(MAX_MESSAGE_CHARS),
    history: [],
    context: { todayDate: todayISO() },
  });
  assert('message at cap: length valid',    isValidMessageLength('a'.repeat(MAX_MESSAGE_CHARS)));
  assert('message at cap: payload valid',   !isPayloadTooLarge(atCap));

  // Max history depth + short messages
  const maxHistory = JSON.stringify({
    message: 'Quick question',
    history: Array.from({ length: MAX_HISTORY_ITEMS }, () => ({
      role: 'user', content: 'a'.repeat(100),
    })),
    context: { todayDate: todayISO() },
  });
  assert('max history depth: payload valid', !isPayloadTooLarge(maxHistory));

  // Size constants sanity
  assert(`MAX_MESSAGE_CHARS = ${MAX_MESSAGE_CHARS}`,  MAX_MESSAGE_CHARS === 4_000);
  assert(`MAX_HISTORY_ITEMS = ${MAX_HISTORY_ITEMS}`,  MAX_HISTORY_ITEMS === 20);
  assert(`MAX_PAYLOAD_CHARS = ${MAX_PAYLOAD_CHARS}`,  MAX_PAYLOAD_CHARS === 150_000);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Batch 21 Release Prep: ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
  console.error(`\n${_failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll tests passed.');
}
