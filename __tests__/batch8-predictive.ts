/**
 * __tests__/batch8-predictive.ts
 *
 * Node-runnable tests for predictiveEngine.ts and decisionExplanationEngine.ts.
 * Run: npx tsx __tests__/batch8-predictive.ts
 *
 * No React, no store, no Supabase, no AsyncStorage.
 */

export {};

import {
  predictDrift,
  rankRecoveryModes,
} from '../src/ai/predictiveEngine';
import type { DriftPrediction } from '../src/ai/predictiveEngine';
import {
  explainPlanIntensity,
  explainTaskSelection,
  explainRecoveryRanking,
  explainPrediction,
  buildPredictionContext,
} from '../src/ai/decisionExplanationEngine';
import type {
  DailyReview,
  AdaptationHints,
  ControlDailyPlan,
  PlanItem,
  RecoveryMode,
} from '../src/types';
import type { RecoveryStats } from '../src/ai/metricsEngine';

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

// ─── Mock builders ────────────────────────────────────────────────────────────

function makeItem(
  id: string,
  type: 'goal' | 'skill' | 'break',
  startTime: string,
  endTime: string,
  completed = false,
  isCritical = false,
): PlanItem {
  return {
    id,
    title: `Task ${id}`,
    type,
    startTime,
    endTime,
    completed,
    isCritical,
    source: 'goal' as any,
  };
}

function makePlan(items: PlanItem[]): ControlDailyPlan {
  return {
    plan: {
      id: 'plan-1',
      type: 'daily',
      dateRange: { start: '2026-03-29', end: '2026-03-29' },
      items,
      generatedAt: new Date().toISOString(),
      source: 'local',
    },
    nextBestAction: null,
    nudgeSchedule: [],
    generatedAt: new Date().toISOString(),
    date: '2026-03-29',
  };
}

function makeHints(overrides: Partial<AdaptationHints> = {}): AdaptationHints {
  return {
    capMultiplier:          0.8,
    firstSessionCapMins:    null,
    preferHighEnergyFirst:  false,
    preferredRecoveryModes: [],
    rationale:              '',
    reviewCount:            5,
    ...overrides,
  };
}

function makeReview(
  date: string,
  opts: {
    takeaway?: string;
    driftTypes?: string[];
    recoveryUsed?: boolean;
  } = {},
): DailyReview {
  return {
    date,
    completedCount: 3,
    totalCount:     5,
    focusMinutes:   60,
    criticalDone:   false,
    driftTypes:     (opts.driftTypes ?? []) as any,
    recoveryUsed:   opts.recoveryUsed ?? false,
    savedAt:        new Date().toISOString(),
    systemTakeaway: opts.takeaway,
  };
}

function makeRecoveryStats(
  rankedModes: { mode: RecoveryMode; score: number; uses: number }[] = [],
): RecoveryStats {
  const recoveryDays = rankedModes.reduce((s, m) => s + m.uses, 0);
  const effective    = rankedModes.reduce((s, m) => s + m.score * m.uses, 0);
  return {
    usageRate:        0.4,
    effectivenessRate: recoveryDays > 0 ? effective / recoveryDays : 0,
    rankedModes,
  };
}

// ─── Suite 1: predictDrift — no reviews → empty ───────────────────────────────

console.log('\nSuite 1: predictDrift — no reviews');

{
  const plan = makePlan([makeItem('a', 'goal', '09:00', '10:00')]);
  const preds = predictDrift(plan, [], makeHints(), 9 * 60);
  assert('no reviews → no predictions',  preds.length === 0);
}

// ─── Suite 2: predictDrift — likely_late_start ────────────────────────────────

console.log('\nSuite 2: likely_late_start');

{
  const reviews = [
    makeReview('2026-03-24', { takeaway: 'avoidance_pattern' }),
    makeReview('2026-03-25', { takeaway: 'avoidance_pattern' }),
    makeReview('2026-03-26', {}),
    makeReview('2026-03-27', {}),
    makeReview('2026-03-28', {}),
  ];
  const plan = makePlan([makeItem('a', 'goal', '09:00', '10:00')]);
  // nowMins = 08:30 (before first task start) — time signal absent
  const preds = predictDrift(plan, reviews, makeHints(), 8 * 60 + 30);
  const lateStart = preds.find((p) => p.riskType === 'likely_late_start');

  assert('2x avoidance_pattern → late_start predicted',   !!lateStart);
  assert('confidence is medium (2 signals, no time)',      lateStart?.confidence === 'medium');
  assert('rationale mentions avoidance',                   lateStart?.rationale.includes('voidance') ?? false);
}

{
  // 3x avoidance reviews → high confidence
  const reviews = Array.from({ length: 5 }, (_, i) =>
    makeReview(`2026-03-${24+i}`, { takeaway: i < 3 ? 'avoidance_pattern' : undefined }),
  );
  const plan = makePlan([makeItem('a', 'goal', '09:00', '10:00')]);
  const preds = predictDrift(plan, reviews, makeHints(), 8 * 60);
  const lateStart = preds.find((p) => p.riskType === 'likely_late_start');
  assert('3x avoidance → high confidence',  lateStart?.confidence === 'high');
}

{
  // Time signal only (no review history matching) — nowMins past first task + 15
  const reviews = [
    makeReview('2026-03-28', { takeaway: 'clean_day' }),
  ];
  const plan = makePlan([makeItem('a', 'goal', '09:00', '10:00')]);
  // 09:30 — 30 min past first task's start
  const preds = predictDrift(plan, reviews, makeHints(), 9 * 60 + 30);
  const lateStart = preds.find((p) => p.riskType === 'likely_late_start');
  assert('only time signal → low confidence',  lateStart?.confidence === 'low');
}

// ─── Suite 3: predictDrift — likely_avoidance ─────────────────────────────────

console.log('\nSuite 3: likely_avoidance');

{
  const reviews = [
    makeReview('2026-03-25', { takeaway: 'avoidance_pattern' }),
    makeReview('2026-03-26', { takeaway: 'avoidance_pattern' }),
    makeReview('2026-03-27', {}),
  ];
  // First task is 80 min (> 75 min threshold)
  const plan = makePlan([makeItem('big', 'goal', '09:00', '10:20')]);
  const preds = predictDrift(plan, reviews, makeHints(), 8 * 60);
  const avoidance = preds.find((p) => p.riskType === 'likely_avoidance');

  assert('2x avoidance + long first task → avoidance predicted', !!avoidance);
  assert('confidence = high (2 signals + long task)',              avoidance?.confidence === 'high');
  assert('actionHint mentions 25-min or break',
    (avoidance?.actionHint.includes('25') || avoidance?.actionHint.includes('break') || avoidance?.actionHint.includes('Break')) ?? false);
}

{
  // Long first task alone (no review history)
  const reviews = [makeReview('2026-03-28', { takeaway: 'clean_day' })];
  const plan = makePlan([makeItem('big', 'goal', '09:00', '10:20')]);
  const preds = predictDrift(plan, reviews, makeHints(), 8 * 60);
  const avoidance = preds.find((p) => p.riskType === 'likely_avoidance');
  assert('long first task alone → medium confidence', avoidance?.confidence === 'medium');
}

{
  // Short first task, no avoidance reviews → no prediction
  const reviews = [makeReview('2026-03-28', { takeaway: 'solid_day' })];
  const plan = makePlan([makeItem('short', 'goal', '09:00', '09:30')]);
  const preds = predictDrift(plan, reviews, makeHints(), 8 * 60);
  const avoidance = preds.find((p) => p.riskType === 'likely_avoidance');
  assert('no signals → no avoidance prediction', avoidance === undefined);
}

// ─── Suite 4: predictDrift — likely_overload ─────────────────────────────────

console.log('\nSuite 4: likely_overload');

{
  const reviews = [
    makeReview('2026-03-27', { takeaway: 'overload_pattern' }),
    makeReview('2026-03-28', { takeaway: 'overload_pattern' }),
  ];
  const plan = makePlan([
    makeItem('a', 'goal', '08:00', '09:00'),
    makeItem('b', 'goal', '09:00', '10:00'),
  ]);
  const preds = predictDrift(plan, reviews, makeHints(), 8 * 60);
  const overload = preds.find((p) => p.riskType === 'likely_overload');
  assert('2x overload_pattern → high confidence',  overload?.confidence === 'high');
  assert('overload predicted',                      !!overload);
}

{
  // Dense plan (6 tasks, cap 0.8) alone → at least low/medium overload
  const items = Array.from({ length: 6 }, (_, i) =>
    makeItem(`t${i}`, 'goal', `0${8+i}:00`, `0${9+i}:00`),
  );
  const plan = makePlan(items);
  const reviews = [makeReview('2026-03-28', {})];
  const preds = predictDrift(plan, reviews, makeHints({ capMultiplier: 0.8 }), 8 * 60);
  const overload = preds.find((p) => p.riskType === 'likely_overload');
  assert('6 tasks, cap 0.8, single review → overload predicted', !!overload);
  assert('confidence = low (no overload history)',                 overload?.confidence === 'low');
}

{
  // No overload signals — should not predict
  const reviews = [makeReview('2026-03-28', { takeaway: 'clean_day' })];
  const plan = makePlan([makeItem('a', 'goal', '09:00', '10:00')]);
  const preds = predictDrift(plan, reviews, makeHints(), 8 * 60);
  const overload = preds.find((p) => p.riskType === 'likely_overload');
  assert('no signals → no overload prediction', overload === undefined);
}

// ─── Suite 5: predictDrift — likely_distraction ───────────────────────────────

console.log('\nSuite 5: likely_distraction');

{
  const reviews = [
    makeReview('2026-03-25', { takeaway: 'distraction_heavy' }),
    makeReview('2026-03-26', { driftTypes: ['distraction'] }),
    makeReview('2026-03-27', { driftTypes: ['distraction'] }),
    makeReview('2026-03-28', {}),
    makeReview('2026-03-29', {}),
  ];
  const plan = makePlan([makeItem('a', 'goal', '09:00', '10:00')]);
  const preds = predictDrift(plan, reviews, makeHints(), 8 * 60);
  const distraction = preds.find((p) => p.riskType === 'likely_distraction');

  assert('3 distraction signals → distraction predicted', !!distraction);
  assert('confidence = medium (3 signals)',                distraction?.confidence === 'medium');
}

{
  // 1 signal only → low
  const reviews = [makeReview('2026-03-28', { takeaway: 'distraction_heavy' })];
  const plan = makePlan([makeItem('a', 'goal', '09:00', '10:00')]);
  const preds = predictDrift(plan, reviews, makeHints(), 8 * 60);
  const distraction = preds.find((p) => p.riskType === 'likely_distraction');
  assert('1 distraction signal → low confidence', distraction?.confidence === 'low');
}

// ─── Suite 6: predictDrift — likely_fragmentation ────────────────────────────

console.log('\nSuite 6: likely_fragmentation');

{
  const reviews = [
    makeReview('2026-03-25', { recoveryUsed: true }),
    makeReview('2026-03-26', { recoveryUsed: true }),
    makeReview('2026-03-27', { recoveryUsed: true }),
    makeReview('2026-03-28', {}),
    makeReview('2026-03-29', {}),
  ];
  const plan = makePlan([makeItem('a', 'goal', '09:00', '10:00')]);
  const preds = predictDrift(plan, reviews, makeHints(), 8 * 60);
  const frag = preds.find((p) => p.riskType === 'likely_fragmentation');

  assert('3/5 recovery days → fragmentation predicted',  !!frag);
  assert('confidence = medium (3 recovery days)',          frag?.confidence === 'medium');
}

{
  // Many short tasks alone
  const items = Array.from({ length: 6 }, (_, i) =>
    makeItem(`s${i}`, 'goal', `0${9+i}:00`, `0${9+i}:25`),  // 25-min items
  );
  const reviews = [makeReview('2026-03-28', {})];
  const plan = makePlan(items);
  const preds = predictDrift(plan, reviews, makeHints(), 8 * 60);
  const frag = preds.find((p) => p.riskType === 'likely_fragmentation');
  assert('mostly short tasks, single review → low confidence fragmentation', frag?.confidence === 'low');
}

// ─── Suite 7: predictDrift — sort order ──────────────────────────────────────

console.log('\nSuite 7: predictDrift — confidence sort order');

{
  const reviews = [
    makeReview('2026-03-25', { takeaway: 'overload_pattern' }),
    makeReview('2026-03-26', { takeaway: 'overload_pattern' }),  // → high overload
    makeReview('2026-03-27', { takeaway: 'distraction_heavy' }), // → low distraction
    makeReview('2026-03-28', {}),
    makeReview('2026-03-29', {}),
  ];
  const plan = makePlan([makeItem('a', 'goal', '09:00', '10:00')]);
  const preds = predictDrift(plan, reviews, makeHints(), 8 * 60);

  assert('sorted: high confidence first',
    preds.length < 2 || (
      ['high', 'medium', 'low'].indexOf(preds[0].confidence) <=
      ['high', 'medium', 'low'].indexOf(preds[1].confidence)
    ),
  );
}

// ─── Suite 8: rankRecoveryModes ───────────────────────────────────────────────

console.log('\nSuite 8: rankRecoveryModes');

{
  // resume_now has best effectiveness → should be first when no prediction
  const modes: RecoveryMode[] = ['save_day', 'resume_now', 'critical_only', 'compress_day'];
  const stats = makeRecoveryStats([
    { mode: 'resume_now',    score: 0.9, uses: 5 },
    { mode: 'critical_only', score: 0.4, uses: 3 },
    { mode: 'save_day',      score: 0.2, uses: 2 },
    { mode: 'compress_day',  score: 0.3, uses: 2 },
  ]);
  const ranked = rankRecoveryModes(modes, stats, null);
  assert('best effectiveness mode ranks first (no prediction)',  ranked[0] === 'resume_now');
}

{
  // likely_overload prediction boosts save_day and compress_day
  const modes: RecoveryMode[] = ['resume_now', 'save_day', 'critical_only', 'compress_day'];
  const stats = makeRecoveryStats([
    { mode: 'resume_now',    score: 0.9, uses: 5 },
    { mode: 'save_day',      score: 0.2, uses: 2 },
    { mode: 'critical_only', score: 0.5, uses: 3 },
    { mode: 'compress_day',  score: 0.3, uses: 2 },
  ]);
  const overloadPred: DriftPrediction = {
    riskType: 'likely_overload', confidence: 'high',
    headline: 'Overload', rationale: 'test', actionHint: 'test',
  };
  const ranked = rankRecoveryModes(modes, stats, overloadPred);
  // save_day: 0.2 + 0.35 = 0.55; compress_day: 0.3 + 0.35 = 0.65 > resume_now 0.9 — no, 0.9 still wins
  // Actually: resume_now = 0.9 (no boost), save_day = 0.2+0.35=0.55, compress_day=0.3+0.35=0.65
  // So resume_now is still first. Let me reconsider — with overload, save_day+compress_day get boost
  // save_day: 0.55, compress_day: 0.65, resume_now: 0.9 → resume_now still wins (0.9 > 0.65)
  // But with very low effectiveness for resume_now:
  const modesB: RecoveryMode[] = ['resume_now', 'save_day', 'compress_day'];
  const statsB = makeRecoveryStats([
    { mode: 'resume_now',   score: 0.3, uses: 5 },
    { mode: 'save_day',     score: 0.2, uses: 2 },
    { mode: 'compress_day', score: 0.2, uses: 2 },
  ]);
  const rankedB = rankRecoveryModes(modesB, statsB, overloadPred);
  // resume_now: 0.3, save_day: 0.2+0.35=0.55, compress_day: 0.2+0.35=0.55
  assert('overload prediction boosts save_day/compress_day over low resume_now',
    rankedB[0] === 'save_day' || rankedB[0] === 'compress_day');
}

{
  // likely_avoidance boosts critical_only
  const modes: RecoveryMode[] = ['resume_now', 'critical_only', 'save_day'];
  const stats = makeRecoveryStats([
    { mode: 'resume_now',    score: 0.4, uses: 3 },
    { mode: 'critical_only', score: 0.3, uses: 2 },
    { mode: 'save_day',      score: 0.2, uses: 2 },
  ]);
  const avoidPred: DriftPrediction = {
    riskType: 'likely_avoidance', confidence: 'medium',
    headline: 'Avoidance', rationale: 'test', actionHint: 'test',
  };
  const ranked = rankRecoveryModes(modes, stats, avoidPred);
  // critical_only: 0.3 + 0.30 = 0.60; resume_now: 0.4; save_day: 0.2
  assert('avoidance prediction ranks critical_only first',  ranked[0] === 'critical_only');
}

{
  // No stats (uses < 2) → base = 0.5
  const modes: RecoveryMode[] = ['resume_now', 'save_day'];
  const stats = makeRecoveryStats([
    { mode: 'resume_now', score: 0.9, uses: 1 }, // < 2 uses, not trusted
  ]);
  const ranked = rankRecoveryModes(modes, stats, null);
  // Both start at 0.5, no boost — order preserved by original sort stability
  assert('untrusted data → both score 0.5, modes returned',  ranked.length === 2);
}

// ─── Suite 9: explainPlanIntensity ────────────────────────────────────────────

console.log('\nSuite 9: explainPlanIntensity');

{
  // Reduced capacity
  const hints = makeHints({ capMultiplier: 0.60, reviewCount: 4, rationale: 'Overload 2x.' });
  const expl = explainPlanIntensity(hints, 3);
  assert('reduced cap → lighter plan decision',    expl.decision.includes('Lighter') || expl.decision.includes('lighter'));
  assert('signal mentions cap %',                   expl.signal.includes('60'));
  assert('confidence = high (4 reviews)',            expl.confidence === 'high');
}

{
  // Dense plan, full capacity
  const hints = makeHints({ capMultiplier: 0.80, reviewCount: 5 });
  const expl = explainPlanIntensity(hints, 7);
  assert('dense plan, full cap → full-capacity decision',  expl.decision.includes('Full') || expl.decision.includes('full'));
  assert('confidence = medium',                             expl.confidence === 'medium');
}

{
  // No reviews yet
  const hints = makeHints({ capMultiplier: 0.80, reviewCount: 0 });
  const expl = explainPlanIntensity(hints, 3);
  assert('no reviews → standard plan',       expl.decision.includes('Standard') || expl.decision.includes('standard'));
  assert('mentions not enough history',       expl.reason.includes('Not enough') || expl.reason.includes('not enough'));
}

// ─── Suite 10: explainTaskSelection ──────────────────────────────────────────

console.log('\nSuite 10: explainTaskSelection');

{
  const critItem = makeItem('c1', 'goal', '09:00', '10:00', false, true);
  const hints    = makeHints();
  const expl     = explainTaskSelection(critItem, hints, true);
  assert('critical task → critical reason',  expl.reason.includes('critical'));
  assert('signal = isCritical = true',       expl.signal.includes('isCritical'));
  assert('confidence = high',                expl.confidence === 'high');
}

{
  const item  = makeItem('t1', 'goal', '09:00', '10:00');
  const hints = makeHints({ preferHighEnergyFirst: true });
  const expl  = explainTaskSelection(item, hints, true);
  assert('first item + preferHighEnergy → energy reason',  expl.reason.includes('energy') || expl.reason.includes('High-energy'));
}

{
  const item  = makeItem('t2', 'goal', '11:00', '12:00');
  const hints = makeHints();
  const expl  = explainTaskSelection(item, hints, false);
  assert('regular item → schedule reason',   expl.reason.includes('schedule') || expl.reason.includes('start time'));
  assert('signal mentions start time',       expl.signal.includes('11:00'));
  assert('confidence = low',                 expl.confidence === 'low');
}

// ─── Suite 11: explainRecoveryRanking ────────────────────────────────────────

console.log('\nSuite 11: explainRecoveryRanking');

{
  // Solid effectiveness history
  const stats = makeRecoveryStats([
    { mode: 'resume_now', score: 0.85, uses: 6 },
  ]);
  const expl = explainRecoveryRanking('resume_now', stats, null);
  assert('solid history → effectiveness-based reason',  expl.reason.includes('85') || expl.reason.includes('%'));
  assert('confidence = high (6 uses)',                   expl.confidence === 'high');
}

{
  // Thin data (2 uses)
  const stats = makeRecoveryStats([
    { mode: 'compress_day', score: 0.5, uses: 2 },
  ]);
  const expl = explainRecoveryRanking('compress_day', stats, null);
  assert('thin data → limited data note',  expl.reason.includes('limited') || expl.reason.includes('uses'));
  assert('confidence = low',               expl.confidence === 'low');
}

{
  // No history, prediction drives it
  const stats = makeRecoveryStats([]);
  const pred: DriftPrediction = {
    riskType: 'likely_overload', confidence: 'high',
    headline: 'High overload risk', rationale: 'test', actionHint: 'test',
  };
  const expl = explainRecoveryRanking('save_day', stats, pred);
  assert('no history + prediction → prediction-based reason',
    expl.reason.includes('predicted') || expl.reason.includes('risk'));
  assert('confidence = medium',  expl.confidence === 'medium');
}

// ─── Suite 12: buildPredictionContext ─────────────────────────────────────────

console.log('\nSuite 12: buildPredictionContext');

{
  assert('empty → no risk message',
    buildPredictionContext([]).includes('No significant'));

  const preds: DriftPrediction[] = [
    { riskType: 'likely_overload', confidence: 'high', headline: 'Overload', rationale: 'test', actionHint: 'test' },
    { riskType: 'likely_avoidance', confidence: 'medium', headline: 'Avoidance', rationale: 'test', actionHint: 'test' },
    { riskType: 'likely_distraction', confidence: 'low', headline: 'Distraction', rationale: 'test', actionHint: 'test' },
  ];
  const ctx = buildPredictionContext(preds);
  assert('shows top 2 predictions',          ctx.includes('likely_overload') && ctx.includes('likely_avoidance'));
  assert('does not show 3rd prediction',     !ctx.includes('likely_distraction'));
  assert('includes confidence labels',        ctx.includes('high') && ctx.includes('medium'));
}

// ─── Suite 13: explainPrediction ─────────────────────────────────────────────

console.log('\nSuite 13: explainPrediction');

{
  const pred: DriftPrediction = {
    riskType: 'likely_overload', confidence: 'high',
    headline: 'High overload risk', rationale: 'Pattern found', actionHint: 'Stay focused.',
  };
  const line = explainPrediction(pred);
  assert('includes headline',   line.includes('High overload risk'));
  assert('includes rationale',  line.includes('Pattern found'));
  assert('includes action hint', line.includes('Stay focused'));
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
