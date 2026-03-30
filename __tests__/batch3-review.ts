export {};

/**
 * LifeOS Batch 3 — Review Engine Tests
 *
 * Node-runnable validation of all Batch 3 behaviors:
 *   - computeDailyReview — completion count, focusMinutes, criticalDone,
 *     driftTypes, recoveryUsed, distractionCount, skipCount, systemTakeaway
 *   - computeWeeklyReview — avgCompletionRate, totalFocusMinutes,
 *     dominantDriftType, recoveryCount, avgAlignmentScore, weekEnd
 *   - generateReviewMemorySignals — productivity_pattern always emitted,
 *     coaching_preference only when recoveryUsed + recoveryMode set
 *   - getDominantDriftType — most frequent, null on empty, tie-breaking
 *   - getWeekStart — correct Monday derivation
 *   - edge cases: no tasks, all tasks, no drifts, no alignment score
 *
 * Run with:  npx tsx __tests__/batch3-review.ts
 */

// ─── Inline types ─────────────────────────────────────────────────────────────

type DriftType = 'late_start' | 'avoidance' | 'overload' | 'distraction' | 'fragmented_day';
type RecoveryMode = 'save_day' | 'critical_only' | 'resume_now' | 'compress_day';
type PlanItemType = 'goal' | 'skill' | 'break' | 'event' | 'free' | 'habit';

interface PlanItem {
  id: string;
  startTime: string;
  endTime: string;
  title: string;
  type: PlanItemType;
  completed: boolean;
  isCritical?: boolean;
}

interface DistractionLog {
  id: string;
  timestamp: string;
  note?: string;
}

interface DriftRecord {
  type: DriftType;
  severity: 'low' | 'medium' | 'high';
  detectedAt: string;
  date: string;
  recoveryApplied: RecoveryMode | null;
}

interface DailyReview {
  date: string;
  completedCount: number;
  totalCount: number;
  focusMinutes: number;
  criticalDone: boolean;
  driftTypes: DriftType[];
  recoveryUsed: boolean;
  recoveryMode?: RecoveryMode;
  reflectionText?: string;
  alignmentScore?: number;
  savedAt: string;
  distractionCount?: number;
  skipCount?: number;
  whatWorked?: string;
  whatFailed?: string;
  tomorrowFocus?: string;
  systemTakeaway?: string;
}

interface WeeklyDaySummary {
  date: string;
  completionRate: number;
  focusMinutes: number;
  driftCount: number;
  recoveryUsed: boolean;
}

interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  dailySummaries: WeeklyDaySummary[];
  avgCompletionRate: number;
  totalFocusMinutes: number;
  dominantDriftType: DriftType | null;
  recoveryCount: number;
  avgAlignmentScore: number;
  coachNote?: string;
  savedAt: string;
}

interface ReviewMemorySignal {
  signalType: 'productivity_pattern' | 'coaching_preference';
  content: string;
  date: string;
}

// ─── Inline timeToMins helper ─────────────────────────────────────────────────

function timeToMins(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// ─── Inline DailyReviewInput + computeDailyReview ────────────────────────────

interface DailyReviewInput {
  date: string;
  planItems: PlanItem[];
  distractionLogs: DistractionLog[];
  driftHistory: DriftRecord[];
  activeRecoveryMode: RecoveryMode | null;
  taskSkipCount: number;
  alignmentScore?: number;
}

function computeDailyReview(input: DailyReviewInput): DailyReview {
  const { date, planItems, distractionLogs, driftHistory, activeRecoveryMode, taskSkipCount, alignmentScore } = input;

  const actionable = planItems.filter((i) => i.type === 'goal' || i.type === 'skill');
  const completedActionable = actionable.filter((i) => i.completed);
  const completedCount = completedActionable.length;
  const totalCount = actionable.length;

  const focusMinutes = completedActionable.reduce(
    (acc, i) => acc + Math.max(0, timeToMins(i.endTime) - timeToMins(i.startTime)), 0,
  );

  const criticalDone = planItems.some((i) => !!i.isCritical && i.completed);

  const driftTypes: DriftType[] = Array.from(new Set(driftHistory.map((r) => r.type)));

  const recoveryUsed =
    activeRecoveryMode !== null ||
    driftHistory.some((r) => r.recoveryApplied !== null);

  const recoveryMode = activeRecoveryMode ?? undefined;

  const distractionCount = distractionLogs.filter((d) => d.timestamp.startsWith(date)).length;

  const systemTakeaway = _deriveSystemTakeaway(completedCount, totalCount, driftTypes, distractionCount, recoveryUsed);

  return { date, completedCount, totalCount, focusMinutes, criticalDone, driftTypes, recoveryUsed, recoveryMode,
    alignmentScore, savedAt: new Date().toISOString(), distractionCount, skipCount: taskSkipCount, systemTakeaway };
}

function _deriveSystemTakeaway(
  completed: number, total: number, driftTypes: DriftType[],
  distractionCount: number, recoveryUsed: boolean,
): string {
  const rate = total > 0 ? completed / total : 1;
  if (rate === 1 && driftTypes.length === 0) return 'clean_day';
  if (rate === 1 && recoveryUsed)            return 'recovered_strong';
  if (rate >= 0.7 && driftTypes.length === 0) return 'solid_day';
  if (driftTypes.includes('avoidance') && rate < 0.4) return 'avoidance_pattern';
  if (driftTypes.includes('overload'))       return 'overload_pattern';
  if (distractionCount >= 5)                 return 'distraction_heavy';
  if (recoveryUsed && rate >= 0.5)           return 'recovery_effective';
  if (rate < 0.3)                            return 'low_execution';
  return 'mixed_day';
}

// ─── Inline computeWeeklyReview ───────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function computeWeeklyReview(dailyReviews: DailyReview[], weekStart: string): WeeklyReview {
  const weekEnd = addDays(weekStart, 6);
  const weekReviews = dailyReviews.filter((r) => r.date >= weekStart && r.date <= weekEnd);

  const dailySummaries: WeeklyDaySummary[] = weekReviews.map((r) => ({
    date:           r.date,
    completionRate: r.totalCount > 0 ? r.completedCount / r.totalCount : 1,
    focusMinutes:   r.focusMinutes,
    driftCount:     r.driftTypes.length,
    recoveryUsed:   r.recoveryUsed,
  }));

  const daysWithTasks = weekReviews.filter((r) => r.totalCount > 0);
  const avgCompletionRate =
    daysWithTasks.length > 0
      ? daysWithTasks.reduce((acc, r) => acc + r.completedCount / r.totalCount, 0) / daysWithTasks.length
      : 0;

  const totalFocusMinutes = weekReviews.reduce((acc, r) => acc + r.focusMinutes, 0);
  const dominantDriftType = getDominantDriftType(weekReviews);
  const recoveryCount = weekReviews.filter((r) => r.recoveryUsed).length;

  const withScore = weekReviews.filter((r) => r.alignmentScore !== undefined);
  const avgAlignmentScore =
    withScore.length > 0
      ? Math.round(withScore.reduce((acc, r) => acc + (r.alignmentScore ?? 0), 0) / withScore.length)
      : 0;

  return { weekStart, weekEnd, dailySummaries, avgCompletionRate, totalFocusMinutes,
    dominantDriftType, recoveryCount, avgAlignmentScore, savedAt: new Date().toISOString() };
}

// ─── Inline generateReviewMemorySignals ──────────────────────────────────────

function generateReviewMemorySignals(review: DailyReview): ReviewMemorySignal[] {
  const signals: ReviewMemorySignal[] = [];
  const completionRate = review.totalCount > 0
    ? Math.round((review.completedCount / review.totalCount) * 100) / 100
    : 1;

  signals.push({
    signalType: 'productivity_pattern',
    content: JSON.stringify({
      completionRate,
      focusMinutes: review.focusMinutes,
      dominantDrift: review.driftTypes[0] ?? null,
      distractionCount: review.distractionCount ?? 0,
      skipCount: review.skipCount ?? 0,
      systemTakeaway: review.systemTakeaway ?? null,
    }),
    date: review.date,
  });

  if (review.recoveryUsed && review.recoveryMode) {
    signals.push({
      signalType: 'coaching_preference',
      content: JSON.stringify({
        recoveryMode: review.recoveryMode,
        wasEffective: completionRate >= 0.5,
        date: review.date,
      }),
      date: review.date,
    });
  }
  return signals;
}

// ─── Inline getDominantDriftType ─────────────────────────────────────────────

function getDominantDriftType(reviews: DailyReview[]): DriftType | null {
  const counts = new Map<DriftType, number>();
  for (const review of reviews) {
    for (const dt of review.driftTypes) {
      counts.set(dt, (counts.get(dt) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  let dominant: DriftType | null = null;
  let max = 0;
  for (const [dt, count] of counts) {
    if (count > max) { max = count; dominant = dt; }
  }
  return dominant;
}

// ─── Inline getWeekStart ─────────────────────────────────────────────────────

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(
  id: string, type: PlanItemType, startTime: string, endTime: string,
  completed: boolean, isCritical = false,
): PlanItem {
  return { id, type, startTime, endTime, title: id, completed, isCritical };
}

function makeDistraction(timestamp: string): DistractionLog {
  return { id: timestamp, timestamp };
}

function makeDriftRecord(type: DriftType, recovery: RecoveryMode | null, date: string): DriftRecord {
  return { type, severity: 'medium', detectedAt: new Date().toISOString(), date, recoveryApplied: recovery };
}

function makeReview(
  date: string,
  completedCount: number,
  totalCount: number,
  opts: Partial<DailyReview> = {},
): DailyReview {
  return {
    date,
    completedCount,
    totalCount,
    focusMinutes: opts.focusMinutes ?? 60,
    criticalDone: opts.criticalDone ?? false,
    driftTypes: opts.driftTypes ?? [],
    recoveryUsed: opts.recoveryUsed ?? false,
    recoveryMode: opts.recoveryMode,
    alignmentScore: opts.alignmentScore,
    savedAt: new Date().toISOString(),
    distractionCount: opts.distractionCount ?? 0,
    skipCount: opts.skipCount ?? 0,
    systemTakeaway: opts.systemTakeaway,
  };
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else           { console.error(`  ✗ ${label}`); failed++; }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const TODAY = '2026-03-29';
const WEEK_START = '2026-03-23'; // Monday

section('computeDailyReview — completion counts');

const items3 = [
  makeItem('g1', 'goal',  '09:00', '10:00', true),
  makeItem('g2', 'goal',  '10:00', '11:30', false),
  makeItem('b1', 'break', '11:30', '12:00', false), // break — excluded
  makeItem('s1', 'skill', '12:00', '13:00', true),
];
const r1 = computeDailyReview({ date: TODAY, planItems: items3, distractionLogs: [],
  driftHistory: [], activeRecoveryMode: null, taskSkipCount: 1 });

assert('completedCount = 2 (goal+skill only)', r1.completedCount === 2);
assert('totalCount = 3 (goal+skill, excludes break)', r1.totalCount === 3);
assert('focusMinutes = 120 (g1=60 + s1=60, g2 not completed)', r1.focusMinutes === 120);
assert('skipCount carried through', r1.skipCount === 1);

section('computeDailyReview — criticalDone');

const itemsC = [
  makeItem('c1', 'goal', '09:00', '10:00', true, true),  // critical + completed
  makeItem('c2', 'goal', '10:00', '11:00', false, false),
];
const rC = computeDailyReview({ date: TODAY, planItems: itemsC, distractionLogs: [],
  driftHistory: [], activeRecoveryMode: null, taskSkipCount: 0 });
assert('criticalDone true when critical item completed', rC.criticalDone === true);

const itemsNC = [
  makeItem('n1', 'goal', '09:00', '10:00', false, true), // critical but NOT completed
];
const rNC = computeDailyReview({ date: TODAY, planItems: itemsNC, distractionLogs: [],
  driftHistory: [], activeRecoveryMode: null, taskSkipCount: 0 });
assert('criticalDone false when critical item not completed', rNC.criticalDone === false);

section('computeDailyReview — driftTypes + recoveryUsed from driftHistory');

const history = [
  makeDriftRecord('avoidance', 'save_day', TODAY),
  makeDriftRecord('avoidance', null, TODAY),       // duplicate type
  makeDriftRecord('overload',  'compress_day', TODAY),
];
const rD = computeDailyReview({ date: TODAY, planItems: [], distractionLogs: [],
  driftHistory: history, activeRecoveryMode: null, taskSkipCount: 0 });
assert('driftTypes deduped', rD.driftTypes.length === 2);
assert('driftTypes includes avoidance', rD.driftTypes.includes('avoidance'));
assert('driftTypes includes overload', rD.driftTypes.includes('overload'));
assert('recoveryUsed true (recoveryApplied in history)', rD.recoveryUsed === true);

section('computeDailyReview — recoveryUsed from activeRecoveryMode');

const rARM = computeDailyReview({ date: TODAY, planItems: [], distractionLogs: [],
  driftHistory: [], activeRecoveryMode: 'critical_only', taskSkipCount: 0 });
assert('recoveryUsed true from activeRecoveryMode', rARM.recoveryUsed === true);
assert('recoveryMode set to activeRecoveryMode', rARM.recoveryMode === 'critical_only');

section('computeDailyReview — distractionCount filtered by date');

const logs = [
  makeDistraction('2026-03-29T09:00:00Z'),
  makeDistraction('2026-03-29T10:00:00Z'),
  makeDistraction('2026-03-28T10:00:00Z'), // yesterday — excluded
];
const rDC = computeDailyReview({ date: TODAY, planItems: [], distractionLogs: logs,
  driftHistory: [], activeRecoveryMode: null, taskSkipCount: 0 });
assert('distractionCount filters to today only (2)', rDC.distractionCount === 2);

section('computeDailyReview — systemTakeaway tags');

const cleanItems = [makeItem('g1', 'goal', '09:00', '10:00', true)];
const rClean = computeDailyReview({ date: TODAY, planItems: cleanItems, distractionLogs: [],
  driftHistory: [], activeRecoveryMode: null, taskSkipCount: 0 });
assert("clean_day when 100% done, no drifts", rClean.systemTakeaway === 'clean_day');

const avoidItems = [
  makeItem('g1', 'goal', '09:00', '10:00', false),
  makeItem('g2', 'goal', '10:00', '11:00', false),
  makeItem('g3', 'goal', '11:00', '12:00', false),
];
const avoidHistory = [makeDriftRecord('avoidance', null, TODAY)];
const rAvoid = computeDailyReview({ date: TODAY, planItems: avoidItems, distractionLogs: [],
  driftHistory: avoidHistory, activeRecoveryMode: null, taskSkipCount: 3 });
assert('avoidance_pattern when avoidance drift + <40% completion', rAvoid.systemTakeaway === 'avoidance_pattern');

section('computeDailyReview — no plan items edge case');

const rEmpty = computeDailyReview({ date: TODAY, planItems: [], distractionLogs: [],
  driftHistory: [], activeRecoveryMode: null, taskSkipCount: 0 });
assert('totalCount 0 when no items', rEmpty.totalCount === 0);
assert('completedCount 0 when no items', rEmpty.completedCount === 0);
assert('focusMinutes 0 when no items', rEmpty.focusMinutes === 0);

section('computeWeeklyReview — basic roll-up');

const weekReviews: DailyReview[] = [
  makeReview('2026-03-23', 4, 5, { focusMinutes: 120, alignmentScore: 80, recoveryUsed: false }),
  makeReview('2026-03-24', 3, 4, { focusMinutes: 90,  alignmentScore: 70, recoveryUsed: true, driftTypes: ['avoidance'] }),
  makeReview('2026-03-25', 5, 5, { focusMinutes: 150, alignmentScore: 90, recoveryUsed: false }),
  makeReview('2026-03-29', 2, 6, { focusMinutes: 60,  alignmentScore: 60, recoveryUsed: true, driftTypes: ['avoidance', 'overload'] }),
  // date outside the week (should be excluded)
  makeReview('2026-03-30', 5, 5, { focusMinutes: 200, alignmentScore: 95, recoveryUsed: false }),
];

const wr = computeWeeklyReview(weekReviews, WEEK_START);
assert('weekEnd is 6 days after weekStart', wr.weekEnd === '2026-03-29');
assert('dailySummaries excludes out-of-week days', wr.dailySummaries.length === 4);
assert('totalFocusMinutes sums within week', wr.totalFocusMinutes === 120 + 90 + 150 + 60);
assert('recoveryCount = 2 (2 days used recovery)', wr.recoveryCount === 2);

section('computeWeeklyReview — avgCompletionRate');

// Days: 4/5=0.8, 3/4=0.75, 5/5=1.0, 2/6=0.333
const expected = (0.8 + 0.75 + 1.0 + (2/6)) / 4;
assert('avgCompletionRate correct', Math.abs(wr.avgCompletionRate - expected) < 0.001);

section('computeWeeklyReview — avgAlignmentScore');

// (80+70+90+60)/4 = 75
assert('avgAlignmentScore = 75', wr.avgAlignmentScore === 75);

section('computeWeeklyReview — empty input');

const wrEmpty = computeWeeklyReview([], WEEK_START);
assert('empty: dailySummaries is []', wrEmpty.dailySummaries.length === 0);
assert('empty: avgCompletionRate is 0', wrEmpty.avgCompletionRate === 0);
assert('empty: totalFocusMinutes is 0', wrEmpty.totalFocusMinutes === 0);
assert('empty: dominantDriftType is null', wrEmpty.dominantDriftType === null);
assert('empty: recoveryCount is 0', wrEmpty.recoveryCount === 0);
assert('empty: avgAlignmentScore is 0', wrEmpty.avgAlignmentScore === 0);

section('getDominantDriftType');

assert('null when no reviews', getDominantDriftType([]) === null);
assert('null when no drifts', getDominantDriftType([makeReview(TODAY, 5, 5)]) === null);

const driftReviews = [
  makeReview('2026-03-23', 3, 5, { driftTypes: ['avoidance'] }),
  makeReview('2026-03-24', 3, 5, { driftTypes: ['avoidance', 'overload'] }),
  makeReview('2026-03-25', 3, 5, { driftTypes: ['overload'] }),
];
assert('avoidance appears 2x (vs overload 2x) — tie: first in map wins (avoidance)',
  getDominantDriftType(driftReviews) === 'avoidance');

const moredrift = [
  ...driftReviews,
  makeReview('2026-03-26', 3, 5, { driftTypes: ['overload'] }),
];
assert('overload appears 3x — becomes dominant', getDominantDriftType(moredrift) === 'overload');

section('generateReviewMemorySignals');

const reviewForSig = makeReview(TODAY, 4, 5, {
  focusMinutes: 120, driftTypes: ['avoidance'], recoveryUsed: false,
  distractionCount: 2, skipCount: 1, systemTakeaway: 'mixed_day',
});
const sigsNoRecovery = generateReviewMemorySignals(reviewForSig);
assert('always emits productivity_pattern signal', sigsNoRecovery.length === 1);
assert('signal signalType is productivity_pattern', sigsNoRecovery[0].signalType === 'productivity_pattern');
assert('signal date matches review date', sigsNoRecovery[0].date === TODAY);

const ppContent = JSON.parse(sigsNoRecovery[0].content);
assert('productivity_pattern has completionRate', typeof ppContent.completionRate === 'number');
assert('completionRate = 0.8', ppContent.completionRate === 0.80);
assert('productivity_pattern has focusMinutes', ppContent.focusMinutes === 120);
assert('productivity_pattern has dominantDrift', ppContent.dominantDrift === 'avoidance');
assert('productivity_pattern has skipCount', ppContent.skipCount === 1);

const reviewWithRecovery = makeReview(TODAY, 3, 5, {
  recoveryUsed: true, recoveryMode: 'save_day',
});
const sigsWithRecovery = generateReviewMemorySignals(reviewWithRecovery);
assert('emits 2 signals when recovery used', sigsWithRecovery.length === 2);
assert('second signal is coaching_preference', sigsWithRecovery[1].signalType === 'coaching_preference');

const cpContent = JSON.parse(sigsWithRecovery[1].content);
assert('coaching_preference has recoveryMode', cpContent.recoveryMode === 'save_day');
assert('coaching_preference has wasEffective (3/5=0.6 ≥ 0.5 → true)', cpContent.wasEffective === true);

const reviewLowCompletion = makeReview(TODAY, 1, 5, { recoveryUsed: true, recoveryMode: 'critical_only' });
const sigsLow = generateReviewMemorySignals(reviewLowCompletion);
const cpLow = JSON.parse(sigsLow[1].content);
assert('wasEffective false when completion < 50% (1/5=0.2)', cpLow.wasEffective === false);

section('getWeekStart');

assert('2026-03-29 (Sunday) → Monday 2026-03-23', getWeekStart('2026-03-29') === '2026-03-23');
assert('2026-03-23 (Monday) → same day', getWeekStart('2026-03-23') === '2026-03-23');
assert('2026-03-25 (Wednesday) → 2026-03-23', getWeekStart('2026-03-25') === '2026-03-23');

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Batch 3: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll Batch 3 tests passed.');
}
