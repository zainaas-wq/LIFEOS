/**
 * __tests__/batch6-metrics.ts
 *
 * Node-runnable tests for metricsEngine.ts pure functions.
 * Run: npx tsx __tests__/batch6-metrics.ts
 *
 * No React, no store, no Supabase, no AsyncStorage.
 */

export {};

import {
  computeCompletionTrend,
  computeAvgCompletionRate,
  computeDriftFrequency,
  computeRecoveryStats,
  computeRetentionSignals,
  computeMetricsSummary,
  computeAvgAlignmentScore,
} from '../src/ai/metricsEngine';
import type { DailyReview } from '../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function approx(a: number, b: number, eps = 0.001): boolean {
  return Math.abs(a - b) < eps;
}

function makeReview(
  date: string,
  completed: number,
  total: number,
  opts: Partial<DailyReview> = {},
): DailyReview {
  return {
    date,
    completedCount: completed,
    totalCount:     total,
    focusMinutes:   opts.focusMinutes  ?? 60,
    criticalDone:   opts.criticalDone  ?? false,
    driftTypes:     opts.driftTypes    ?? [],
    recoveryUsed:   opts.recoveryUsed  ?? false,
    recoveryMode:   opts.recoveryMode,
    alignmentScore: opts.alignmentScore,
    savedAt:        opts.savedAt ?? new Date().toISOString(),
    systemTakeaway: opts.systemTakeaway,
    distractionCount: opts.distractionCount,
    skipCount:      opts.skipCount,
  };
}

// ─── Suite 1: computeCompletionTrend ─────────────────────────────────────────

console.log('\nSuite 1: computeCompletionTrend');

{
  const reviews = [
    makeReview('2026-03-25', 4, 5),
    makeReview('2026-03-26', 3, 5),
    makeReview('2026-03-27', 5, 5),
    makeReview('2026-03-28', 2, 5),
    makeReview('2026-03-29', 4, 5),
  ];

  const trend = computeCompletionTrend(reviews, 5);
  assert('returns 5 data points',          trend.length === 5);
  assert('sorted ascending by date',       trend[0].date === '2026-03-25');
  assert('last entry is most recent',      trend[4].date === '2026-03-29');
  assert('rate = 4/5 = 0.8',              approx(trend[0].rate, 0.8));
  assert('rate = 5/5 = 1.0',              approx(trend[2].rate, 1.0));
  assert('focusMinutes present',           trend[0].focusMinutes === 60);
}

{
  // days param limits results
  const reviews = [
    makeReview('2026-03-23', 3, 5),
    makeReview('2026-03-24', 3, 5),
    makeReview('2026-03-25', 3, 5),
    makeReview('2026-03-26', 3, 5),
    makeReview('2026-03-27', 3, 5),
    makeReview('2026-03-28', 3, 5),
    makeReview('2026-03-29', 3, 5),
  ];
  const trend3 = computeCompletionTrend(reviews, 3);
  assert('days=3 returns 3 entries',        trend3.length === 3);
  assert('days=3 returns most recent 3',    trend3[0].date === '2026-03-27');
}

{
  // empty reviews
  const trend = computeCompletionTrend([], 7);
  assert('empty reviews → empty trend',     trend.length === 0);
}

// ─── Suite 2: computeAvgCompletionRate ───────────────────────────────────────

console.log('\nSuite 2: computeAvgCompletionRate');

{
  const reviews = [
    makeReview('2026-03-27', 4, 5),  // 0.8
    makeReview('2026-03-28', 5, 5),  // 1.0
    makeReview('2026-03-29', 3, 5),  // 0.6
  ];
  const avg = computeAvgCompletionRate(reviews);
  assert('avg = (0.8+1.0+0.6)/3 = 0.8',  approx(avg, 0.8));
}

{
  // days with totalCount=0 excluded
  const reviews = [
    makeReview('2026-03-27', 0, 0), // excluded
    makeReview('2026-03-28', 4, 5), // 0.8
    makeReview('2026-03-29', 2, 5), // 0.4
  ];
  const avg = computeAvgCompletionRate(reviews);
  assert('zero-task days excluded from avg', approx(avg, 0.6));
}

{
  assert('empty reviews → 0',  computeAvgCompletionRate([]) === 0);
  assert('all zero-task → 0',  computeAvgCompletionRate([makeReview('2026-03-27', 0, 0)]) === 0);
}

// ─── Suite 3: computeDriftFrequency ──────────────────────────────────────────

console.log('\nSuite 3: computeDriftFrequency');

{
  const reviews = [
    makeReview('2026-03-27', 3, 5, { driftTypes: ['avoidance', 'distraction'] }),
    makeReview('2026-03-28', 4, 5, { driftTypes: ['avoidance'] }),
    makeReview('2026-03-29', 5, 5, { driftTypes: [] }),
  ];
  const df = computeDriftFrequency(reviews);
  assert('avgDriftsPerDay = 3/3 = 1.0',    approx(df.avgDriftsPerDay, 1.0));
  assert('avoidance count = 2',            df.byType['avoidance'] === 2);
  assert('distraction count = 1',          df.byType['distraction'] === 1);
  assert('worstDay = 2026-03-27',          df.worstDay === '2026-03-27');
}

{
  // no drifts
  const reviews = [
    makeReview('2026-03-27', 4, 5),
    makeReview('2026-03-28', 5, 5),
  ];
  const df = computeDriftFrequency(reviews);
  assert('no drifts → avgDriftsPerDay = 0', df.avgDriftsPerDay === 0);
  assert('no drifts → worstDay = null',      df.worstDay === null);
}

{
  const df = computeDriftFrequency([]);
  assert('empty → avgDriftsPerDay = 0', df.avgDriftsPerDay === 0);
  assert('empty → worstDay = null',      df.worstDay === null);
}

// ─── Suite 4: computeRecoveryStats ───────────────────────────────────────────

console.log('\nSuite 4: computeRecoveryStats');

{
  const reviews = [
    makeReview('2026-03-25', 4, 5, { recoveryUsed: false }),
    makeReview('2026-03-26', 4, 5, { recoveryUsed: true, recoveryMode: 'resume_now' }),  // effective (0.8)
    makeReview('2026-03-27', 2, 5, { recoveryUsed: true, recoveryMode: 'save_day' }),    // not effective (0.4)
    makeReview('2026-03-28', 3, 5, { recoveryUsed: true, recoveryMode: 'resume_now' }),  // effective (0.6)
  ];
  const stats = computeRecoveryStats(reviews);
  assert('usageRate = 3/4 = 0.75',            approx(stats.usageRate, 0.75));
  assert('effectivenessRate = 2/3 ≈ 0.667',   approx(stats.effectivenessRate, 2/3));
  assert('rankedModes: resume_now first',      stats.rankedModes[0].mode === 'resume_now');
  assert('resume_now score = 2/2 = 1.0',      approx(stats.rankedModes[0].score, 1.0));
  assert('save_day score = 0/1 = 0.0',        approx(stats.rankedModes[1]?.score ?? 0, 0.0));
  assert('resume_now uses = 2',               stats.rankedModes[0].uses === 2);
}

{
  // no recovery days
  const reviews = [
    makeReview('2026-03-27', 4, 5),
    makeReview('2026-03-28', 5, 5),
  ];
  const stats = computeRecoveryStats(reviews);
  assert('no recovery → usageRate = 0',        stats.usageRate === 0);
  assert('no recovery → effectivenessRate = 0', stats.effectivenessRate === 0);
  assert('no recovery → rankedModes empty',     stats.rankedModes.length === 0);
}

// ─── Suite 5: computeRetentionSignals ────────────────────────────────────────

console.log('\nSuite 5: computeRetentionSignals');

{
  const reviews = [
    makeReview('2026-03-23', 3, 5),
    makeReview('2026-03-24', 4, 5),
    makeReview('2026-03-25', 0, 5), // no completions — breaks streak
    makeReview('2026-03-26', 3, 5),
    makeReview('2026-03-27', 2, 5),
    makeReview('2026-03-28', 5, 5),
    makeReview('2026-03-29', 4, 5),
  ];
  const ret = computeRetentionSignals(reviews, 7);
  assert('reviewsSaved = 7',               ret.reviewsSaved === 7);
  assert('activeDays = 7',                 ret.activeDays === 7);
  assert('reviewCompletionRate = 7/7 = 1', approx(ret.reviewCompletionRate, 1.0));
  // streak: 23,24 (2), then gap, 26,27,28,29 (4) → bestStreak=4, currentStreak=4
  assert('bestCompletionStreak = 4',       ret.bestCompletionStreak === 4);
  assert('currentCompletionStreak = 4',    ret.currentCompletionStreak === 4);
}

{
  // reviewCompletionRate capped at 1
  const reviews = [
    makeReview('2026-03-27', 3, 5),
    makeReview('2026-03-28', 3, 5),
    makeReview('2026-03-29', 3, 5),
  ];
  const ret = computeRetentionSignals(reviews, 2); // only 2 active days claimed
  assert('reviewCompletionRate capped at 1', ret.reviewCompletionRate <= 1);
}

{
  const ret = computeRetentionSignals([], 0);
  assert('empty → reviewsSaved = 0',           ret.reviewsSaved === 0);
  assert('empty → bestCompletionStreak = 0',   ret.bestCompletionStreak === 0);
  assert('empty → currentCompletionStreak = 0', ret.currentCompletionStreak === 0);
}

// ─── Suite 6: computeAvgAlignmentScore ───────────────────────────────────────

console.log('\nSuite 6: computeAvgAlignmentScore');

{
  const reviews = [
    makeReview('2026-03-27', 3, 5, { alignmentScore: 80 }),
    makeReview('2026-03-28', 4, 5, { alignmentScore: 60 }),
    makeReview('2026-03-29', 5, 5),  // no alignmentScore
  ];
  const avg = computeAvgAlignmentScore(reviews);
  assert('avg = (80+60)/2 = 70',        approx(avg, 70));
  assert('skips undefined scores',       avg !== (80 + 60 + 0) / 3);
}

{
  assert('no scores → 0', computeAvgAlignmentScore([makeReview('2026-03-27', 3, 5)]) === 0);
  assert('empty → 0',     computeAvgAlignmentScore([]) === 0);
}

// ─── Suite 7: computeMetricsSummary ──────────────────────────────────────────

console.log('\nSuite 7: computeMetricsSummary');

{
  const reviews = [
    makeReview('2026-03-25', 4, 5, { focusMinutes: 90, driftTypes: ['avoidance'] }),
    makeReview('2026-03-26', 5, 5, { focusMinutes: 120, recoveryUsed: true, recoveryMode: 'resume_now' }),
    makeReview('2026-03-27', 3, 5, { focusMinutes: 60 }),
  ];
  const summary = computeMetricsSummary(reviews, 30);
  assert('windowDays = 30',                      summary.windowDays === 30);
  assert('totalFocusMinutes = 270',              summary.totalFocusMinutes === 270);
  assert('avgCompletionRate > 0',                summary.avgCompletionRate > 0);
  assert('drift.avgDriftsPerDay defined',        typeof summary.drift.avgDriftsPerDay === 'number');
  assert('recovery.usageRate defined',           typeof summary.recovery.usageRate === 'number');
  assert('retention.reviewsSaved = 3',           summary.retention.reviewsSaved === 3);
}

// ─── Suite 8: edge — single review ───────────────────────────────────────────

console.log('\nSuite 8: Single review edge cases');

{
  const single = [makeReview('2026-03-29', 5, 5, { recoveryUsed: true, recoveryMode: 'compress_day' })];
  const stats = computeRecoveryStats(single);
  assert('single recovery day usageRate = 1', stats.usageRate === 1);
  assert('single effective day = 1.0',         approx(stats.effectivenessRate, 1.0));
  assert('mode uses = 1',                       stats.rankedModes[0].uses === 1);

  const trend = computeCompletionTrend(single, 7);
  assert('single review trend length = 1',  trend.length === 1);
  assert('single review rate = 1.0',        approx(trend[0].rate, 1.0));
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nSome tests failed.');
  process.exit(1);
} else {
  console.log('\nAll tests passed.');
}
