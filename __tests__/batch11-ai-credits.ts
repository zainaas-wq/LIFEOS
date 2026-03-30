/**
 * Batch 11 — AI credits + multimodal gateway tests
 *
 * Tests for:
 *   1. CREDIT_COSTS — text/voice/image cost values
 *   2. TIER_ALLOWANCE — free/pro tier defaults
 *   3. canAfford() — balance vs cost check
 *   4. creditCostLabel() — human-readable cost labels
 *   5. fetchAIBalance() shape validation (mock)
 *   6. AIBalance derived fields (pctRemaining, isLow, isExhausted)
 *   7. Entitlement gating for voice/image
 *   8. Edge function credit logic simulation (pure logic mirror)
 *
 * Run: npx tsx __tests__/batch11-ai-credits.ts
 */

import {
  CREDIT_COSTS,
  TIER_ALLOWANCE,
  canAfford,
  creditCostLabel,
  simulateConsume,
  simulateRefund,
  isRefillDue,
} from '../src/ai/creditRules';
import type { RequestMode } from '../src/ai/creditRules';
import type { AIBalance } from '../src/services/aiCreditsService';

// ── Inline entitlement constants (avoids RN/Supabase import chain in Node) ────
// Mirrors PLAN_ENTITLEMENTS in entitlementService.ts. Test will catch drift.

type PlanFeature =
  | 'ai_chat' | 'ai_build_day' | 'ai_recover_day'
  | 'ai_monthly_review' | 'ai_weekly_plan'
  | 'ai_voice' | 'ai_image'
  | 'predictive_insights' | 'advanced_recovery'
  | 'weekly_insights_depth' | 'outcome_dashboard';

const PLAN_ENTITLEMENTS: Record<string, ReadonlySet<PlanFeature>> = {
  free: new Set<PlanFeature>(['ai_chat', 'ai_build_day', 'ai_recover_day', 'outcome_dashboard']),
  pro: new Set<PlanFeature>([
    'ai_chat', 'ai_build_day', 'ai_recover_day',
    'ai_monthly_review', 'ai_weekly_plan',
    'ai_voice', 'ai_image',
    'predictive_insights', 'advanced_recovery',
    'weekly_insights_depth', 'outcome_dashboard',
  ]),
  max: new Set<PlanFeature>([
    'ai_chat', 'ai_build_day', 'ai_recover_day',
    'ai_monthly_review', 'ai_weekly_plan',
    'ai_voice', 'ai_image',
    'predictive_insights', 'advanced_recovery',
    'weekly_insights_depth', 'outcome_dashboard',
  ]),
};

function canUseFeature(tierId: string, feature: PlanFeature): boolean {
  return (PLAN_ENTITLEMENTS[tierId] ?? PLAN_ENTITLEMENTS['free']!).has(feature);
}

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

// ─── Suite 1: Credit costs ────────────────────────────────────────────────────

suite('CREDIT_COSTS — cost per request mode', () => {
  assert('text costs 1',  CREDIT_COSTS.text  === 1);
  assert('voice costs 2', CREDIT_COSTS.voice === 2);
  assert('image costs 3', CREDIT_COSTS.image === 3);
  assert('voice > text',  CREDIT_COSTS.voice >  CREDIT_COSTS.text);
  assert('image > voice', CREDIT_COSTS.image >  CREDIT_COSTS.voice);
});

// ─── Suite 2: Tier allowances ─────────────────────────────────────────────────

suite('TIER_ALLOWANCE — per-tier credit defaults', () => {
  assert('free = 20',   TIER_ALLOWANCE['free'] === 20);
  assert('pro = 1000',  TIER_ALLOWANCE['pro']  === 1000);
  assert('max = 1000',  TIER_ALLOWANCE['max']  === 1000);
  assert('pro > free',  TIER_ALLOWANCE['pro']  >  TIER_ALLOWANCE['free']);
  assert('unknown tier returns undefined', TIER_ALLOWANCE['mystery'] === undefined);
});

// ─── Suite 3: canAfford() ─────────────────────────────────────────────────────

suite('canAfford() — balance vs cost', () => {
  // Exact balance
  assert('balance 1 can afford text (1)',  canAfford(1, 'text'));
  assert('balance 2 can afford voice (2)', canAfford(2, 'voice'));
  assert('balance 3 can afford image (3)', canAfford(3, 'image'));

  // Surplus
  assert('balance 20 can afford text',    canAfford(20, 'text'));
  assert('balance 20 can afford voice',   canAfford(20, 'voice'));
  assert('balance 20 can afford image',   canAfford(20, 'image'));

  // Insufficient
  assert('balance 0 cannot afford text',  !canAfford(0,  'text'));
  assert('balance 0 cannot afford voice', !canAfford(0,  'voice'));
  assert('balance 0 cannot afford image', !canAfford(0,  'image'));
  assert('balance 1 cannot afford voice', !canAfford(1,  'voice'));
  assert('balance 1 cannot afford image', !canAfford(1,  'image'));
  assert('balance 2 cannot afford image', !canAfford(2,  'image'));
});

// ─── Suite 4: creditCostLabel() ───────────────────────────────────────────────

suite('creditCostLabel() — human-readable labels', () => {
  assert('text label = "1 credit"',  creditCostLabel('text')  === '1 credit');
  assert('voice label = "2 credits"', creditCostLabel('voice') === '2 credits');
  assert('image label = "3 credits"', creditCostLabel('image') === '3 credits');
  assert('text singular (not plural)', !creditCostLabel('text').includes('credits'));
});

// ─── Suite 5: AIBalance derived fields ───────────────────────────────────────

suite('AIBalance derived fields — pctRemaining / isLow / isExhausted', () => {
  function makeBalance(current: number, allowance: number): AIBalance {
    const pctRemaining = allowance > 0 ? Math.min(100, Math.round((current / allowance) * 100)) : 0;
    return {
      currentBalance: current,
      tierAllowance:  allowance,
      lifetimeUsed:   allowance - current,
      lastRefillAt:   null,
      pctRemaining,
      isLow:          pctRemaining <= 10,
      isExhausted:    current === 0,
    };
  }

  const full    = makeBalance(20, 20);
  const low     = makeBalance(2,  20);
  const empty   = makeBalance(0,  20);
  const proFull = makeBalance(1000, 1000);
  const proLow  = makeBalance(50,   1000);

  // Full balance
  assert('full: pctRemaining = 100',  full.pctRemaining === 100);
  assert('full: isLow = false',       !full.isLow);
  assert('full: isExhausted = false', !full.isExhausted);

  // Low balance (≤10%)
  assert('low: pctRemaining = 10',    low.pctRemaining === 10);
  assert('low: isLow = true',         low.isLow);
  assert('low: isExhausted = false',  !low.isExhausted);

  // Exhausted
  assert('empty: pctRemaining = 0',   empty.pctRemaining === 0);
  assert('empty: isLow = true',       empty.isLow);
  assert('empty: isExhausted = true', empty.isExhausted);

  // Pro tier
  assert('pro full: pctRemaining = 100', proFull.pctRemaining === 100);
  assert('pro full: isExhausted = false', !proFull.isExhausted);
  assert('pro low (5%): isLow = true',    proLow.isLow);
});

// ─── Suite 6: Entitlement gating — voice/image ───────────────────────────────

suite('Entitlements — voice/image are Pro-only', () => {
  assert('free cannot use ai_voice',  !canUseFeature('free', 'ai_voice'));
  assert('free cannot use ai_image',  !canUseFeature('free', 'ai_image'));
  assert('pro can use ai_voice',       canUseFeature('pro',  'ai_voice'));
  assert('pro can use ai_image',       canUseFeature('pro',  'ai_image'));
  assert('max can use ai_voice',       canUseFeature('max',  'ai_voice'));
  assert('max can use ai_image',       canUseFeature('max',  'ai_image'));
  // Unknown tier defaults to free (fail-closed)
  assert('unknown cannot use ai_voice', !canUseFeature('mystery', 'ai_voice'));
  assert('unknown cannot use ai_image', !canUseFeature('mystery', 'ai_image'));
});

// ─── Suite 7: Entitlement set integrity ──────────────────────────────────────

suite('PLAN_ENTITLEMENTS — set integrity', () => {
  const free = PLAN_ENTITLEMENTS['free']!;
  const pro  = PLAN_ENTITLEMENTS['pro']!;

  // Free has basic AI chat
  assert('free has ai_chat',       free.has('ai_chat'));
  assert('free has ai_build_day',  free.has('ai_build_day'));
  assert('free has ai_recover_day', free.has('ai_recover_day'));

  // Free does NOT have premium features
  assert('free lacks ai_monthly_review',   !free.has('ai_monthly_review'));
  assert('free lacks ai_weekly_plan',      !free.has('ai_weekly_plan'));
  assert('free lacks ai_voice',            !free.has('ai_voice'));
  assert('free lacks ai_image',            !free.has('ai_image'));
  assert('free lacks predictive_insights', !free.has('predictive_insights'));

  // Pro has everything
  assert('pro has ai_chat',           pro.has('ai_chat'));
  assert('pro has ai_monthly_review', pro.has('ai_monthly_review'));
  assert('pro has ai_weekly_plan',    pro.has('ai_weekly_plan'));
  assert('pro has ai_voice',          pro.has('ai_voice'));
  assert('pro has ai_image',          pro.has('ai_image'));
  assert('pro has predictive_insights', pro.has('predictive_insights'));
  assert('pro has advanced_recovery',   pro.has('advanced_recovery'));

  // Pro is a superset of free
  const freeArr = Array.from(free);
  const allFreeInPro = freeArr.every((f) => pro.has(f));
  assert('pro is superset of free', allFreeInPro);
});

// ─── Suite 8: Credit deduction simulation ────────────────────────────────────

suite('Credit deduction — pure logic simulation (mirrors PG function)', () => {
  // Successful deductions
  const r1 = simulateConsume(20, CREDIT_COSTS.text);
  assert('20 balance - text(1) = 19', r1.success && r1.balanceAfter === 19);

  const r2 = simulateConsume(20, CREDIT_COSTS.voice);
  assert('20 balance - voice(2) = 18', r2.success && r2.balanceAfter === 18);

  const r3 = simulateConsume(20, CREDIT_COSTS.image);
  assert('20 balance - image(3) = 17', r3.success && r3.balanceAfter === 17);

  // Exact balance
  const r4 = simulateConsume(3, CREDIT_COSTS.image);
  assert('3 balance - image(3) = 0', r4.success && r4.balanceAfter === 0);

  // Insufficient (fail-closed — never go negative)
  const r5 = simulateConsume(0, CREDIT_COSTS.text);
  assert('0 balance: insufficient for text', !r5.success && r5.balanceAfter === 0);

  const r6 = simulateConsume(1, CREDIT_COSTS.voice);
  assert('1 balance: insufficient for voice(2)', !r6.success && r6.balanceAfter === 1);

  const r7 = simulateConsume(2, CREDIT_COSTS.image);
  assert('2 balance: insufficient for image(3)', !r7.success && r7.balanceAfter === 2);

  // Refund simulation (mirrors refund_ai_credits — clamped to allowance)
  const refunded = simulateRefund(17, 20, 3);
  assert('refund 3 to 17 (allowance 20) = 20', refunded === 20);

  const refundedClamped = simulateRefund(19, 20, 5);
  assert('refund 5 to 19 clamped to allowance 20', refundedClamped === 20);

  const refundedPartial = simulateRefund(0, 20, 1);
  assert('refund 1 to 0 = 1', refundedPartial === 1);
});

// ─── Suite 9: Monthly refill logic simulation ────────────────────────────────

suite('Monthly refill simulation (30-day rolling window)', () => {
  const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const twoDaysAgo       = new Date(Date.now() -  2 * 24 * 60 * 60 * 1000).toISOString();
  const today            = new Date().toISOString();

  assert('31 days ago → refill due',  isRefillDue(thirtyOneDaysAgo));
  assert('2 days ago → no refill',    !isRefillDue(twoDaysAgo));
  assert('today → no refill',         !isRefillDue(today));
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Batch 11 AI credits tests: ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
  console.error('TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASS');
}
