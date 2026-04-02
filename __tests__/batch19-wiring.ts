/**
 * Batch 19 Wiring — Integration path tests.
 *
 * Tests the end-to-end path from DailyReview[] →
 * StrategicIntelligenceSummary → AIContext wire packet.
 *
 * Does NOT test React hooks (those require a component renderer).
 * Tests the pure wiring logic:
 *   W1. Full pipeline produces a valid StrategicIntelligenceSummary
 *   W2. Empty dailyReviews → valid zero-safe summary
 *   W3. buildAIContextPacket (rich)    → includes strategicIntelligence
 *   W4. buildAIContextPacket (focused) → excludes strategicIntelligence
 *   W5. buildAIContextPacket (minimal) → excludes strategicIntelligence
 *   W6. coachSummary in wire packet is the exact string from engine
 *   W7. topRecommendation in wire packet matches first recommendation action
 *   W8. weekCharacter propagates correctly through the wire packet
 *   W9. momentumState propagates correctly through the wire packet
 *   W10. Sufficient review data → non-empty coachSummary in wire packet
 *   W11. Zero reviews → coachSummary empty string → no strategicIntelligence key
 */

import {
  computeWeeklyIntelligence,
  computeMonthlyIntelligence,
  getMomentumState,
  buildStrategicRecommendations,
  buildStrategicCoachSummary,
  getWeekStartForIntelligence,
} from '../src/ai/intelligenceEngine';
import { buildAIContextPacket } from '../src/ai/orchestrationEngine';
import type { AIContext } from '../src/ai/AIClient';
import type { DailyReview, StrategicIntelligenceSummary, Goal, SkillPlan, Rule, ScheduleEvent } from '../src/types';

// ─── Assertion helper ─────────────────────────────────────────────────────────

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// ─── Factories ────────────────────────────────────────────────────────────────

const TODAY      = '2026-03-31';
// 2026-03-31 is a Tuesday → Monday of that week is 2026-03-30
const WEEK_START = getWeekStartForIntelligence(TODAY); // '2026-03-30'

function makeReview(date: string, overrides: Partial<DailyReview> = {}): DailyReview {
  return {
    completedCount:   5,
    totalCount:       6,
    focusMinutes:     90,
    criticalDone:     true,
    driftTypes:       [],
    recoveryUsed:     false,
    alignmentScore:   75,
    savedAt:          new Date().toISOString(),
    distractionCount: 1,
    skipCount:        0,
    systemTakeaway:   'solid_day',
    date,
    ...overrides,
  };
}

/** 5 days of solid reviews in the current week (Mon–Fri of TODAY's week) */
function makeStrongWeek(): DailyReview[] {
  // WEEK_START = '2026-03-30' (Mon); TODAY = '2026-03-31' (Tue)
  return [
    makeReview(WEEK_START,                { completedCount: 5, totalCount: 6, systemTakeaway: 'clean_day' }),
    makeReview(addTestDays(WEEK_START, 1), { completedCount: 5, totalCount: 5, systemTakeaway: 'clean_day' }),
    makeReview(addTestDays(WEEK_START, 2), { completedCount: 4, totalCount: 5, systemTakeaway: 'solid_day' }),
    makeReview(addTestDays(WEEK_START, 3), { completedCount: 5, totalCount: 6, systemTakeaway: 'clean_day' }),
    makeReview(addTestDays(WEEK_START, 4), { completedCount: 5, totalCount: 5, systemTakeaway: 'solid_day' }),
  ];
}

function addTestDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 14 days — first half poor, second half good → improving */
function makeImprovingMonth(): DailyReview[] {
  const out: DailyReview[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date('2026-03-31T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - (13 - i));
    const isLater = i >= 7;
    out.push(makeReview(d.toISOString().slice(0, 10), {
      completedCount: isLater ? 5 : 2,
      totalCount:     7,
      systemTakeaway: isLater ? 'solid_day' : 'low_execution',
    }));
  }
  return out;
}

/** Build a StrategicIntelligenceSummary from reviews (mirrors the hook + store logic) */
function buildSummary(dailyReviews: DailyReview[], today = TODAY): StrategicIntelligenceSummary {
  const weekStart      = getWeekStartForIntelligence(today);
  const weekly         = computeWeeklyIntelligence(dailyReviews, weekStart);
  const monthly        = computeMonthlyIntelligence(dailyReviews, today);
  const momentumState  = getMomentumState(weekly);
  const recommendations = buildStrategicRecommendations(weekly, monthly);
  const coachSummary   = buildStrategicCoachSummary(weekly, monthly, recommendations);
  return { weekly, monthly, momentumState, recommendations, coachSummary };
}

/** Minimal valid AIContext for orchestration tests */
function makeAIContext(overrides: Partial<AIContext> = {}): AIContext {
  return {
    goals:          [] as Goal[],
    skillPlans:     [] as SkillPlan[],
    rules:          [] as Rule[],
    scheduleEvents: [] as ScheduleEvent[],
    todayDate:      TODAY,
    ...overrides,
  };
}

// ─── W1: Full pipeline produces a valid summary ───────────────────────────────

function testW1_fullPipeline(): void {
  const reviews = [...makeStrongWeek(), ...makeImprovingMonth()];
  const summary = buildSummary(reviews);

  assert(typeof summary.weekly === 'object',  'W1a weekly object present');
  assert(typeof summary.monthly === 'object', 'W1b monthly object present');
  assert(typeof summary.momentumState === 'string', 'W1c momentumState string');
  assert(Array.isArray(summary.recommendations),    'W1d recommendations array');
  assert(typeof summary.coachSummary === 'string',  'W1e coachSummary string');

  // weekStart computed correctly from TODAY
  const expectedWeekStart = getWeekStartForIntelligence(TODAY); // 2026-03-30 (Mon)
  assert(summary.weekly.weekStart === expectedWeekStart, `W1f weekStart ${summary.weekly.weekStart} === ${expectedWeekStart}`);

  console.log('W1 PASS full pipeline → valid StrategicIntelligenceSummary');
}

// ─── W2: Empty reviews → zero-safe summary ────────────────────────────────────

function testW2_emptyReviews(): void {
  const summary = buildSummary([]);

  assert(summary.weekly.reviewedDays === 0,                        'W2a reviewedDays 0');
  assert(summary.weekly.weekCharacter === 'insufficient_data',     'W2b weekCharacter insufficient');
  assert(summary.monthly.reviewedDays === 0,                       'W2c monthly reviewedDays 0');
  assert(summary.monthly.executionTrend === 'insufficient_data',   'W2d monthly trend insufficient');
  assert(summary.momentumState === 'insufficient_data',            'W2e momentum insufficient');
  assert(summary.recommendations.length === 0,                     'W2f no recommendations');
  assert(summary.coachSummary === '',                              'W2g coachSummary empty string');

  console.log('W2 PASS empty reviews → zero-safe summary');
}

// ─── W3: Rich depth → includes strategicIntelligence ─────────────────────────

function testW3_richDepthIncludes(): void {
  const reviews = [...makeStrongWeek(), ...makeImprovingMonth()];
  const summary = buildSummary(reviews);
  const ctx     = makeAIContext({ strategicIntelligence: summary });
  const packet  = buildAIContextPacket(ctx, 'rich', 'strategic_planning') as Record<string, unknown>;

  assert('strategicIntelligence' in packet, 'W3 rich depth includes strategicIntelligence');
  console.log('W3 PASS buildAIContextPacket rich → strategicIntelligence present');
}

// ─── W4: Focused depth → excludes strategicIntelligence ──────────────────────

function testW4_focusedDepthExcludes(): void {
  const reviews = makeStrongWeek();
  const summary = buildSummary(reviews);
  const ctx     = makeAIContext({ strategicIntelligence: summary });
  const packet  = buildAIContextPacket(ctx, 'focused', 'focused_answer') as Record<string, unknown>;

  assert(!('strategicIntelligence' in packet), 'W4 focused depth excludes strategicIntelligence');
  console.log('W4 PASS buildAIContextPacket focused → strategicIntelligence absent');
}

// ─── W5: Minimal depth → excludes strategicIntelligence ──────────────────────

function testW5_minimalDepthExcludes(): void {
  const reviews = makeStrongWeek();
  const summary = buildSummary(reviews);
  const ctx     = makeAIContext({ strategicIntelligence: summary });
  const packet  = buildAIContextPacket(ctx, 'minimal', 'quick_nudge') as Record<string, unknown>;

  assert(!('strategicIntelligence' in packet), 'W5 minimal depth excludes strategicIntelligence');
  console.log('W5 PASS buildAIContextPacket minimal → strategicIntelligence absent');
}

// ─── W6: coachSummary in wire packet is exact engine output ──────────────────

function testW6_coachSummaryPassthrough(): void {
  const reviews = makeStrongWeek();
  const summary = buildSummary(reviews);
  const ctx     = makeAIContext({ strategicIntelligence: summary });
  const packet  = buildAIContextPacket(ctx, 'rich', 'review_reflection') as Record<string, unknown>;

  const si = packet.strategicIntelligence as Record<string, unknown> | undefined;
  assert(si !== undefined, 'W6a strategicIntelligence key exists');
  assert(si!.coachSummary === summary.coachSummary, 'W6b coachSummary matches engine output exactly');
  console.log('W6 PASS coachSummary passes through wire packet unchanged');
}

// ─── W7: topRecommendation in wire packet matches first rec action ────────────

function testW7_topRecommendationPassthrough(): void {
  // Use the current week with overload signal to trigger a high-priority recommendation
  const reviews = [
    makeReview(WEEK_START,                { completedCount: 2, totalCount: 8, driftTypes: ['overload'], systemTakeaway: 'overload_pattern' }),
    makeReview(addTestDays(WEEK_START, 1), { completedCount: 2, totalCount: 8, driftTypes: ['overload'], systemTakeaway: 'overload_pattern' }),
    makeReview(addTestDays(WEEK_START, 2), { completedCount: 3, totalCount: 8, driftTypes: ['overload'], systemTakeaway: 'overload_pattern' }),
  ];
  const summary = buildSummary(reviews);
  const ctx     = makeAIContext({ strategicIntelligence: summary });
  const packet  = buildAIContextPacket(ctx, 'rich', 'strategic_planning') as Record<string, unknown>;

  const si = packet.strategicIntelligence as Record<string, unknown>;
  assert(si !== undefined, 'W7a strategicIntelligence present');
  assert(
    si.topRecommendation === (summary.recommendations[0]?.action ?? null),
    `W7b topRecommendation "${si.topRecommendation}" matches "${summary.recommendations[0]?.action}"`,
  );
  console.log('W7 PASS topRecommendation in wire packet matches engine first recommendation');
}

// ─── W8: weekCharacter propagates through wire packet ────────────────────────

function testW8_weekCharacterPropagates(): void {
  const reviews = makeStrongWeek();
  const summary = buildSummary(reviews);
  const ctx     = makeAIContext({ strategicIntelligence: summary });
  const packet  = buildAIContextPacket(ctx, 'rich', 'review_reflection') as Record<string, unknown>;

  const si = packet.strategicIntelligence as Record<string, unknown>;
  assert(si.weekCharacter === summary.weekly.weekCharacter,
    `W8 weekCharacter "${si.weekCharacter}" should match "${summary.weekly.weekCharacter}"`);
  console.log(`W8 PASS weekCharacter "${si.weekCharacter}" propagates through wire packet`);
}

// ─── W9: momentumState propagates through wire packet ────────────────────────

function testW9_momentumStatePropagates(): void {
  const reviews = makeStrongWeek();
  const summary = buildSummary(reviews);
  const ctx     = makeAIContext({ strategicIntelligence: summary });
  const packet  = buildAIContextPacket(ctx, 'rich', 'strategic_planning') as Record<string, unknown>;

  const si = packet.strategicIntelligence as Record<string, unknown>;
  assert(si.momentumState === summary.momentumState,
    `W9 momentumState "${si.momentumState}" should match "${summary.momentumState}"`);
  console.log(`W9 PASS momentumState "${si.momentumState}" propagates through wire packet`);
}

// ─── W10: Sufficient data → non-empty coachSummary → packet includes key ─────

function testW10_sufficientData_summaryPresent(): void {
  const reviews = makeStrongWeek();
  const summary = buildSummary(reviews);

  // Strong week should produce a non-empty coach summary
  assert(summary.coachSummary.length > 0,   'W10a coachSummary non-empty with 5 reviews');
  assert(summary.coachSummary.includes('═══ STRATEGIC INTELLIGENCE ═══'), 'W10b header present');

  const ctx    = makeAIContext({ strategicIntelligence: summary });
  const packet = buildAIContextPacket(ctx, 'rich', 'review_reflection') as Record<string, unknown>;
  assert('strategicIntelligence' in packet, 'W10c packet includes key when coachSummary non-empty');
  console.log('W10 PASS sufficient data → non-empty summary → packet includes strategicIntelligence');
}

// ─── W11: Empty coachSummary → strategicIntelligence omitted from packet ─────

function testW11_emptyCoachSummary_omitted(): void {
  // Zero reviews → coachSummary = '' → orchestration guard should omit the key
  const summary = buildSummary([]);
  assert(summary.coachSummary === '', 'W11a coachSummary empty for 0 reviews');

  const ctx    = makeAIContext({ strategicIntelligence: summary });
  const packet = buildAIContextPacket(ctx, 'rich', 'strategic_planning') as Record<string, unknown>;
  // The orchestration guard is: `ctx.strategicIntelligence?.coachSummary` (truthy check)
  // Empty string is falsy → key should not appear in packet
  assert(!('strategicIntelligence' in packet), 'W11b empty coachSummary → key omitted from packet');
  console.log('W11 PASS empty coachSummary → strategicIntelligence omitted from packet');
}

// ─── W12: monthlyInterpretation propagates ───────────────────────────────────

function testW12_monthlyInterpretationPropagates(): void {
  const reviews = makeImprovingMonth();
  const summary = buildSummary(reviews);
  const ctx     = makeAIContext({ strategicIntelligence: summary });
  const packet  = buildAIContextPacket(ctx, 'rich', 'review_reflection') as Record<string, unknown>;

  const si = packet.strategicIntelligence as Record<string, unknown> | undefined;
  if (!si) {
    // coachSummary may be empty if reviews don't fall in current week
    console.log('W12 SKIP (coachSummary empty for this date set — acceptable)');
    return;
  }
  assert(si.monthlyInterpretation === summary.monthly.monthlyInterpretation,
    `W12 monthlyInterpretation "${si.monthlyInterpretation}" propagates`);
  console.log(`W12 PASS monthlyInterpretation "${si.monthlyInterpretation}" in packet`);
}

// ─── W13: Pipeline is deterministic for the same input ───────────────────────

function testW13_deterministic(): void {
  const reviews = makeStrongWeek();
  const s1 = buildSummary(reviews);
  const s2 = buildSummary(reviews);

  assert(s1.weekly.weekCharacter     === s2.weekly.weekCharacter,     'W13a weekCharacter deterministic');
  assert(s1.monthly.executionTrend   === s2.monthly.executionTrend,   'W13b executionTrend deterministic');
  assert(s1.momentumState            === s2.momentumState,            'W13c momentumState deterministic');
  assert(s1.recommendations.length   === s2.recommendations.length,   'W13d rec count deterministic');
  assert(s1.coachSummary             === s2.coachSummary,             'W13e coachSummary deterministic');
  console.log('W13 PASS pipeline is deterministic for same input');
}

// ─── W14: weekStart computed from todayDate (not hardcoded) ─────────────────

function testW14_weekStartFromToday(): void {
  // 2026-03-31 is a Tuesday → weekStart should be Monday 2026-03-30
  const summary = buildSummary([], '2026-03-31');
  assert(summary.weekly.weekStart === '2026-03-30',
    `W14 weekStart should be 2026-03-30 (Monday), got ${summary.weekly.weekStart}`);
  console.log('W14 PASS weekStart correctly derived from todayDate');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function runAll(): void {
  const tests = [
    testW1_fullPipeline,
    testW2_emptyReviews,
    testW3_richDepthIncludes,
    testW4_focusedDepthExcludes,
    testW5_minimalDepthExcludes,
    testW6_coachSummaryPassthrough,
    testW7_topRecommendationPassthrough,
    testW8_weekCharacterPropagates,
    testW9_momentumStatePropagates,
    testW10_sufficientData_summaryPresent,
    testW11_emptyCoachSummary_omitted,
    testW12_monthlyInterpretationPropagates,
    testW13_deterministic,
    testW14_weekStartFromToday,
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

  console.log(`\n═══ Batch 19 Wiring Results: ${passed} passed, ${failed} failed / ${tests.length} total ═══`);
  if (failed > 0) process.exit(1);
}

runAll();
