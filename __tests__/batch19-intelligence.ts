/**
 * Batch 19: Weekly / Monthly Intelligence Layer — Unit Tests
 *
 * Coverage:
 *   A. computeWeeklyIntelligence  — character, quality, trend, recovery, drift
 *   B. computeMonthlyIntelligence — trend, stability, breakdown patterns, interpretation
 *   C. getMomentumState           — all 5 states
 *   D. getDominantWeeklyPattern   — dominant takeaway
 *   E. buildStrategicRecommendations — signal-traced, capped at 3
 *   F. buildStrategicCoachSummary — prompt section formatting
 *   G. Data sparsity guards       — insufficient_data at correct thresholds
 *
 * Pure engine tests only — no Supabase, no React, no store.
 */

import {
  computeWeeklyIntelligence,
  computeMonthlyIntelligence,
  getMomentumState,
  getDominantWeeklyPattern,
  buildStrategicRecommendations,
  buildStrategicCoachSummary,
} from '../src/ai/intelligenceEngine';

import type {
  DailyReview,
  WeeklyIntelligence,
  MonthlyIntelligence,
} from '../src/types';

// ─── Assertion helper (throws on failure, unlike console.assert) ──────────────

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// ─── Factories ────────────────────────────────────────────────────────────────

function makeReview(overrides: Partial<DailyReview> & { date: string }): DailyReview {
  return {
    completedCount:   5,
    totalCount:       5,
    focusMinutes:     90,
    criticalDone:     true,
    driftTypes:       [],
    recoveryUsed:     false,
    alignmentScore:   80,
    savedAt:          new Date().toISOString(),
    distractionCount: 0,
    skipCount:        0,
    systemTakeaway:   'clean_day',
    ...overrides,
  };
}

// Week: 2026-03-23 (Mon) to 2026-03-29 (Sun)
const WEEK_START = '2026-03-23';
const TODAY      = '2026-03-31';

function makeWeek(reviews: Partial<DailyReview>[]): DailyReview[] {
  const dates = ['2026-03-23','2026-03-24','2026-03-25','2026-03-26','2026-03-27','2026-03-28','2026-03-29'];
  return reviews.map((r, i) => makeReview({ date: dates[i], ...r }));
}

function makeMonth(dayOverrides: Array<Partial<DailyReview> | null>): DailyReview[] {
  const out: DailyReview[] = [];
  for (let i = 0; i < dayOverrides.length; i++) {
    if (dayOverrides[i] === null) continue;
    const date = new Date('2026-03-31T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - (dayOverrides.length - 1 - i));
    out.push(makeReview({ date: date.toISOString().slice(0, 10), ...dayOverrides[i]! }));
  }
  return out;
}

// ─── Section A: computeWeeklyIntelligence ────────────────────────────────────

function testWeekly_strong(): void {
  const reviews = makeWeek([
    { completedCount: 5, totalCount: 5, focusMinutes: 120, systemTakeaway: 'clean_day' },
    { completedCount: 4, totalCount: 5, focusMinutes: 90,  systemTakeaway: 'solid_day' },
    { completedCount: 5, totalCount: 5, focusMinutes: 100, systemTakeaway: 'clean_day' },
    { completedCount: 5, totalCount: 6, focusMinutes: 110, systemTakeaway: 'solid_day' },
    { completedCount: 4, totalCount: 5, focusMinutes: 90,  systemTakeaway: 'clean_day' },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.weekCharacter === 'strong', `A1 expected strong, got ${wi.weekCharacter}`);
  assert(wi.executionQuality === 'high', `A1b execution quality should be high`);
  assert(wi.reviewedDays === 5, `A1c reviewedDays should be 5`);
  assert(wi.recoveryDependence === 'none', `A1d no recovery used`);
  assert(wi.avgCompletionRate >= 0.75, `A1e avgRate ${wi.avgCompletionRate} < 0.75`);
  console.log('A1 PASS computeWeeklyIntelligence → strong week');
}

function testWeekly_overloaded(): void {
  const reviews = makeWeek([
    { completedCount: 2, totalCount: 8, driftTypes: ['overload'], systemTakeaway: 'overload_pattern' },
    { completedCount: 3, totalCount: 9, driftTypes: ['overload'], systemTakeaway: 'overload_pattern' },
    { completedCount: 2, totalCount: 7, driftTypes: ['overload'], systemTakeaway: 'overload_pattern' },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.weekCharacter === 'overloaded', `A2 expected overloaded, got ${wi.weekCharacter}`);
  assert(wi.dominantDriftPattern === 'overload', `A2b dominant drift should be overload`);
  console.log('A2 PASS computeWeeklyIntelligence → overloaded week');
}

function testWeekly_rebuilding(): void {
  const reviews = makeWeek([
    { completedCount: 3, totalCount: 6, recoveryUsed: true, recoveryMode: 'save_day' },
    { completedCount: 4, totalCount: 6, recoveryUsed: true, recoveryMode: 'save_day' },
    { completedCount: 3, totalCount: 7, recoveryUsed: true, recoveryMode: 'resume_now' },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.weekCharacter === 'rebuilding', `A3 expected rebuilding, got ${wi.weekCharacter}`);
  assert(wi.recoveryDependence === 'frequent', `A3b recovery frequent`);
  console.log('A3 PASS computeWeeklyIntelligence → rebuilding week');
}

function testWeekly_volatile(): void {
  const reviews = makeWeek([
    { completedCount: 1, totalCount: 6, systemTakeaway: 'low_execution' },
    { completedCount: 5, totalCount: 5, systemTakeaway: 'clean_day' },
    { completedCount: 1, totalCount: 7, systemTakeaway: 'avoidance_pattern' },
    { completedCount: 5, totalCount: 5, systemTakeaway: 'clean_day' },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.weekCharacter === 'volatile', `A4 expected volatile, got ${wi.weekCharacter}`);
  console.log('A4 PASS computeWeeklyIntelligence → volatile week (high stdDev)');
}

function testWeekly_stable(): void {
  const reviews = makeWeek([
    { completedCount: 3, totalCount: 5, systemTakeaway: 'mixed_day' },
    { completedCount: 3, totalCount: 6, systemTakeaway: 'mixed_day' },
    { completedCount: 4, totalCount: 6, systemTakeaway: 'solid_day' },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.weekCharacter === 'stable', `A5 expected stable, got ${wi.weekCharacter}`);
  assert(wi.executionQuality === 'medium', `A5b quality should be medium`);
  console.log('A5 PASS computeWeeklyIntelligence → stable week');
}

function testWeekly_insufficient_data(): void {
  const reviews = makeWeek([
    { completedCount: 4, totalCount: 5 },
    { completedCount: 3, totalCount: 5 },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.weekCharacter === 'insufficient_data', `A6 expected insufficient_data, got ${wi.weekCharacter}`);
  assert(wi.executionQuality === 'insufficient_data', `A6b quality insufficient`);
  assert(wi.momentumTrend === 'insufficient_data', `A6c momentum insufficient`);
  console.log('A6 PASS computeWeeklyIntelligence → insufficient_data (2 reviews)');
}

function testWeekly_momentumTrend_improving(): void {
  const reviews = makeWeek([
    { completedCount: 2, totalCount: 8, systemTakeaway: 'low_execution' },
    { completedCount: 3, totalCount: 8, systemTakeaway: 'mixed_day' },
    { completedCount: 5, totalCount: 7, systemTakeaway: 'solid_day' },
    { completedCount: 6, totalCount: 7, systemTakeaway: 'clean_day' },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.momentumTrend === 'improving', `A7 expected improving, got ${wi.momentumTrend}`);
  console.log('A7 PASS computeWeeklyIntelligence → momentumTrend improving');
}

function testWeekly_momentumTrend_declining(): void {
  const reviews = makeWeek([
    { completedCount: 6, totalCount: 7 },
    { completedCount: 6, totalCount: 7 },
    { completedCount: 2, totalCount: 8 },
    { completedCount: 1, totalCount: 8 },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.momentumTrend === 'declining', `A8 expected declining, got ${wi.momentumTrend}`);
  console.log('A8 PASS computeWeeklyIntelligence → momentumTrend declining');
}

function testWeekly_recoveryDependence_occasional(): void {
  const reviews = makeWeek([
    { completedCount: 3, totalCount: 5, recoveryUsed: true },
    { completedCount: 4, totalCount: 5, recoveryUsed: false },
    { completedCount: 4, totalCount: 5, recoveryUsed: false },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.recoveryDependence === 'occasional', `A9 expected occasional`);
  console.log('A9 PASS computeWeeklyIntelligence → recoveryDependence occasional');
}

function testWeekly_totalFocusMinutes(): void {
  const reviews = makeWeek([
    { completedCount: 5, totalCount: 5, focusMinutes: 60 },
    { completedCount: 5, totalCount: 5, focusMinutes: 90 },
    { completedCount: 5, totalCount: 5, focusMinutes: 120 },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.totalFocusMinutes === 270, `A10 expected 270, got ${wi.totalFocusMinutes}`);
  console.log('A10 PASS computeWeeklyIntelligence → totalFocusMinutes summed correctly');
}

function testWeekly_reviewConsistency(): void {
  const reviews = makeWeek([
    { completedCount: 5, totalCount: 5 },
    { completedCount: 5, totalCount: 5 },
    { completedCount: 5, totalCount: 5 },
    { completedCount: 5, totalCount: 5 },
    { completedCount: 5, totalCount: 5 },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  // 5/7 ≈ 0.71
  assert(Math.abs(wi.reviewConsistency - 0.71) < 0.01, `A11 consistency should be ~0.71, got ${wi.reviewConsistency}`);
  console.log('A11 PASS computeWeeklyIntelligence → reviewConsistency');
}

function testWeekly_systemTakeaways(): void {
  const reviews = makeWeek([
    { systemTakeaway: 'clean_day' },
    { systemTakeaway: 'solid_day' },
    { systemTakeaway: undefined },  // should be excluded
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.systemTakeaways.length === 2, `A12 expected 2 takeaways, got ${wi.systemTakeaways.length}`);
  assert(wi.systemTakeaways.includes('clean_day'), 'A12b clean_day present');
  assert(!wi.systemTakeaways.includes(undefined as any), 'A12c undefined excluded');
  console.log('A12 PASS computeWeeklyIntelligence → systemTakeaways filtered');
}

function testWeekly_noReviews(): void {
  const wi = computeWeeklyIntelligence([], WEEK_START);
  assert(wi.reviewedDays === 0, 'A13a no reviews');
  assert(wi.weekCharacter === 'insufficient_data', 'A13b insufficient_data');
  assert(wi.avgCompletionRate === 0, 'A13c avgRate 0');
  console.log('A13 PASS computeWeeklyIntelligence → empty reviews');
}

// ─── Section B: computeMonthlyIntelligence ───────────────────────────────────

function testMonthly_improving_progressing(): void {
  // First half poor, second half excellent
  const reviews = makeMonth([
    { completedCount: 2, totalCount: 8 },
    { completedCount: 2, totalCount: 8 },
    { completedCount: 3, totalCount: 8 },
    { completedCount: 2, totalCount: 8 },
    { completedCount: 3, totalCount: 8 },
    { completedCount: 3, totalCount: 8 },
    { completedCount: 3, totalCount: 8 },
    { completedCount: 6, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
  ]);
  const mi = computeMonthlyIntelligence(reviews, TODAY);
  assert(mi.executionTrend === 'improving', `B1 expected improving, got ${mi.executionTrend}`);
  assert(mi.reviewedDays === 14, `B1b reviewedDays ${mi.reviewedDays}`);
  console.log('B1 PASS computeMonthlyIntelligence → improving trend');
}

function testMonthly_declining(): void {
  const reviews = makeMonth([
    { completedCount: 7, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 6, totalCount: 8 },
    { completedCount: 6, totalCount: 8 },
    { completedCount: 6, totalCount: 8 },
    { completedCount: 2, totalCount: 8 },
    { completedCount: 2, totalCount: 8 },
    { completedCount: 2, totalCount: 8 },
    { completedCount: 2, totalCount: 8 },
    { completedCount: 2, totalCount: 8 },
    { completedCount: 2, totalCount: 8 },
    { completedCount: 2, totalCount: 8 },
  ]);
  const mi = computeMonthlyIntelligence(reviews, TODAY);
  assert(mi.executionTrend === 'declining', `B2 expected declining, got ${mi.executionTrend}`);
  assert(mi.monthlyInterpretation === 'decaying', `B2b interpretation should be decaying`);
  console.log('B2 PASS computeMonthlyIntelligence → declining trend');
}

function testMonthly_oscillating(): void {
  // Wildly alternating completion rates — no clear trend, high variance
  const reviews = makeMonth([
    { completedCount: 1, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 1, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 1, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 1, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 1, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 1, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
    { completedCount: 1, totalCount: 8 },
    { completedCount: 7, totalCount: 8 },
  ]);
  const mi = computeMonthlyIntelligence(reviews, TODAY);
  assert(mi.executionTrend === 'oscillating', `B3 expected oscillating, got ${mi.executionTrend}`);
  assert(mi.monthlyInterpretation === 'oscillating', `B3b interpretation oscillating`);
  console.log('B3 PASS computeMonthlyIntelligence → oscillating trend');
}

function testMonthly_insufficient_data(): void {
  const reviews = makeMonth([
    { completedCount: 5, totalCount: 5 },
    { completedCount: 5, totalCount: 5 },
    { completedCount: 5, totalCount: 5 },
  ]);
  const mi = computeMonthlyIntelligence(reviews, TODAY);
  assert(mi.executionTrend === 'insufficient_data', 'B4 insufficient_data');
  assert(mi.routineStability === 'insufficient_data', 'B4b stability insufficient');
  assert(mi.monthlyInterpretation === 'insufficient_data', 'B4c interpretation insufficient');
  console.log('B4 PASS computeMonthlyIntelligence → insufficient_data');
}

function testMonthly_repeatedBreakdownPatterns(): void {
  // avoidance in 8/10 = 80% of reviews → repeated
  // overload in 2/10 = 20% → NOT repeated
  const reviews = makeMonth(
    Array.from({ length: 10 }, (_, i) => ({
      completedCount: 3,
      totalCount: 7,
      driftTypes: (i < 8 ? ['avoidance' as const] : ['overload' as const]),
    }))
  );
  const mi = computeMonthlyIntelligence(reviews, TODAY);
  assert(mi.repeatedBreakdownPatterns.includes('avoidance'), 'B5a avoidance is repeated');
  assert(!mi.repeatedBreakdownPatterns.includes('overload'), 'B5b overload is not repeated');
  console.log('B5 PASS computeMonthlyIntelligence → repeatedBreakdownPatterns');
}

function testMonthly_routineStability_stable(): void {
  // All reviews consistent around 0.7 completion
  const reviews = makeMonth(
    Array.from({ length: 10 }, () => ({ completedCount: 7, totalCount: 10 }))
  );
  const mi = computeMonthlyIntelligence(reviews, TODAY);
  assert(mi.routineStability === 'stable', `B6 expected stable, got ${mi.routineStability}`);
  console.log('B6 PASS computeMonthlyIntelligence → routineStability stable');
}

function testMonthly_noReviews(): void {
  const mi = computeMonthlyIntelligence([], TODAY);
  assert(mi.reviewedDays === 0, 'B7a no reviews');
  assert(mi.executionTrend === 'insufficient_data', 'B7b insufficient_data');
  console.log('B7 PASS computeMonthlyIntelligence → empty reviews');
}

// ─── Section C: getMomentumState ─────────────────────────────────────────────

function makeWeeklyIntelligence(overrides: Partial<WeeklyIntelligence>): WeeklyIntelligence {
  return {
    weekStart:          WEEK_START,
    weekEnd:            '2026-03-29',
    reviewedDays:       5,
    avgCompletionRate:  0.7,
    totalFocusMinutes:  300,
    completionRates:    [0.6, 0.7, 0.7, 0.8, 0.7],
    recoveryDependence: 'none',
    dominantDriftPattern: null,
    weekCharacter:      'stable',
    executionQuality:   'medium',
    reviewConsistency:  0.71,
    momentumTrend:      'flat',
    systemTakeaways:    ['solid_day', 'solid_day', 'clean_day', 'solid_day', 'solid_day'],
    ...overrides,
  };
}

function testMomentum_building(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'strong', momentumTrend: 'flat' });
  assert(getMomentumState(wi) === 'building', 'C1 strong + non-declining → building');
  console.log('C1 PASS getMomentumState → building');
}

function testMomentum_maintaining(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'stable', momentumTrend: 'flat' });
  assert(getMomentumState(wi) === 'maintaining', 'C2 stable + flat → maintaining');
  console.log('C2 PASS getMomentumState → maintaining');
}

function testMomentum_recovering(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'rebuilding', momentumTrend: 'improving' });
  assert(getMomentumState(wi) === 'recovering', 'C3 rebuilding + improving → recovering');
  console.log('C3 PASS getMomentumState → recovering');
}

function testMomentum_stalled(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'volatile', momentumTrend: 'flat', executionQuality: 'low' });
  assert(getMomentumState(wi) === 'stalled', 'C4 volatile + flat + low → stalled');
  console.log('C4 PASS getMomentumState → stalled');
}

function testMomentum_insufficient(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'insufficient_data' });
  assert(getMomentumState(wi) === 'insufficient_data', 'C5 insufficient_data');
  console.log('C5 PASS getMomentumState → insufficient_data');
}

function testMomentum_volatileImproving_recovering(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'volatile', momentumTrend: 'improving' });
  assert(getMomentumState(wi) === 'recovering', 'C6 volatile + improving → recovering');
  console.log('C6 PASS getMomentumState volatile + improving → recovering');
}

// ─── Section D: getDominantWeeklyPattern ─────────────────────────────────────

function testDominantPattern_mostFrequent(): void {
  const wi = makeWeeklyIntelligence({
    systemTakeaways: ['clean_day', 'avoidance_pattern', 'clean_day', 'avoidance_pattern', 'avoidance_pattern'],
  });
  const pattern = getDominantWeeklyPattern(wi);
  assert(pattern === 'avoidance_pattern', `D1 expected avoidance_pattern, got ${pattern}`);
  console.log('D1 PASS getDominantWeeklyPattern → most frequent takeaway');
}

function testDominantPattern_empty(): void {
  const wi = makeWeeklyIntelligence({ systemTakeaways: [] });
  assert(getDominantWeeklyPattern(wi) === null, 'D2 empty → null');
  console.log('D2 PASS getDominantWeeklyPattern → null on empty');
}

function testDominantPattern_single(): void {
  const wi = makeWeeklyIntelligence({ systemTakeaways: ['solid_day'] });
  assert(getDominantWeeklyPattern(wi) === 'solid_day', 'D3 single → that entry');
  console.log('D3 PASS getDominantWeeklyPattern → single entry');
}

// ─── Section E: buildStrategicRecommendations ─────────────────────────────────

function makeMonthlyIntelligence(overrides: Partial<MonthlyIntelligence>): MonthlyIntelligence {
  return {
    periodStart:               '2026-03-01',
    periodEnd:                 TODAY,
    reviewedDays:              20,
    avgCompletionRate:         0.65,
    executionTrend:            'flat',
    routineStability:          'stable',
    repeatedBreakdownPatterns: [],
    monthlyInterpretation:     'oscillating',
    ...overrides,
  };
}

function testRecs_insufficientData(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'insufficient_data' });
  const mi = makeMonthlyIntelligence({});
  const recs = buildStrategicRecommendations(wi, mi);
  assert(recs.length === 0, `E1 insufficient_data → no recs, got ${recs.length}`);
  console.log('E1 PASS buildStrategicRecommendations insufficient_data → []');
}

function testRecs_overloadedWeek(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'overloaded', dominantDriftPattern: 'overload' });
  const mi = makeMonthlyIntelligence({});
  const recs = buildStrategicRecommendations(wi, mi);
  const hasReduceLoad = recs.some((r) => r.action === 'reduce weekly load');
  assert(hasReduceLoad, `E2 expected reduce weekly load rec`);
  const recHigh = recs.find((r) => r.action === 'reduce weekly load');
  assert(recHigh?.priority === 'high', 'E2b reduce load should be high priority');
  console.log('E2 PASS buildStrategicRecommendations overloaded → reduce weekly load (high)');
}

function testRecs_avoidancePattern(): void {
  const wi = makeWeeklyIntelligence({ dominantDriftPattern: 'avoidance' });
  const mi = makeMonthlyIntelligence({ repeatedBreakdownPatterns: ['avoidance'] });
  const recs = buildStrategicRecommendations(wi, mi);
  const hasSimplify = recs.some((r) => r.action === 'simplify daily plan');
  assert(hasSimplify, `E3 expected simplify daily plan rec`);
  console.log('E3 PASS buildStrategicRecommendations avoidance → simplify daily plan');
}

function testRecs_frequentRecovery(): void {
  const wi = makeWeeklyIntelligence({ recoveryDependence: 'frequent' });
  const mi = makeMonthlyIntelligence({});
  const recs = buildStrategicRecommendations(wi, mi);
  const hasProtect = recs.some((r) => r.action === 'protect recovery blocks');
  assert(hasProtect, `E4 expected protect recovery blocks`);
  console.log('E4 PASS buildStrategicRecommendations frequent recovery → protect blocks');
}

function testRecs_lowReviewConsistency(): void {
  const wi = makeWeeklyIntelligence({ reviewedDays: 2, reviewConsistency: 0.29 });
  const mi = makeMonthlyIntelligence({});
  const recs = buildStrategicRecommendations(wi, mi);
  const hasReview = recs.some((r) => r.action === 'increase review consistency');
  assert(hasReview, `E5 expected review consistency rec`);
  console.log('E5 PASS buildStrategicRecommendations low consistency → increase reviews');
}

function testRecs_strongWeek_maintainSystem(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'strong', momentumTrend: 'flat', executionQuality: 'high' });
  const mi = makeMonthlyIntelligence({ monthlyInterpretation: 'progressing' });
  const recs = buildStrategicRecommendations(wi, mi);
  const hasMaintain = recs.some((r) => r.action === 'maintain current system');
  assert(hasMaintain, `E6 expected maintain current system rec`);
  console.log('E6 PASS buildStrategicRecommendations strong + progressing → maintain system');
}

function testRecs_cappedAt3(): void {
  // Trigger as many signals as possible
  const wi = makeWeeklyIntelligence({
    weekCharacter:      'overloaded',
    dominantDriftPattern: 'avoidance',
    recoveryDependence: 'frequent',
    reviewConsistency:  0.2,
    reviewedDays:       2,
    momentumTrend:      'declining',
  });
  const mi = makeMonthlyIntelligence({
    repeatedBreakdownPatterns: ['avoidance', 'overload'],
  });
  const recs = buildStrategicRecommendations(wi, mi);
  assert(recs.length <= 3, `E7 recs must be <= 3, got ${recs.length}`);
  console.log(`E7 PASS buildStrategicRecommendations capped at ${recs.length}/3`);
}

function testRecs_priorityOrder(): void {
  const wi = makeWeeklyIntelligence({
    weekCharacter:       'volatile',
    dominantDriftPattern: 'avoidance',
    recoveryDependence:  'none',
    momentumTrend:       'improving',
    reviewConsistency:   0.3,
    reviewedDays:        3,
    executionQuality:    'medium',
  });
  const mi = makeMonthlyIntelligence({});
  const recs = buildStrategicRecommendations(wi, mi);
  // No high priority recs here (avoidance from weekly only → high), check order
  for (let i = 1; i < recs.length; i++) {
    const prev = recs[i - 1].priority;
    const curr = recs[i].priority;
    const order = { high: 0, medium: 1, low: 2 };
    assert(
      order[prev] <= order[curr],
      `E8 recs not sorted by priority at index ${i}: ${prev} → ${curr}`,
    );
  }
  console.log('E8 PASS buildStrategicRecommendations sorted high → medium → low');
}

function testRecs_signalTracing(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'overloaded', dominantDriftPattern: 'overload' });
  const mi = makeMonthlyIntelligence({});
  const recs = buildStrategicRecommendations(wi, mi);
  const rec = recs.find((r) => r.action === 'reduce weekly load');
  assert(rec !== undefined, 'E9a rec exists');
  assert(rec!.signal.length > 0, 'E9b signal field non-empty');
  assert(rec!.rationale.length > 0, 'E9c rationale field non-empty');
  console.log('E9 PASS buildStrategicRecommendations recommendations have signal + rationale');
}

// ─── Section F: buildStrategicCoachSummary ───────────────────────────────────

function testCoachSummary_noData(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'insufficient_data', reviewedDays: 0 });
  const mi = makeMonthlyIntelligence({});
  const recs = buildStrategicRecommendations(wi, mi);
  const summary = buildStrategicCoachSummary(wi, mi, recs);
  assert(summary === '', `F1 expected empty string, got "${summary}"`);
  console.log('F1 PASS buildStrategicCoachSummary → empty when 0 reviews');
}

function testCoachSummary_partialData(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'insufficient_data', reviewedDays: 2 });
  const mi = makeMonthlyIntelligence({});
  const recs = buildStrategicRecommendations(wi, mi);
  const summary = buildStrategicCoachSummary(wi, mi, recs);
  assert(summary.includes('2/7'), `F2 should mention 2/7 days`);
  console.log('F2 PASS buildStrategicCoachSummary → sparse data note');
}

function testCoachSummary_fullData(): void {
  const wi = makeWeeklyIntelligence({
    weekCharacter:      'volatile',
    reviewedDays:       5,
    avgCompletionRate:  0.55,
    recoveryDependence: 'frequent',
    dominantDriftPattern: 'avoidance',
    momentumTrend:      'improving',
    systemTakeaways:    ['avoidance_pattern', 'solid_day', 'avoidance_pattern', 'mixed_day', 'solid_day'],
  });
  const mi = makeMonthlyIntelligence({
    executionTrend:        'oscillating',
    monthlyInterpretation: 'oscillating',
    reviewedDays:          18,
  });
  const recs = buildStrategicRecommendations(wi, mi);
  const summary = buildStrategicCoachSummary(wi, mi, recs);

  assert(summary.includes('═══ STRATEGIC INTELLIGENCE ═══'), 'F3a section header');
  assert(summary.includes('volatile'), 'F3b weekCharacter present');
  assert(summary.includes('5/7'), 'F3c reviewedDays present');
  assert(summary.includes('55%'), 'F3d avgCompletionRate present');
  assert(summary.includes('frequent'), 'F3e recovery dependence');
  assert(summary.includes('oscillating'), 'F3f monthly trend');
  assert(summary.includes('18/30'), 'F3g monthly reviewed days');
  console.log('F3 PASS buildStrategicCoachSummary → full data, correct sections');
}

function testCoachSummary_topRecommendation(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'overloaded', dominantDriftPattern: 'overload' });
  const mi = makeMonthlyIntelligence({});
  const recs = buildStrategicRecommendations(wi, mi);
  const summary = buildStrategicCoachSummary(wi, mi, recs);
  assert(summary.includes('reduce weekly load'), 'F4 top rec in summary');
  console.log('F4 PASS buildStrategicCoachSummary → top recommendation included');
}

function testCoachSummary_noDrift_noSection(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'strong', dominantDriftPattern: null });
  const mi = makeMonthlyIntelligence({ monthlyInterpretation: 'progressing' });
  const recs = buildStrategicRecommendations(wi, mi);
  const summary = buildStrategicCoachSummary(wi, mi, recs);
  assert(!summary.includes('Dominant drift: null'), 'F5 null drift not rendered');
  console.log('F5 PASS buildStrategicCoachSummary → null drift not rendered');
}

// ─── Section G: Data sparsity guards ─────────────────────────────────────────

function testSparsity_weeklyMinDays(): void {
  // Exactly WEEKLY_MIN_DAYS (3) → should compute, not return insufficient
  const reviews = makeWeek([
    { completedCount: 4, totalCount: 5 },
    { completedCount: 4, totalCount: 5 },
    { completedCount: 4, totalCount: 5 },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.weekCharacter !== 'insufficient_data', 'G1 exactly 3 → not insufficient');
  console.log('G1 PASS weekly min days boundary: 3 → sufficient');
}

function testSparsity_weeklyBelowMin(): void {
  const reviews = makeWeek([
    { completedCount: 4, totalCount: 5 },
    { completedCount: 4, totalCount: 5 },
  ]);
  const wi = computeWeeklyIntelligence(reviews, WEEK_START);
  assert(wi.weekCharacter === 'insufficient_data', 'G2 below 3 → insufficient_data');
  console.log('G2 PASS weekly below min → insufficient_data');
}

function testSparsity_monthlyMinDays(): void {
  // Exactly 7 days reviewed → should compute trend, not return insufficient
  const reviews = makeMonth(Array.from({ length: 7 }, () => ({ completedCount: 5, totalCount: 7 })));
  const mi = computeMonthlyIntelligence(reviews, TODAY);
  assert(mi.executionTrend !== 'insufficient_data', `G3 exactly 7 → not insufficient: ${mi.executionTrend}`);
  console.log('G3 PASS monthly min days boundary: 7 → sufficient');
}

function testSparsity_monthlyBelowMin(): void {
  const reviews = makeMonth(Array.from({ length: 6 }, () => ({ completedCount: 5, totalCount: 7 })));
  const mi = computeMonthlyIntelligence(reviews, TODAY);
  assert(mi.executionTrend === 'insufficient_data', 'G4 below 7 → insufficient_data');
  console.log('G4 PASS monthly below min → insufficient_data');
}

function testSparsity_recsEmpty_whenInsufficient(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'insufficient_data' });
  const mi = makeMonthlyIntelligence({});
  const recs = buildStrategicRecommendations(wi, mi);
  assert(recs.length === 0, 'G5 no recs when insufficient_data');
  console.log('G5 PASS recommendations empty when insufficient_data');
}

function testSparsity_summaryEmpty_zeroReviews(): void {
  const wi = makeWeeklyIntelligence({ weekCharacter: 'insufficient_data', reviewedDays: 0 });
  const mi = makeMonthlyIntelligence({});
  const recs: any[] = [];
  const summary = buildStrategicCoachSummary(wi, mi, recs);
  assert(summary === '', 'G6 empty summary when 0 reviews');
  console.log('G6 PASS coach summary empty when 0 reviews');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function runAll(): void {
  const tests = [
    // A
    testWeekly_strong,
    testWeekly_overloaded,
    testWeekly_rebuilding,
    testWeekly_volatile,
    testWeekly_stable,
    testWeekly_insufficient_data,
    testWeekly_momentumTrend_improving,
    testWeekly_momentumTrend_declining,
    testWeekly_recoveryDependence_occasional,
    testWeekly_totalFocusMinutes,
    testWeekly_reviewConsistency,
    testWeekly_systemTakeaways,
    testWeekly_noReviews,
    // B
    testMonthly_improving_progressing,
    testMonthly_declining,
    testMonthly_oscillating,
    testMonthly_insufficient_data,
    testMonthly_repeatedBreakdownPatterns,
    testMonthly_routineStability_stable,
    testMonthly_noReviews,
    // C
    testMomentum_building,
    testMomentum_maintaining,
    testMomentum_recovering,
    testMomentum_stalled,
    testMomentum_insufficient,
    testMomentum_volatileImproving_recovering,
    // D
    testDominantPattern_mostFrequent,
    testDominantPattern_empty,
    testDominantPattern_single,
    // E
    testRecs_insufficientData,
    testRecs_overloadedWeek,
    testRecs_avoidancePattern,
    testRecs_frequentRecovery,
    testRecs_lowReviewConsistency,
    testRecs_strongWeek_maintainSystem,
    testRecs_cappedAt3,
    testRecs_priorityOrder,
    testRecs_signalTracing,
    // F
    testCoachSummary_noData,
    testCoachSummary_partialData,
    testCoachSummary_fullData,
    testCoachSummary_topRecommendation,
    testCoachSummary_noDrift_noSection,
    // G
    testSparsity_weeklyMinDays,
    testSparsity_weeklyBelowMin,
    testSparsity_monthlyMinDays,
    testSparsity_monthlyBelowMin,
    testSparsity_recsEmpty_whenInsufficient,
    testSparsity_summaryEmpty_zeroReviews,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (err) {
      console.error(`FAIL ${test.name}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\n═══ Batch 19 Results: ${passed} passed, ${failed} failed / ${tests.length} total ═══`);
  if (failed > 0) process.exit(1);
}

runAll();
