/**
 * __tests__/batch7-ritual.ts
 *
 * Node-runnable tests for ritualEngine.ts pure functions.
 * Run: npx tsx __tests__/batch7-ritual.ts
 *
 * No React, no store, no Supabase, no AsyncStorage.
 */

export {};

import {
  buildMorningLaunch,
  buildNightShutdown,
  deriveDayIntensity,
  interpretWeeklyReview,
} from '../src/ai/ritualEngine';
import type {
  ControlDailyPlan,
  DailyReview,
  AdaptationHints,
  PlanItem,
} from '../src/types';

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
  type: 'goal' | 'skill' | 'break' | 'event',
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
    capMultiplier: 0.8,
    firstSessionCapMins: null,
    preferHighEnergyFirst: false,
    preferredRecoveryModes: [],
    rationale: '',
    reviewCount: 0,
    ...overrides,
  };
}

function makeReview(date: string, takeaway?: string): DailyReview {
  return {
    date,
    completedCount: 4,
    totalCount: 5,
    focusMinutes: 90,
    criticalDone: false,
    driftTypes: [],
    recoveryUsed: false,
    savedAt: new Date().toISOString(),
    systemTakeaway: takeaway,
  };
}

// ─── Suite 1: deriveDayIntensity ──────────────────────────────────────────────

console.log('\nSuite 1: deriveDayIntensity');

{
  assert('0 tasks → light',                       deriveDayIntensity(0, 0.8) === 'light');
  assert('2 tasks → light',                        deriveDayIntensity(2, 0.8) === 'light');
  assert('3 tasks, default cap → moderate',        deriveDayIntensity(3, 0.8) === 'moderate');
  assert('5 tasks, default cap → moderate',        deriveDayIntensity(5, 0.8) === 'moderate');
  assert('6 tasks, cap 0.75 → heavy',              deriveDayIntensity(6, 0.75) === 'heavy');
  assert('8 tasks, cap 0.8 → heavy',               deriveDayIntensity(8, 0.8)  === 'heavy');
  assert('6 tasks, cap 0.6 → light (overloaded)',  deriveDayIntensity(6, 0.6)  === 'light');
  assert('6 tasks, cap 0.62 → light (threshold)',    deriveDayIntensity(6, 0.62) === 'light');
  assert('6 tasks, cap 0.63, cap<0.75 → moderate',  deriveDayIntensity(6, 0.63) === 'moderate');
  assert('4 tasks, cap 0.74 → moderate',             deriveDayIntensity(4, 0.74) === 'moderate');
}

// ─── Suite 2: buildMorningLaunch — basic ─────────────────────────────────────

console.log('\nSuite 2: buildMorningLaunch — basic');

{
  const items = [
    makeItem('a', 'goal',  '09:00', '10:00'),
    makeItem('b', 'goal',  '10:30', '12:00'),
    makeItem('c', 'break', '12:00', '12:30'),
    makeItem('d', 'skill', '13:00', '14:00'),
  ];
  const plan  = makePlan(items);
  const hints = makeHints({ capMultiplier: 0.8 });
  const data  = buildMorningLaunch(plan, [], hints);

  assert('taskCount = 3 (goal+skill only)',        data.taskCount === 3);
  assert('totalFocusMins = 60+90+60 = 210',        data.totalFocusMins === 210);
  assert('firstAction id = a (earliest)',          data.firstAction?.id === 'a');
  assert('firstAction startTime = 09:00',          data.firstAction?.startTime === '09:00');
  assert('dayIntensity = moderate (3 tasks 0.8)',   data.dayIntensity === 'moderate');
  assert('yesterdayPattern = null (no reviews)',    data.yesterdayPattern === null);
}

// ─── Suite 3: buildMorningLaunch — with reviews ───────────────────────────────

console.log('\nSuite 3: buildMorningLaunch — with reviews');

{
  const items  = [makeItem('x', 'goal', '08:00', '09:30')];
  const plan   = makePlan(items);
  const hints  = makeHints({ capMultiplier: 0.65 });
  const reviews: DailyReview[] = [
    makeReview('2026-03-27', 'solid_day'),
    makeReview('2026-03-28', 'avoidance_pattern'),  // most recent
  ];
  const data = buildMorningLaunch(plan, reviews, hints);

  assert('yesterdayPattern = avoidance_pattern',   data.yesterdayPattern === 'avoidance_pattern');
  assert('dayIntensity = light (1 task ≤ 2 rule)',   data.dayIntensity === 'light');
  assert('totalFocusMins = 90',                    data.totalFocusMins === 90);
}

// ─── Suite 4: buildMorningLaunch — completed items excluded ──────────────────

console.log('\nSuite 4: buildMorningLaunch — completed items excluded');

{
  const items = [
    makeItem('done1', 'goal', '07:00', '08:00', true),  // completed
    makeItem('todo1', 'goal', '09:00', '10:00', false),
    makeItem('todo2', 'skill', '11:00', '12:00', false),
  ];
  const data = buildMorningLaunch(makePlan(items), [], makeHints());

  assert('completed items excluded from taskCount',   data.taskCount === 2);
  assert('firstAction is first uncompleted',          data.firstAction?.id === 'todo1');
  assert('totalFocusMins excludes completed',         data.totalFocusMins === 120);
}

// ─── Suite 5: buildMorningLaunch — intensity edge cases ──────────────────────

console.log('\nSuite 5: buildMorningLaunch — intensity edge cases');

{
  // Heavy: 6 tasks, capMultiplier = 0.8
  const heavyItems = Array.from({ length: 6 }, (_, i) =>
    makeItem(`h${i}`, 'goal', `0${8+i}:00`, `0${9+i}:00`),
  );
  const heavy = buildMorningLaunch(makePlan(heavyItems), [], makeHints({ capMultiplier: 0.8 }));
  assert('6 tasks, cap 0.8 → heavy',  heavy.dayIntensity === 'heavy');

  // Light: overload hints
  const lightItems = Array.from({ length: 4 }, (_, i) =>
    makeItem(`l${i}`, 'goal', `0${9+i}:00`, `1${0+i}:00`),
  );
  const light = buildMorningLaunch(makePlan(lightItems), [], makeHints({ capMultiplier: 0.60 }));
  assert('4 tasks, cap 0.60 → light', light.dayIntensity === 'light');
}

// ─── Suite 6: buildMorningLaunch — empty plan ────────────────────────────────

console.log('\nSuite 6: buildMorningLaunch — empty plan');

{
  const data = buildMorningLaunch(makePlan([]), [], makeHints());
  assert('empty plan → taskCount = 0',      data.taskCount === 0);
  assert('empty plan → firstAction = null', data.firstAction === null);
  assert('empty plan → totalFocusMins = 0', data.totalFocusMins === 0);
  assert('empty plan → intensity = light',  data.dayIntensity === 'light');
}

// ─── Suite 7: buildNightShutdown — basic ─────────────────────────────────────

console.log('\nSuite 7: buildNightShutdown — basic');

{
  const items = [
    makeItem('a', 'goal',  '09:00', '10:00', true),
    makeItem('b', 'goal',  '10:30', '12:00', true),
    makeItem('c', 'skill', '13:00', '14:00', false),
    makeItem('d', 'break', '12:00', '12:30', false),  // not counted
  ];
  const data = buildNightShutdown(makePlan(items), 120);

  assert('completedCount = 2',              data.completedCount === 2);
  assert('totalCount = 3 (goal+skill)',     data.totalCount === 3);
  assert('completionRate ≈ 0.667',          approx(data.completionRate, 2/3));
  assert('focusMins = 120 (passed in)',     data.focusMins === 120);
  assert('criticalDone = false',            data.criticalDone === false);
}

// ─── Suite 8: buildNightShutdown — critical done ──────────────────────────────

console.log('\nSuite 8: buildNightShutdown — critical done');

{
  const items = [
    makeItem('crit', 'goal', '09:00', '10:00', true, true),  // critical + done
    makeItem('norm', 'goal', '11:00', '12:00', false),
  ];
  const data = buildNightShutdown(makePlan(items), 60);

  assert('criticalDone = true',             data.criticalDone === true);
  assert('completionRate = 0.5',            approx(data.completionRate, 0.5));
}

// ─── Suite 9: buildNightShutdown — edge cases ─────────────────────────────────

console.log('\nSuite 9: buildNightShutdown — edge cases');

{
  // Empty plan
  const empty = buildNightShutdown(makePlan([]), 0);
  assert('empty plan → completionRate = 0',  empty.completionRate === 0);
  assert('empty plan → criticalDone = false', empty.criticalDone === false);

  // All completed
  const allDone = [
    makeItem('x', 'goal', '09:00', '10:00', true),
    makeItem('y', 'skill', '11:00', '12:00', true),
  ];
  const full = buildNightShutdown(makePlan(allDone), 180);
  assert('all done → completionRate = 1.0',  approx(full.completionRate, 1.0));
  assert('all done → focusMins passed',      full.focusMins === 180);

  // Only break/event items — totalCount = 0
  const noActionable = [makeItem('br', 'break', '12:00', '12:30')];
  const none = buildNightShutdown(makePlan(noActionable), 0);
  assert('no actionable → totalCount = 0',   none.totalCount === 0);
  assert('no actionable → rate = 0',         none.completionRate === 0);
}

// ─── Suite 10: interpretWeeklyReview ──────────────────────────────────────────

console.log('\nSuite 10: interpretWeeklyReview');

{
  const makeSummaries = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ date: `2026-03-${23+i}` }));

  const excellent = interpretWeeklyReview({
    avgCompletionRate: 0.9,
    recoveryCount: 0,
    dominantDriftType: null,
    totalFocusMinutes: 600,
    dailySummaries: makeSummaries(5),
  });
  assert('high rate, no recovery → excellent message', excellent.includes('Excellent') || excellent.includes('clean'));

  const strong = interpretWeeklyReview({
    avgCompletionRate: 0.78,
    recoveryCount: 1,
    dominantDriftType: null,
    totalFocusMinutes: 400,
    dailySummaries: makeSummaries(5),
  });
  assert('0.78 rate → strong message',       strong.includes('Strong'));

  const overloaded = interpretWeeklyReview({
    avgCompletionRate: 0.5,
    recoveryCount: 4,
    dominantDriftType: null,
    totalFocusMinutes: 200,
    dailySummaries: makeSummaries(5),
  });
  assert('recoveryCount≥3 → heavy recovery msg', overloaded.includes('recovery'));

  const avoidance = interpretWeeklyReview({
    avgCompletionRate: 0.55,
    recoveryCount: 1,
    dominantDriftType: 'avoidance',
    totalFocusMinutes: 180,
    dailySummaries: makeSummaries(4),
  });
  assert('avoidance drift → avoidance message', avoidance.toLowerCase().includes('avoidance'));

  const empty = interpretWeeklyReview({
    avgCompletionRate: 0,
    recoveryCount: 0,
    dominantDriftType: null,
    totalFocusMinutes: 0,
    dailySummaries: [],
  });
  assert('empty week → no reviews message',  empty.includes('No reviews'));

  const difficult = interpretWeeklyReview({
    avgCompletionRate: 0.25,
    recoveryCount: 0,
    dominantDriftType: null,
    totalFocusMinutes: 60,
    dailySummaries: makeSummaries(3),
  });
  assert('low rate → difficult week message', difficult.includes('Difficult') || difficult.includes('adapt'));
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
