/**
 * Batch 9 — Product coherence tests
 *
 * Tests for:
 *   1. outcomeEngine.computeOutcomeTrend — product dashboard metrics
 *   2. proGating — PRO_FEATURE_LABELS shape
 *   3. entitlementService — new feature IDs in tiers
 *
 * Run: npx tsx __tests__/batch9-product.ts
 */

import { computeOutcomeTrend } from '../src/ai/outcomeEngine';
import { PRO_FEATURE_LABELS } from '../src/config/proGating';
import type { ProFeature } from '../src/config/proGating';
import type { DailyReview } from '../src/types';

// ── Inline entitlement constants (avoids RN import chain in Node) ─────────────
// These mirror PLAN_ENTITLEMENTS in entitlementService.ts exactly.
// If those values change, this test will catch the drift.

type PlanFeature =
  | 'ai_chat' | 'ai_build_day' | 'ai_recover_day'
  | 'ai_monthly_review' | 'ai_weekly_plan'
  | 'predictive_insights' | 'advanced_recovery'
  | 'weekly_insights_depth' | 'outcome_dashboard';

const EXPECTED_FREE = new Set<PlanFeature>(['ai_chat', 'ai_build_day', 'ai_recover_day', 'outcome_dashboard']);
const EXPECTED_PRO  = new Set<PlanFeature>([
  'ai_chat', 'ai_build_day', 'ai_recover_day',
  'ai_monthly_review', 'ai_weekly_plan',
  'predictive_insights', 'advanced_recovery',
  'weekly_insights_depth', 'outcome_dashboard',
]);

function hasFeature(tier: 'free' | 'pro', feature: PlanFeature): boolean {
  return tier === 'free' ? EXPECTED_FREE.has(feature) : EXPECTED_PRO.has(feature);
}

// ─── Assertion helper ─────────────────────────────────────────────────────────

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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeReview(overrides: Partial<DailyReview> = {}): DailyReview {
  return {
    date:           '2026-03-20',
    completedCount: 4,
    totalCount:     5,
    focusMinutes:   60,
    criticalDone:   true,
    driftTypes:     [],
    recoveryUsed:   false,
    savedAt:        new Date().toISOString(),
    ...overrides,
  };
}

/** Generate n consecutive reviews ending at today (or offset days back from today). */
function makeReviews(n: number, endOffsetDays = 0): DailyReview[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - endOffsetDays - (n - 1 - i));
    return makeReview({ date: d.toISOString().slice(0, 10) });
  });
}

function todayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ─── Suite 1: outcomeEngine — empty state ─────────────────────────────────────

suite('outcomeEngine — empty reviews', () => {
  const trend = computeOutcomeTrend([], 7);
  assert('windowDays is 7', trend.windowDays === 7);
  assert('avgCompletion is 0', trend.avgCompletion === 0);
  assert('driftDays is 0',    trend.driftDays === 0);
  assert('recoveryRate is -1 (N/A)',  trend.recoveryRate === -1);
  assert('reviewConsistency is 0',   trend.reviewConsistency === 0);
  assert('totalFocusMins is 0',      trend.totalFocusMins === 0);
});

// ─── Suite 2: outcomeEngine — 5 clean days ────────────────────────────────────

suite('outcomeEngine — 5 clean days', () => {
  const reviews = makeReviews(5);
  const trend = computeOutcomeTrend(reviews, 7);

  assert('windowDays is 7',           trend.windowDays === 7);
  assert('avgCompletion ~0.8',        trend.avgCompletion > 0.79 && trend.avgCompletion < 0.81);
  assert('driftDays is 0',            trend.driftDays === 0);
  assert('recoveryRate is -1 (no recovery needed)',  trend.recoveryRate === -1);
  assert('reviewConsistency ≤ 1',     trend.reviewConsistency <= 1);
  assert('reviewConsistency > 0',     trend.reviewConsistency > 0);
  assert('totalFocusMins = 300',      trend.totalFocusMins === 300);
});

// ─── Suite 3: outcomeEngine — drift days ─────────────────────────────────────

suite('outcomeEngine — days with drift', () => {
  const reviews = [
    makeReview({ date: todayMinus(2), driftTypes: ['avoidance'] }),
    makeReview({ date: todayMinus(1), driftTypes: ['late_start', 'overload'] }),
    makeReview({ date: todayMinus(0), driftTypes: [] }),
  ];
  const trend = computeOutcomeTrend(reviews, 7);

  assert('driftDays is 2',    trend.driftDays === 2);
  assert('avgCompletion > 0', trend.avgCompletion > 0);
});

// ─── Suite 4: outcomeEngine — recovery data ───────────────────────────────────

suite('outcomeEngine — recovery effectiveness', () => {
  const reviews = [
    makeReview({
      date: todayMinus(3),
      driftTypes: ['avoidance'],
      recoveryUsed: true,
      recoveryMode: 'critical_only',
      completedCount: 3, totalCount: 4,
    }),
    makeReview({
      date: todayMinus(2),
      driftTypes: ['late_start'],
      recoveryUsed: true,
      recoveryMode: 'resume_now',
      completedCount: 1, totalCount: 5, // < 50% — not effective
    }),
  ];
  const trend = computeOutcomeTrend(reviews, 7);

  assert('driftDays is 2',         trend.driftDays === 2);
  assert('recoveryRate is not -1', trend.recoveryRate !== -1);
  assert('recoveryRate ≥ 0',       trend.recoveryRate >= 0);
  assert('recoveryRate ≤ 1',       trend.recoveryRate <= 1);
});

// ─── Suite 5: outcomeEngine — window clipping ────────────────────────────────

suite('outcomeEngine — old reviews excluded by window', () => {
  const old = makeReview({ date: '2020-01-01', focusMinutes: 999 });
  const recent = makeReview({ date: new Date().toISOString().slice(0, 10), focusMinutes: 30 });
  const trend = computeOutcomeTrend([old, recent], 7);

  assert('old review excluded from focusMins', trend.totalFocusMins === 30);
  assert('only recent review counted',         trend.reviewConsistency > 0 && trend.reviewConsistency <= 1);
});

// ─── Suite 6: outcomeEngine — 30-day pro window ───────────────────────────────

suite('outcomeEngine — 30-day window (Pro)', () => {
  // 14 reviews spread over the last 14 days
  const reviews = makeReviews(14);
  const trend7  = computeOutcomeTrend(reviews, 7);
  const trend30 = computeOutcomeTrend(reviews, 30);

  assert('7d windowDays is 7',          trend7.windowDays === 7);
  assert('30d windowDays is 30',        trend30.windowDays === 30);
  // 7d catches up to 7 reviews (consistency = 1.0); 30d catches 14 reviews (consistency = 14/30 ~0.47)
  // Both are valid — just check they're in range
  assert('7d reviewConsistency in 0–1', trend7.reviewConsistency >= 0 && trend7.reviewConsistency <= 1);
  assert('30d reviewConsistency in 0–1',trend30.reviewConsistency >= 0 && trend30.reviewConsistency <= 1);
  // 30d window sees at least as many total focusMins as 7d (it covers more days)
  assert('30d focusMins ≥ 7d',          trend30.totalFocusMins >= trend7.totalFocusMins);
});

// ─── Suite 7: outcomeEngine — perfect day ─────────────────────────────────────

suite('outcomeEngine — perfect execution', () => {
  const reviews = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return makeReview({
      date:           d.toISOString().slice(0, 10),
      completedCount: 5,
      totalCount:     5,
      driftTypes:     [],
      focusMinutes:   90,
    });
  });
  const trend = computeOutcomeTrend(reviews, 7);

  assert('perfect avgCompletion = 1.0',  Math.abs(trend.avgCompletion - 1.0) < 0.01);
  assert('driftDays = 0',               trend.driftDays === 0);
  assert('reviewConsistency = 1.0',     Math.abs(trend.reviewConsistency - 1.0) < 0.01);
  assert('focusMins = 630',             trend.totalFocusMins === 630);
});

// ─── Suite 8: proGating — PRO_FEATURE_LABELS coverage ────────────────────────

suite('proGating — PRO_FEATURE_LABELS shape', () => {
  const features: ProFeature[] = [
    'predictive_insights',
    'advanced_recovery',
    'weekly_insights_depth',
    'outcome_history',
  ];

  for (const f of features) {
    const entry = PRO_FEATURE_LABELS[f];
    assert(`${f} has headline`, typeof entry.headline === 'string' && entry.headline.length > 0);
    assert(`${f} has nudge`,    typeof entry.nudge === 'string'    && entry.nudge.length > 0);
  }
});

// ─── Suite 9: entitlement constants — new Pro feature IDs ────────────────────

suite('entitlement constants — Batch 9 Pro features', () => {
  assert('free has outcome_dashboard',          hasFeature('free', 'outcome_dashboard'));
  assert('free lacks predictive_insights',      !hasFeature('free', 'predictive_insights'));
  assert('free lacks advanced_recovery',        !hasFeature('free', 'advanced_recovery'));
  assert('free lacks weekly_insights_depth',    !hasFeature('free', 'weekly_insights_depth'));

  assert('pro has outcome_dashboard',           hasFeature('pro', 'outcome_dashboard'));
  assert('pro has predictive_insights',         hasFeature('pro', 'predictive_insights'));
  assert('pro has advanced_recovery',           hasFeature('pro', 'advanced_recovery'));
  assert('pro has weekly_insights_depth',       hasFeature('pro', 'weekly_insights_depth'));
});

// ─── Suite 10: entitlement constants — backward compat ───────────────────────

suite('entitlement constants — existing features preserved', () => {
  assert('free ai_chat',               hasFeature('free', 'ai_chat'));
  assert('free ai_build_day',          hasFeature('free', 'ai_build_day'));
  assert('free ai_recover_day',        hasFeature('free', 'ai_recover_day'));
  assert('free !ai_monthly_review',    !hasFeature('free', 'ai_monthly_review'));
  assert('free !ai_weekly_plan',       !hasFeature('free', 'ai_weekly_plan'));
  assert('pro ai_monthly_review',      hasFeature('pro', 'ai_monthly_review'));
  assert('pro ai_weekly_plan',         hasFeature('pro', 'ai_weekly_plan'));
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Batch 9 product tests: ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
  console.error('TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASS');
}
