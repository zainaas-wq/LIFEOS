/**
 * Batch 13 — AI UX & Trust Layer tests
 *
 * Tests for pure helpers in src/ai/creditUX.ts:
 *   1. estimateUsageBreakdown() — requests remaining
 *   2. getLowCreditState()      — warning severity tiers
 *   3. formatCost()             — post-send cost label
 *   4. costPreviewLabel()       — pre-send cost chip label
 *   5. getRefillCountdown()     — days until refill
 *   6. shouldShowUpgradeNudge() — smart nudge gating
 *   7. Edge cases
 *
 * Run: npx tsx __tests__/batch13-credit-ux.ts
 */

import {
  estimateUsageBreakdown,
  getLowCreditState,
  formatCost,
  costPreviewLabel,
  getRefillCountdown,
  shouldShowUpgradeNudge,
} from '../src/ai/creditUX';

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

// ─── Suite 1: estimateUsageBreakdown ─────────────────────────────────────────

suite('estimateUsageBreakdown() — requests remaining', () => {
  const b20 = estimateUsageBreakdown(20);
  assert('20 credits → 20 text',  b20.text  === 20);
  assert('20 credits → 10 voice', b20.voice === 10);
  assert('20 credits → 6 image',  b20.image === 6);

  const b1 = estimateUsageBreakdown(1);
  assert('1 credit → 1 text',   b1.text  === 1);
  assert('1 credit → 0 voice',  b1.voice === 0);
  assert('1 credit → 0 image',  b1.image === 0);

  const b0 = estimateUsageBreakdown(0);
  assert('0 credits → 0 text',  b0.text  === 0);
  assert('0 credits → 0 voice', b0.voice === 0);
  assert('0 credits → 0 image', b0.image === 0);

  const bNeg = estimateUsageBreakdown(-5);
  assert('negative balance treated as 0', bNeg.text === 0 && bNeg.voice === 0 && bNeg.image === 0);

  const b3 = estimateUsageBreakdown(3);
  assert('3 credits → 3 text',  b3.text  === 3);
  assert('3 credits → 1 voice', b3.voice === 1);
  assert('3 credits → 1 image', b3.image === 1);

  const b1000 = estimateUsageBreakdown(1000);
  assert('1000 credits → 1000 text',  b1000.text  === 1000);
  assert('1000 credits → 500 voice',  b1000.voice === 500);
  assert('1000 credits → 333 image',  b1000.image === 333);

  // Fractional balance treated as floor
  const b2_5 = estimateUsageBreakdown(2.9);
  assert('2.9 credits floors to 2: 2 text', b2_5.text === 2);
  assert('2.9 credits floors to 2: 1 voice', b2_5.voice === 1);
  assert('2.9 credits floors to 2: 0 image', b2_5.image === 0);
});

// ─── Suite 2: getLowCreditState ───────────────────────────────────────────────

suite('getLowCreditState() — warning severity', () => {
  assert('0 → exhausted',   getLowCreditState(0) === 'exhausted');
  assert('-1 → exhausted',  getLowCreditState(-1) === 'exhausted');
  assert('1 → strong',      getLowCreditState(1) === 'strong');
  assert('2 → strong',      getLowCreditState(2) === 'strong');
  assert('3 → soft',        getLowCreditState(3) === 'soft');
  assert('4 → soft',        getLowCreditState(4) === 'soft');
  assert('5 → soft',        getLowCreditState(5) === 'soft');
  assert('6 → ok',          getLowCreditState(6) === 'ok');
  assert('20 → ok',         getLowCreditState(20) === 'ok');
  assert('1000 → ok',       getLowCreditState(1000) === 'ok');
});

// ─── Suite 3: formatCost ──────────────────────────────────────────────────────

suite('formatCost() — post-send inline cost label', () => {
  assert('text → -1 credit',     formatCost('text')  === '-1 credit');
  assert('voice → -2 credits',   formatCost('voice') === '-2 credits');
  assert('image → -3 credits',   formatCost('image') === '-3 credits');
});

// ─── Suite 4: costPreviewLabel ────────────────────────────────────────────────

suite('costPreviewLabel() — pre-send chip label', () => {
  assert('text → 1 credit',    costPreviewLabel('text')  === '1 credit');
  assert('voice → 2 credits',  costPreviewLabel('voice') === '2 credits');
  assert('image → 3 credits',  costPreviewLabel('image') === '3 credits');
});

// ─── Suite 5: getRefillCountdown ──────────────────────────────────────────────

suite('getRefillCountdown() — refill label', () => {
  // null → generic fallback
  assert('null → ~30 days', getRefillCountdown(null) === 'Refills in ~30 days');

  // 30 days after a known refill date — exactly expired
  const now = new Date('2026-03-31T12:00:00Z');
  const refillExact = '2026-03-01T12:00:00Z'; // 30 days ago exactly
  assert('exactly expired → Refill due soon',
    getRefillCountdown(refillExact, now) === 'Refill due soon');

  // 1 day left
  const refill1day = '2026-03-01T12:00:00Z';
  const now1day    = new Date('2026-03-30T12:01:00Z'); // 29 days + ~0 = 1 day left
  // 2026-03-01 + 30d = 2026-03-31; now = 2026-03-30 → 1 day left
  assert('1 day left → Refills tomorrow',
    getRefillCountdown(refill1day, now1day) === 'Refills tomorrow');

  // 12 days left
  const refillFuture = '2026-03-07T00:00:00Z'; // 30d → 2026-04-06
  const nowFuture    = new Date('2026-03-25T00:00:00Z'); // 12 days before 2026-04-06
  assert('12 days left → Refills in 12 days',
    getRefillCountdown(refillFuture, nowFuture) === 'Refills in 12 days');

  // Past due (over 30 days since last refill)
  const refillOld = '2026-01-01T00:00:00Z';
  const nowOld    = new Date('2026-03-31T00:00:00Z');
  assert('past due → Refill due soon',
    getRefillCountdown(refillOld, nowOld) === 'Refill due soon');
});

// ─── Suite 6: shouldShowUpgradeNudge ─────────────────────────────────────────

suite('shouldShowUpgradeNudge() — smart nudge gating', () => {
  // ok — never nudge
  assert('ok balance, 0 requests → no nudge',   !shouldShowUpgradeNudge(10, 0));
  assert('ok balance, 5 requests → no nudge',   !shouldShowUpgradeNudge(10, 5));

  // soft (≤5) — never nudge
  assert('soft (5), 0 requests → no nudge',     !shouldShowUpgradeNudge(5, 0));
  assert('soft (3), 3 requests → no nudge',     !shouldShowUpgradeNudge(3, 3));

  // strong (≤2) — nudge at 0, then every 3rd
  assert('strong (2), 0 requests → nudge',      shouldShowUpgradeNudge(2, 0));
  assert('strong (2), 1 request  → no nudge',   !shouldShowUpgradeNudge(2, 1));
  assert('strong (2), 2 requests → no nudge',   !shouldShowUpgradeNudge(2, 2));
  assert('strong (2), 3 requests → nudge',      shouldShowUpgradeNudge(2, 3));
  assert('strong (2), 4 requests → no nudge',   !shouldShowUpgradeNudge(2, 4));
  assert('strong (2), 6 requests → nudge',      shouldShowUpgradeNudge(2, 6));

  // exhausted (=0) — always nudge
  assert('exhausted, 0 requests → nudge',       shouldShowUpgradeNudge(0, 0));
  assert('exhausted, 1 request  → nudge',       shouldShowUpgradeNudge(0, 1));
  assert('exhausted, 99 requests → nudge',      shouldShowUpgradeNudge(0, 99));
  assert('exhausted, -5 balance → nudge',       shouldShowUpgradeNudge(-5, 0));
});

// ─── Suite 7: Edge cases ──────────────────────────────────────────────────────

suite('Edge cases', () => {
  // estimateUsageBreakdown returns integers only
  const b7 = estimateUsageBreakdown(7);
  assert('7 / 2 = 3 voice (floor, not round)', b7.voice === 3);
  assert('7 / 3 = 2 image (floor, not round)', b7.image === 2);

  // getLowCreditState — real-world balance is always integer from DB
  // Floating point: 2.9 > 2 → soft; 5.9 > 5 → ok (no flooring applied)
  assert('2.9 → soft  (2.9 > 2, ≤ 5)',  getLowCreditState(2.9) === 'soft');
  assert('5.9 → ok    (5.9 > 5)',        getLowCreditState(5.9) === 'ok');
  assert('6.0 → ok',                     getLowCreditState(6.0) === 'ok');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Batch 13 credit UX tests: ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
  console.error('TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASS');
}
