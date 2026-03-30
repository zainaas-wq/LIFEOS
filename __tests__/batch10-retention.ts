/**
 * Batch 10 — Retention engine tests
 *
 * Tests for:
 *   1. retentionEngine — computeStreakData (behavior-aware streak)
 *   2. retentionEngine — detectGap
 *   3. retentionEngine — buildReentryMessage
 *   4. retentionEngine — buildCommitmentSignal
 *   5. retentionEngine — buildRetentionNudgeContent
 *   6. notificationPlanner — buildRetentionNudgeContent (via notificationPlanner)
 *
 * Run: npx tsx __tests__/batch10-retention.ts
 */

import {
  computeStreakData,
  detectGap,
  buildReentryMessage,
  buildCommitmentSignal,
  buildRetentionNudgeContent,
} from '../src/ai/retentionEngine';
import { buildRetentionNudgeContent as plannerNudge } from '../src/ai/notificationPlanner';
import type { DailyReview } from '../src/types';
import type { AdaptationHints } from '../src/ai/adaptationEngine';

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

function review(date: string, overrides: Partial<DailyReview> = {}): DailyReview {
  return {
    date,
    completedCount: 3,
    totalCount:     5,
    focusMinutes:   60,
    criticalDone:   true,
    driftTypes:     [],
    recoveryUsed:   false,
    savedAt:        new Date().toISOString(),
    ...overrides,
  };
}

function daysBefore(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const TODAY = daysBefore(0);

const EMPTY_HINTS: AdaptationHints = {
  capMultiplier:   1.0,
  preferMorning:   false,
  frontloadWork:   false,
  executionTrend:  'stable',
  avoidExtraGoals: false,
  preferredRecoveryModes: [],
};

// ─── Suite 1: new user ────────────────────────────────────────────────────────

suite('computeStreakData — new user (no reviews)', () => {
  const data = computeStreakData([], TODAY);
  assert('currentStreak is 0',     data.currentStreak === 0);
  assert('bestStreak is 0',        data.bestStreak === 0);
  assert('status is new',          data.streakStatus === 'new');
  assert('missedDays ≥ 0',         data.missedDays >= 0);
  assert('totalReviews is 0',      data.totalReviews === 0);
  assert('streakLabel not empty',  data.streakLabel.length > 0);
});

// ─── Suite 2: consecutive days ────────────────────────────────────────────────

suite('computeStreakData — 5 consecutive days', () => {
  const reviews = [0,1,2,3,4].map((n) => review(daysBefore(n)));
  const data = computeStreakData(reviews, TODAY);
  assert('currentStreak is 5',     data.currentStreak === 5);
  assert('bestStreak ≥ 5',         data.bestStreak >= 5);
  assert('status is active',       data.streakStatus === 'active');
  assert('missedDays is 0',        data.missedDays === 0);
  assert('no recovery boost',      !data.recoveryBoostApplied);
  assert('totalReviews is 5',      data.totalReviews === 5);
});

// ─── Suite 3: missed yesterday (at_risk) ──────────────────────────────────────

suite('computeStreakData — last review was 2 days ago (at_risk)', () => {
  // User did not review yesterday, but reviewed 2 days ago and before
  const reviews = [2,3,4,5,6].map((n) => review(daysBefore(n)));
  const data = computeStreakData(reviews, TODAY);
  // missedDays = 2 (last review = 2 days ago)
  assert('missedDays is 2',        data.missedDays === 2);
  // Streak should be 0 — no review yesterday or today
  assert('currentStreak is 0',     data.currentStreak === 0);
  assert('status is new or at_risk', data.streakStatus === 'new' || data.streakStatus === 'at_risk');
});

// ─── Suite 4: missed 1 day but active yesterday ───────────────────────────────

suite('computeStreakData — reviewed yesterday (streak still alive today)', () => {
  // User reviews every day except today
  const reviews = [1,2,3,4,5].map((n) => review(daysBefore(n)));
  const data = computeStreakData(reviews, TODAY);
  // Last review was yesterday → missedDays = 1 → streak preserved
  assert('missedDays is 1',        data.missedDays === 1);
  assert('currentStreak ≥ 1',      data.currentStreak >= 1);
  assert('status is active',       data.streakStatus === 'active');
});

// ─── Suite 5: recovery saves streak ──────────────────────────────────────────

suite('computeStreakData — recovery saves streak across 1-day gap', () => {
  // Day 5 → day 4 → gap (day 3 missing) → day 2 with recovery → day 1
  const reviews = [
    review(daysBefore(1)),
    review(daysBefore(2), { recoveryUsed: true, completedCount: 3 }),
    // day 3 missing
    review(daysBefore(4)),
    review(daysBefore(5)),
  ];
  const data = computeStreakData(reviews, TODAY);
  assert('currentStreak > 0',         data.currentStreak > 0);
  assert('recoveryBoostApplied true', data.recoveryBoostApplied);
  assert('status is recovered',       data.streakStatus === 'recovered');
  assert('streakLabel includes "recovered"', data.streakLabel.includes('recovered'));
});

// ─── Suite 6: streak broken after 3+ missed days ─────────────────────────────

suite('computeStreakData — streak broken after 3+ day gap', () => {
  // User was active 10–14 days ago, then disappeared
  const reviews = [10,11,12,13,14].map((n) => review(daysBefore(n)));
  const data = computeStreakData(reviews, TODAY);
  assert('currentStreak is 0',   data.currentStreak === 0);
  assert('missedDays is 10',     data.missedDays === 10);
  assert('bestStreak is 5',      data.bestStreak === 5);
  assert('totalReviews is 5',    data.totalReviews === 5);
});

// ─── Suite 7: zero-completion days don't count ───────────────────────────────

suite('computeStreakData — zero-completion days excluded', () => {
  const reviews = [
    review(daysBefore(0), { completedCount: 0, recoveryUsed: false }),
    review(daysBefore(1), { completedCount: 4 }),
    review(daysBefore(2), { completedCount: 3 }),
  ];
  const data = computeStreakData(reviews, TODAY);
  // Today had 0 completions — it does not extend the streak
  // But yesterday and 2 days ago do — streak should be at least the yesterday chain
  assert('missedDays is 0',         data.missedDays === 0); // reviewed today
  assert('streak from active days', data.currentStreak >= 0); // at minimum 0 (today excluded)
});

// ─── Suite 8: detectGap ───────────────────────────────────────────────────────

suite('detectGap — various gaps', () => {
  const gap0 = detectGap([review(TODAY)], TODAY);
  assert('same-day → missedDays 0', gap0.missedDays === 0);
  assert('same-day → lastActivityDate set', gap0.lastActivityDate === TODAY);

  const gap1 = detectGap([review(daysBefore(1))], TODAY);
  assert('yesterday → missedDays 1', gap1.missedDays === 1);

  const gap5 = detectGap([review(daysBefore(5))], TODAY);
  assert('5 days ago → missedDays 5', gap5.missedDays === 5);

  const gapNone = detectGap([], TODAY);
  assert('no reviews → missedDays -1', gapNone.missedDays === -1);
  assert('no reviews → lastActivityDate null', gapNone.lastActivityDate === null);
});

// ─── Suite 9: buildReentryMessage ────────────────────────────────────────────

suite('buildReentryMessage — copy by gap', () => {
  assert('0 days → empty string', buildReentryMessage(0) === '');
  assert('1 day → message',  buildReentryMessage(1).length > 0);
  assert('2 days → message', buildReentryMessage(2).length > 0);
  assert('3 days → message', buildReentryMessage(3).length > 0);
  assert('10 days → message', buildReentryMessage(10).length > 0);
  assert('1 day no guilt keyword', !buildReentryMessage(1).toLowerCase().includes('fail'));
  assert('3 days no guilt keyword', !buildReentryMessage(3).toLowerCase().includes('fail'));
  // Different messages for different gaps
  assert('1-day ≠ 3-day message', buildReentryMessage(1) !== buildReentryMessage(3));
});

// ─── Suite 10: buildCommitmentSignal ──────────────────────────────────────────

suite('buildCommitmentSignal — contextual signals', () => {
  // High streak → signal
  const signal7 = buildCommitmentSignal([], EMPTY_HINTS, 7);
  assert('streak 7 → non-null signal', signal7 !== null);
  assert('streak 7 → mentions 7', signal7?.includes('7') ?? false);

  const signal5 = buildCommitmentSignal([], EMPTY_HINTS, 5);
  assert('streak 5 → non-null signal', signal5 !== null);

  const signal3 = buildCommitmentSignal([], EMPTY_HINTS, 3);
  assert('streak 3 → non-null signal', signal3 !== null);

  const signal2 = buildCommitmentSignal([], EMPTY_HINTS, 2);
  assert('streak 2 → non-null signal', signal2 !== null);

  // Recovery aftermath
  const recoveryReviews = [
    review(daysBefore(1), { systemTakeaway: 'recovered_strong' }),
  ];
  const recoverySignal = buildCommitmentSignal(recoveryReviews, EMPTY_HINTS, 1);
  assert('recovery aftermath → signal', recoverySignal !== null);

  // Light load hint
  const lightHints = { ...EMPTY_HINTS, capMultiplier: 0.5 };
  const lightSignal = buildCommitmentSignal([], lightHints, 0);
  assert('light cap → signal', lightSignal !== null);

  // No signal when streak = 0 and no signals
  const noSignal = buildCommitmentSignal([], EMPTY_HINTS, 0);
  assert('streak 0 + no hints → null', noSignal === null);

  // Improving execution hint
  const improvingHints = { ...EMPTY_HINTS, executionTrend: 'improving' as const };
  const improvingSignal = buildCommitmentSignal([], improvingHints, 0);
  assert('improving trend → signal', improvingSignal !== null);
});

// ─── Suite 11: buildRetentionNudgeContent ─────────────────────────────────────

suite('buildRetentionNudgeContent — notification copy', () => {
  const n1 = buildRetentionNudgeContent(1);
  assert('gap 1 → title', n1.title.length > 0);
  assert('gap 1 → body', n1.body.length > 0);

  const n2 = buildRetentionNudgeContent(2);
  assert('gap 2 → title', n2.title.length > 0);
  assert('gap 2 → body', n2.body.length > 0);
  assert('gap 2 ≠ gap 1 body', n2.body !== n1.body);

  const n5 = buildRetentionNudgeContent(5);
  assert('gap 5 → title', n5.title.length > 0);
  assert('gap 5 → body', n5.body.length > 0);

  // All messages start with 'LifeOS'
  assert('gap 1 title starts LifeOS', n1.title.startsWith('LifeOS'));
  assert('gap 2 title starts LifeOS', n2.title.startsWith('LifeOS'));
  assert('gap 5 title starts LifeOS', n5.title.startsWith('LifeOS'));
});

// ─── Suite 12: notificationPlanner — buildRetentionNudgeContent ───────────────

suite('notificationPlanner — buildRetentionNudgeContent (parity)', () => {
  // Both engines should produce same output (planner delegates to retentionEngine)
  const r1 = buildRetentionNudgeContent(1);
  const p1 = plannerNudge(1);
  assert('gap 1: same title', r1.title === p1.title);
  assert('gap 1: same body',  r1.body  === p1.body);

  const r3 = buildRetentionNudgeContent(3);
  const p3 = plannerNudge(3);
  assert('gap 3: same title', r3.title === p3.title);
  assert('gap 3: same body',  r3.body  === p3.body);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Batch 10 retention tests: ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
  console.error('TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASS');
}
