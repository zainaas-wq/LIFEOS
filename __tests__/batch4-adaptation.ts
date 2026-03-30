/**
 * __tests__/batch4-adaptation.ts
 *
 * Node-runnable tests for the adaptation engine.
 * Run: npx tsx __tests__/batch4-adaptation.ts
 *
 * Tests computeAdaptationHints() logic in isolation.
 * No React, no store, no network.
 */

export {};

import { computeAdaptationHints } from '../src/ai/adaptationEngine';
import type { DailyReview, RecoveryMode } from '../src/types';

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

function makeReview(overrides: Partial<DailyReview> & { date: string }): DailyReview {
  return {
    date:           overrides.date,
    completedCount: overrides.completedCount ?? 4,
    totalCount:     overrides.totalCount     ?? 5,
    focusMinutes:   overrides.focusMinutes   ?? 120,
    criticalDone:   overrides.criticalDone   ?? false,
    driftTypes:     overrides.driftTypes     ?? [],
    recoveryUsed:   overrides.recoveryUsed   ?? false,
    savedAt:        new Date().toISOString(),
    systemTakeaway: overrides.systemTakeaway ?? 'mixed_day',
    recoveryMode:   overrides.recoveryMode,
    completedCount: overrides.completedCount ?? 4,
    totalCount:     overrides.totalCount     ?? 5,
    alignmentScore: overrides.alignmentScore,
  };
}

// ─── Suite 1: No reviews → default hints ─────────────────────────────────────

console.log('\nSuite 1: No reviews');

{
  const hints = computeAdaptationHints([]);
  assert('capMultiplier = 0.8 (default)',     hints.capMultiplier === 0.8);
  assert('firstSessionCapMins = null',         hints.firstSessionCapMins === null);
  assert('preferHighEnergyFirst = false',      hints.preferHighEnergyFirst === false);
  assert('preferredRecoveryModes = []',        hints.preferredRecoveryModes.length === 0);
  assert('reviewCount = 0',                    hints.reviewCount === 0);
  assert('rationale includes "no adaptation"', hints.rationale.includes('no adaptation'));
}

// ─── Suite 2: overload_pattern ≥2 of last 3 → heavy reduction ────────────────

console.log('\nSuite 2: overload_pattern (2 of 3)');

{
  const reviews = [
    makeReview({ date: '2026-03-27', systemTakeaway: 'overload_pattern' }),
    makeReview({ date: '2026-03-28', systemTakeaway: 'overload_pattern' }),
    makeReview({ date: '2026-03-26', systemTakeaway: 'mixed_day' }),
  ];
  const hints = computeAdaptationHints(reviews);
  assert('capMultiplier = 0.60',              hints.capMultiplier === 0.60);
  assert('firstSessionCapMins = null',         hints.firstSessionCapMins === null);
  assert('preferHighEnergyFirst = false',      hints.preferHighEnergyFirst === false);
  assert('rationale mentions overload_pattern', hints.rationale.includes('overload_pattern'));
  assert('reviewCount = 3',                    hints.reviewCount === 3);
}

// ─── Suite 3: overload_pattern ×1 → light reduction ─────────────────────────

console.log('\nSuite 3: overload_pattern (1 of 3)');

{
  const reviews = [
    makeReview({ date: '2026-03-28', systemTakeaway: 'overload_pattern' }),
    makeReview({ date: '2026-03-27', systemTakeaway: 'solid_day' }),
    makeReview({ date: '2026-03-26', systemTakeaway: 'clean_day' }),
  ];
  const hints = computeAdaptationHints(reviews);
  assert('capMultiplier = 0.70',  hints.capMultiplier === 0.70);
  assert('no firstSessionCap',    hints.firstSessionCapMins === null);
}

// ─── Suite 4: avoidance_pattern ≥2 of last 3 → first session cap 25 ─────────

console.log('\nSuite 4: avoidance_pattern (2 of 3)');

{
  const reviews = [
    makeReview({ date: '2026-03-28', systemTakeaway: 'avoidance_pattern' }),
    makeReview({ date: '2026-03-27', systemTakeaway: 'avoidance_pattern' }),
    makeReview({ date: '2026-03-26', systemTakeaway: 'mixed_day' }),
  ];
  const hints = computeAdaptationHints(reviews);
  assert('firstSessionCapMins = 25',     hints.firstSessionCapMins === 25);
  assert('capMultiplier = 0.8 (no overload)', hints.capMultiplier === 0.80);
  assert('rationale mentions avoidance', hints.rationale.includes('avoidance'));
}

// ─── Suite 5: avoidance ×1 + low_execution ×1 → first session cap 30 ────────

console.log('\nSuite 5: avoidance (1) + low_execution (1)');

{
  const reviews = [
    makeReview({ date: '2026-03-28', systemTakeaway: 'avoidance_pattern' }),
    makeReview({ date: '2026-03-27', systemTakeaway: 'low_execution' }),
    makeReview({ date: '2026-03-26', systemTakeaway: 'clean_day' }),
  ];
  const hints = computeAdaptationHints(reviews);
  assert('firstSessionCapMins = 30',      hints.firstSessionCapMins === 30);
  assert('capMultiplier = 0.80 (no overload)', hints.capMultiplier === 0.80);
}

// ─── Suite 6: low_execution ≥2 → cap 0.65 ────────────────────────────────────

console.log('\nSuite 6: low_execution (2 of 3)');

{
  const reviews = [
    makeReview({ date: '2026-03-28', systemTakeaway: 'low_execution' }),
    makeReview({ date: '2026-03-27', systemTakeaway: 'low_execution' }),
    makeReview({ date: '2026-03-26', systemTakeaway: 'mixed_day' }),
  ];
  const hints = computeAdaptationHints(reviews);
  assert('capMultiplier = 0.65',     hints.capMultiplier === 0.65);
  assert('no firstSessionCap',       hints.firstSessionCapMins === null);
}

// ─── Suite 7: distraction_heavy ≥2 → preferHighEnergyFirst ──────────────────

console.log('\nSuite 7: distraction_heavy (2 of 3)');

{
  const reviews = [
    makeReview({ date: '2026-03-28', systemTakeaway: 'distraction_heavy' }),
    makeReview({ date: '2026-03-27', systemTakeaway: 'distraction_heavy' }),
    makeReview({ date: '2026-03-26', systemTakeaway: 'solid_day' }),
  ];
  const hints = computeAdaptationHints(reviews);
  assert('preferHighEnergyFirst = true',      hints.preferHighEnergyFirst === true);
  assert('capMultiplier unchanged = 0.80',    hints.capMultiplier === 0.80);
  assert('rationale mentions distraction',    hints.rationale.includes('distraction'));
}

// ─── Suite 8: distraction ×1 → no preferHighEnergyFirst ─────────────────────

console.log('\nSuite 8: distraction_heavy (1 of 3) — no trigger');

{
  const reviews = [
    makeReview({ date: '2026-03-28', systemTakeaway: 'distraction_heavy' }),
    makeReview({ date: '2026-03-27', systemTakeaway: 'clean_day' }),
    makeReview({ date: '2026-03-26', systemTakeaway: 'solid_day' }),
  ];
  const hints = computeAdaptationHints(reviews);
  assert('preferHighEnergyFirst = false (threshold not met)', hints.preferHighEnergyFirst === false);
}

// ─── Suite 9: Recovery ranking — effective mode floats to top ────────────────

console.log('\nSuite 9: Recovery ranking');

{
  const reviews = [
    makeReview({
      date: '2026-03-28',
      recoveryUsed: true,
      recoveryMode: 'resume_now',
      completedCount: 4,
      totalCount: 5,        // rate 0.8 → effective
    }),
    makeReview({
      date: '2026-03-27',
      recoveryUsed: true,
      recoveryMode: 'save_day',
      completedCount: 1,
      totalCount: 5,        // rate 0.2 → not effective
    }),
    makeReview({
      date: '2026-03-26',
      recoveryUsed: true,
      recoveryMode: 'resume_now',
      completedCount: 3,
      totalCount: 5,        // rate 0.6 → effective
    }),
  ];
  const hints = computeAdaptationHints(reviews);
  const modes = hints.preferredRecoveryModes;
  assert('preferredRecoveryModes not empty',     modes.length > 0);
  assert('resume_now ranked first (2/2 = 100%)', modes[0] === 'resume_now');
  assert('save_day ranked below (0/1 = 0%)',     modes.indexOf('save_day') > modes.indexOf('resume_now'));
}

// ─── Suite 10: Mode never used → excluded from ranking ───────────────────────

console.log('\nSuite 10: Unused modes excluded from ranking');

{
  const reviews = [
    makeReview({ date: '2026-03-28', recoveryUsed: true, recoveryMode: 'critical_only', completedCount: 3, totalCount: 5 }),
  ];
  const hints = computeAdaptationHints(reviews);
  assert('only used modes ranked',  hints.preferredRecoveryModes.length === 1);
  assert('critical_only in list',   hints.preferredRecoveryModes.includes('critical_only'));
  assert('compress_day excluded',   !hints.preferredRecoveryModes.includes('compress_day'));
}

// ─── Suite 11: capMultiplier clamped to [0.5, 0.8] ───────────────────────────

console.log('\nSuite 11: capMultiplier safety clamping');

{
  // Even with all bad patterns, should never drop below MIN_CAP
  const reviews = [
    makeReview({ date: '2026-03-28', systemTakeaway: 'overload_pattern' }),
    makeReview({ date: '2026-03-27', systemTakeaway: 'overload_pattern' }),
    makeReview({ date: '2026-03-26', systemTakeaway: 'overload_pattern' }),
  ];
  const hints = computeAdaptationHints(reviews);
  assert('capMultiplier >= 0.5',   hints.capMultiplier >= 0.5);
  assert('capMultiplier <= 0.8',   hints.capMultiplier <= 0.8);
}

// ─── Suite 12: only most recent 3 reviews examined for patterns ───────────────

console.log('\nSuite 12: Pattern detection uses most recent 3 only');

{
  // Old reviews (4+ days ago) should not trigger pattern adaptation
  const reviews = [
    makeReview({ date: '2026-03-28', systemTakeaway: 'clean_day' }),   // recent
    makeReview({ date: '2026-03-27', systemTakeaway: 'clean_day' }),   // recent
    makeReview({ date: '2026-03-26', systemTakeaway: 'clean_day' }),   // recent (3rd)
    makeReview({ date: '2026-03-25', systemTakeaway: 'overload_pattern' }), // 4th — ignored
    makeReview({ date: '2026-03-24', systemTakeaway: 'overload_pattern' }), // 5th — ignored
  ];
  const hints = computeAdaptationHints(reviews);
  assert('capMultiplier = 0.80 (old overloads ignored)', hints.capMultiplier === 0.80);
}

// ─── Suite 13: combined patterns → multiple hints active simultaneously ───────

console.log('\nSuite 13: Combined patterns');

{
  const reviews = [
    makeReview({ date: '2026-03-28', systemTakeaway: 'avoidance_pattern' }),
    makeReview({ date: '2026-03-27', systemTakeaway: 'distraction_heavy' }),
    makeReview({ date: '2026-03-26', systemTakeaway: 'avoidance_pattern' }),
  ];
  const hints = computeAdaptationHints(reviews);
  // avoidance ×2 → firstSessionCap=25
  // distraction ×1 → no preferHighEnergyFirst (below threshold)
  assert('firstSessionCapMins = 25',         hints.firstSessionCapMins === 25);
  assert('preferHighEnergyFirst = false',    hints.preferHighEnergyFirst === false);
  assert('capMultiplier = 0.80',             hints.capMultiplier === 0.80);
}

// ─── Suite 14: clean_day streak → no adaptation, rationale clean ─────────────

console.log('\nSuite 14: Clean day streak → no adaptation');

{
  const reviews = [
    makeReview({ date: '2026-03-28', systemTakeaway: 'clean_day' }),
    makeReview({ date: '2026-03-27', systemTakeaway: 'clean_day' }),
    makeReview({ date: '2026-03-26', systemTakeaway: 'recovered_strong' }),
  ];
  const hints = computeAdaptationHints(reviews);
  assert('capMultiplier = 0.80 (no reduction needed)', hints.capMultiplier === 0.80);
  assert('firstSessionCapMins = null',                  hints.firstSessionCapMins === null);
  assert('preferHighEnergyFirst = false',               hints.preferHighEnergyFirst === false);
  assert('rationale = no active adaptation',            hints.rationale === 'no active adaptation');
}

// ─── Suite 15: single review → still adapts (MIN_REVIEWS_TO_ADAPT = 1) ───────

console.log('\nSuite 15: Single review triggers adaptation');

{
  const reviews = [
    makeReview({ date: '2026-03-28', systemTakeaway: 'overload_pattern' }),
  ];
  const hints = computeAdaptationHints(reviews);
  // Only 1 overload → light reduction 0.70
  assert('capMultiplier = 0.70 (single overload)',  hints.capMultiplier === 0.70);
  assert('reviewCount = 1',                          hints.reviewCount === 1);
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
