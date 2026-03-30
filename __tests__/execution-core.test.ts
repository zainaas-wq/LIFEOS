/**
 * LifeOS Execution Core — Unit Tests
 *
 * Covers:
 *   - driftEngine.ts  (computeDayMode, computeDriftEvent, computeWhyThisNow)
 *   - recoveryActions.ts (all 4 modes + dispatch)
 *
 * ── HOW TO RUN ─────────────────────────────────────────────────────────────────
 *
 * This project has no test runner configured. Two options:
 *
 * Option A — Install jest-expo (recommended for CI):
 *   npm install --save-dev jest-expo jest @types/jest
 *   then add to package.json:
 *     "jest": { "preset": "jest-expo" }
 *   then run:
 *     npx jest __tests__/execution-core.test.ts
 *
 * Option B — tsx with rn-mock (quickest for local dev):
 *   npx tsx --conditions=require-main-fields:none __tests__/execution-core-node.ts
 *   (see __tests__/execution-core-node.ts below — self-contained, no RN deps)
 *
 * ── WHY tsx FAILS DIRECTLY ─────────────────────────────────────────────────────
 *
 * Import chain: driftEngine → planGenerator → utils.ts → Platform (react-native)
 * esbuild (used by tsx) cannot parse react-native's Flow-typed index.js.
 * This is expected for an Expo project without a jest-expo preset.
 * The fix is jest-expo, which mocks react-native modules automatically.
 *
 * ── JEST TESTS (for jest-expo environment) ─────────────────────────────────────
 */

import { computeDayMode, computeDriftEvent, computeWhyThisNow } from '../src/ai/driftEngine';
import {
  applySaveMyDay,
  applyCriticalOnly,
  applyResumeFromNow,
  applyCompressDay,
  applyRecoveryMode,
} from '../src/ai/recoveryActions';
import type {
  PressureInfo,
  BehaviorState,
  DailyDecision,
  PlanItem,
  Goal,
  DistractionLog,
} from '../src/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePressure(overrides?: Partial<PressureInfo>): PressureInfo {
  return { level: 'normal', grade: 0, remainingMins: 240, requiredMins: 120, timeRatio: 0.5, ...overrides };
}
function makeBehavior(overrides?: Partial<BehaviorState>): BehaviorState {
  return { dayState: 'in_task', driftLevel: 0, lastInteractionTime: null, currentConstraintId: null, recoveryStartedAt: null, recoveryDurationMins: 0, lateStartDetectedAt: null, ...overrides };
}
function makeDecision(overrides?: Partial<DailyDecision>): DailyDecision {
  return { date: '2026-03-28', mustDoItems: [], atRiskGoals: [], missedCarryover: [], minimumViableDay: 'Complete critical task', driftScore: 0, isInRecoveryMode: false, generatedAt: new Date().toISOString(), ...overrides };
}
function makeItem(overrides?: Partial<PlanItem>): PlanItem {
  return { id: 'item-1', startTime: '09:00', endTime: '10:00', title: 'Deep Work Session', type: 'goal', completed: false, ...overrides };
}
function makeGoal(overrides?: Partial<Goal>): Goal {
  return { id: 'goal-1', title: 'Launch Product', category: 'career', priority: 1, weeklyHoursTarget: 10, createdAt: '2026-01-01T00:00:00Z', ...overrides };
}
function makeDistraction(n: number): DistractionLog[] {
  return Array.from({ length: n }, (_, i) => ({ id: `d${i}`, timestamp: `2026-03-28T${10 + i}:00:00Z` }));
}

const TODAY = '2026-03-28';
const NOW = 540; // 09:00

// ─── computeDayMode ───────────────────────────────────────────────────────────

describe('computeDayMode', () => {
  it('returns ON_TRACK when no signals', () => {
    expect(computeDayMode(makePressure(), makeBehavior(), makeDecision(), 0)).toBe('ON_TRACK');
  });
  it('returns DRIFTING when pressureGrade >= 2', () => {
    expect(computeDayMode(makePressure({ grade: 2 }), makeBehavior(), makeDecision(), 0)).toBe('DRIFTING');
  });
  it('returns DRIFTING when driftLevel >= 2', () => {
    expect(computeDayMode(makePressure(), makeBehavior({ driftLevel: 2 }), makeDecision(), 0)).toBe('DRIFTING');
  });
  it('returns DRIFTING when driftScore >= 40', () => {
    expect(computeDayMode(makePressure(), makeBehavior(), makeDecision({ driftScore: 40 }), 0)).toBe('DRIFTING');
  });
  it('returns DRIFTING when taskSkipCount >= 3', () => {
    expect(computeDayMode(makePressure(), makeBehavior(), makeDecision(), 3)).toBe('DRIFTING');
  });
  it('returns CRITICAL when pressureGrade >= 3', () => {
    expect(computeDayMode(makePressure({ grade: 3 }), makeBehavior(), makeDecision(), 0)).toBe('CRITICAL');
  });
  it('returns CRITICAL when driftLevel >= 3', () => {
    expect(computeDayMode(makePressure(), makeBehavior({ driftLevel: 3 }), makeDecision(), 0)).toBe('CRITICAL');
  });
  it('returns CRITICAL when driftScore >= 70', () => {
    expect(computeDayMode(makePressure(), makeBehavior(), makeDecision({ driftScore: 70 }), 0)).toBe('CRITICAL');
  });
  it('CRITICAL wins over RECOVERY', () => {
    expect(computeDayMode(
      makePressure({ grade: 3 }),
      makeBehavior({ dayState: 'in_recovery' }),
      makeDecision({ isInRecoveryMode: true }),
      0,
    )).toBe('CRITICAL');
  });
  it('returns RECOVERY when dayState is in_recovery', () => {
    expect(computeDayMode(makePressure(), makeBehavior({ dayState: 'in_recovery' }), makeDecision(), 0)).toBe('RECOVERY');
  });
  it('returns RECOVERY when dailyDecision.isInRecoveryMode', () => {
    expect(computeDayMode(makePressure(), makeBehavior(), makeDecision({ isInRecoveryMode: true }), 0)).toBe('RECOVERY');
  });
  it('returns null dailyDecision as ON_TRACK default', () => {
    expect(computeDayMode(makePressure(), makeBehavior(), null, 0)).toBe('ON_TRACK');
  });
});

// ─── computeDriftEvent ────────────────────────────────────────────────────────

function drift(overrides?: {
  pressure?: Partial<PressureInfo>; behavior?: Partial<BehaviorState>;
  items?: PlanItem[]; decision?: Partial<DailyDecision>;
  distractions?: DistractionLog[]; skips?: number; nowMins?: number;
}) {
  return computeDriftEvent({
    pressure: makePressure(overrides?.pressure),
    behaviorState: makeBehavior(overrides?.behavior),
    planItems: overrides?.items ?? [makeItem()],
    dailyDecision: makeDecision(overrides?.decision),
    distractionLogs: overrides?.distractions ?? [],
    taskSkipCount: overrides?.skips ?? 0,
    nowMins: overrides?.nowMins ?? NOW,
    today: TODAY,
  });
}

describe('computeDriftEvent', () => {
  it('returns null when on track', () => {
    expect(drift()).toBeNull();
  });

  describe('overload', () => {
    it('detects overload when timeRatio > 1.3 and remainingMins > 0', () => {
      expect(drift({ pressure: { timeRatio: 1.4, grade: 2, remainingMins: 100, requiredMins: 140, level: 'elevated' } })?.type).toBe('overload');
    });
    it('high severity when over by >= 60 min', () => {
      expect(drift({ pressure: { timeRatio: 2.0, grade: 3, remainingMins: 60, requiredMins: 180, level: 'critical' } })?.severity).toBe('high');
    });
    it('medium severity when over by < 60 min', () => {
      expect(drift({ pressure: { timeRatio: 1.4, grade: 2, remainingMins: 100, requiredMins: 140, level: 'elevated' } })?.severity).toBe('medium');
    });
    it('includes compress_day in recovery options', () => {
      expect(drift({ pressure: { timeRatio: 1.4, grade: 2, remainingMins: 100, requiredMins: 140, level: 'elevated' } })?.recoveryOptions).toContain('compress_day');
    });
    it('no overload when remainingMins = 0', () => {
      expect(drift({ pressure: { timeRatio: 2.0, grade: 3, remainingMins: 0, requiredMins: 120, level: 'critical' }, items: [] })).toBeNull();
    });
    it('overload wins priority over late_start', () => {
      const expiredItem = makeItem({ startTime: '07:00', endTime: '08:00' });
      expect(drift({
        pressure: { timeRatio: 1.4, grade: 2, remainingMins: 100, requiredMins: 140, level: 'elevated' },
        behavior: { lateStartDetectedAt: '2026-03-28T07:00:00Z', dayState: 'late_start' },
        items: [expiredItem], nowMins: 600,
      })?.type).toBe('overload');
    });
  });

  describe('late_start', () => {
    const expiredItem = makeItem({ startTime: '07:00', endTime: '08:00' });
    it('detects late_start when flag set and expired items exist', () => {
      expect(drift({
        behavior: { lateStartDetectedAt: '2026-03-28T07:00:00Z', dayState: 'late_start' },
        items: [expiredItem], nowMins: 600,
      })?.type).toBe('late_start');
    });
    it('no late_start when all expired items are completed', () => {
      expect(drift({
        behavior: { lateStartDetectedAt: '2026-03-28T07:00:00Z', dayState: 'late_start' },
        items: [{ ...expiredItem, completed: true }], nowMins: 600,
      })).toBeNull();
    });
    it('includes resume_now in recovery options', () => {
      expect(drift({
        behavior: { lateStartDetectedAt: '2026-03-28T07:00:00Z', dayState: 'late_start' },
        items: [expiredItem], nowMins: 600,
      })?.recoveryOptions).toContain('resume_now');
    });
  });

  describe('avoidance', () => {
    it('detects avoidance when taskSkipCount >= 2', () => {
      expect(drift({ skips: 2 })?.type).toBe('avoidance');
    });
    it('high severity when skips >= 4', () => {
      expect(drift({ skips: 4 })?.severity).toBe('high');
    });
    it('medium severity when skips = 2–3', () => {
      expect(drift({ skips: 2 })?.severity).toBe('medium');
    });
    it('includes critical_only in recovery options', () => {
      expect(drift({ skips: 2 })?.recoveryOptions).toContain('critical_only');
    });
  });

  describe('distraction', () => {
    it('detects distraction when todayDistractions >= 3', () => {
      expect(drift({ distractions: makeDistraction(3) })?.type).toBe('distraction');
    });
    it('high severity when >= 5 today', () => {
      expect(drift({ distractions: makeDistraction(5) })?.severity).toBe('high');
    });
    it('detects distraction from driftLevel >= 3', () => {
      expect(drift({ behavior: { driftLevel: 3 } })?.type).toBe('distraction');
    });
  });

  describe('fragmented_day', () => {
    const multiItems = [
      makeItem({ id: 'i1' }),
      makeItem({ id: 'i2' }),
      makeItem({ id: 'i3' }),
    ];
    it('detects fragmented_day when mid-day, low completion, >=1 skip, >=3 items', () => {
      expect(drift({ items: multiItems, skips: 1, nowMins: 780 })?.type).toBe('fragmented_day');
    });
    it('no fragmented_day before 12:00', () => {
      expect(drift({ items: multiItems, skips: 1, nowMins: 660 })).toBeNull();
    });
  });
});

// ─── computeWhyThisNow ────────────────────────────────────────────────────────

describe('computeWhyThisNow', () => {
  it('returns null when item is null', () => {
    expect(computeWhyThisNow(null, [], makeDecision(), makePressure())).toBeNull();
  });
  it('sets urgency = critical for isCritical item', () => {
    expect(computeWhyThisNow(makeItem({ isCritical: true }), [], makeDecision(), makePressure())?.urgencyLevel).toBe('critical');
  });
  it('sets reason = why_critical_task for isCritical', () => {
    expect(computeWhyThisNow(makeItem({ isCritical: true }), [], makeDecision(), makePressure())?.reason).toBe('home.why_critical_task');
  });
  it('sets urgency = critical for pressureGrade >= 3', () => {
    expect(computeWhyThisNow(makeItem(), [], makeDecision(), makePressure({ grade: 3 }))?.urgencyLevel).toBe('critical');
  });
  it('sets urgency = high for must-do item', () => {
    expect(computeWhyThisNow(
      makeItem({ title: 'Deep Work Session' }), [],
      makeDecision({ mustDoItems: ['Deep Work Session'] }),
      makePressure(),
    )?.urgencyLevel).toBe('high');
  });
  it('sets reason = why_must_do for must-do items', () => {
    expect(computeWhyThisNow(
      makeItem({ title: 'Deep Work Session' }), [],
      makeDecision({ mustDoItems: ['Deep Work Session'] }),
      makePressure(),
    )?.reason).toBe('home.why_must_do');
  });
  it('sets urgency = high for at-risk goal', () => {
    expect(computeWhyThisNow(
      makeItem({ goalId: 'goal-1' }),
      [makeGoal({ id: 'goal-1' })],
      makeDecision({
        atRiskGoals: [{ goalId: 'goal-1', goalTitle: 'Launch Product', weeklyHoursTarget: 10, loggedHoursThisWeek: 2, shortfallHours: 5, daysRemainingInWeek: 3, isAtRisk: true, hoursNeededPerRemainingDay: 2.5 }],
      }),
      makePressure(),
    )?.urgencyLevel).toBe('high');
  });
  it('includes goalTitle when item has goalId matching a goal', () => {
    expect(computeWhyThisNow(
      makeItem({ goalId: 'goal-1' }),
      [makeGoal({ id: 'goal-1', title: 'Launch Product' })],
      makeDecision(),
      makePressure(),
    )?.goalTitle).toBe('Launch Product');
  });
  it('sets urgency = normal and reason = why_highest_priority as default', () => {
    const why = computeWhyThisNow(makeItem(), [], makeDecision(), makePressure());
    expect(why?.urgencyLevel).toBe('normal');
    expect(why?.reason).toBe('home.why_highest_priority');
  });
  it('detects imminent deadline (<=2 days)', () => {
    const in2days = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    expect(computeWhyThisNow(
      makeItem({ goalId: 'g-dl' }),
      [makeGoal({ id: 'g-dl', deadline: in2days })],
      makeDecision(),
      makePressure(),
    )?.reason).toBe('home.why_deadline_imminent');
  });
});

// ─── applySaveMyDay ───────────────────────────────────────────────────────────

describe('applySaveMyDay', () => {
  const criticalItem  = makeItem({ id: 'c1', isCritical: true, title: 'Critical Task' });
  const mustDo1       = makeItem({ id: 'm1', title: 'Must Do 1' });
  const mustDo2       = makeItem({ id: 'm2', title: 'Must Do 2' });
  const lowPriItem    = makeItem({ id: 'l1', title: 'Low Priority' });
  const decisionWithMustDo = makeDecision({ mustDoItems: ['Must Do 1', 'Must Do 2'] });
  const fullItems = [criticalItem, mustDo1, mustDo2, lowPriItem];

  let result: PlanItem[];
  beforeEach(() => { result = applySaveMyDay(fullItems, decisionWithMustDo, NOW); });

  it('critical item is NOT deferred', () => { expect(result.find(i => i.id === 'c1')?.completed).toBeFalsy(); });
  it('must-do items are NOT deferred', () => {
    expect(result.find(i => i.id === 'm1')?.completed).toBeFalsy();
    expect(result.find(i => i.id === 'm2')?.completed).toBeFalsy();
  });
  it('low priority item IS deferred', () => { expect(result.find(i => i.id === 'l1')?.completed).toBe(true); });
  it('deferred item has [deferred_by_recovery] in notes', () => {
    expect(result.find(i => i.id === 'l1')?.notes).toContain('[deferred_by_recovery]');
  });
  it('total item count is unchanged', () => { expect(result.length).toBe(fullItems.length); });
  it('fallback: keeps first item when no critical or must-do', () => {
    const items = [makeItem({ id: 'a1', title: 'A' }), makeItem({ id: 'a2', title: 'B' })];
    const r = applySaveMyDay(items, makeDecision(), NOW);
    expect(r.find(i => i.id === 'a1')?.completed).toBeFalsy();
    expect(r.find(i => i.id === 'a2')?.completed).toBe(true);
  });
});

// ─── applyCriticalOnly ────────────────────────────────────────────────────────

describe('applyCriticalOnly', () => {
  const criticalItem = makeItem({ id: 'c1', isCritical: true, title: 'Critical Task' });
  const mustDo1      = makeItem({ id: 'm1', title: 'Must Do 1' });
  const mustDo2      = makeItem({ id: 'm2', title: 'Must Do 2' });
  const lowPriItem   = makeItem({ id: 'l1', title: 'Low Priority' });
  const fullItems = [criticalItem, mustDo1, mustDo2, lowPriItem];

  it('critical item is NOT deferred', () => {
    expect(applyCriticalOnly(fullItems, ['Must Do 1']).find(i => i.id === 'c1')?.completed).toBeFalsy();
  });
  it('must-do items ARE deferred when critical exists', () => {
    expect(applyCriticalOnly(fullItems, ['Must Do 1']).find(i => i.id === 'm1')?.completed).toBe(true);
  });
  it('low priority IS deferred', () => {
    expect(applyCriticalOnly(fullItems, ['Must Do 1']).find(i => i.id === 'l1')?.completed).toBe(true);
  });
  it('no critical: first must-do kept', () => {
    const result = applyCriticalOnly([mustDo1, mustDo2, lowPriItem], ['Must Do 1']);
    expect(result.find(i => i.id === 'm1')?.completed).toBeFalsy();
    expect(result.find(i => i.id === 'm2')?.completed).toBe(true);
  });
});

// ─── applyResumeFromNow ───────────────────────────────────────────────────────

describe('applyResumeFromNow', () => {
  const items: PlanItem[] = [
    makeItem({ id: 'r1', startTime: '07:00', endTime: '08:00' }),
    makeItem({ id: 'r2', startTime: '09:00', endTime: '10:00' }),
    makeItem({ id: 'r3', startTime: '11:00', endTime: '12:00' }),
  ];
  // timeToMins helper (inline to avoid react-native dep in test)
  function tMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

  it('first item starts at 10:00 (now = 600)', () => {
    expect(applyResumeFromNow(items, 600).find(i => i.id === 'r1')?.startTime).toBe('10:00');
  });
  it('second item starts 5 min after first ends (10:00 + 60 + 5 = 11:05)', () => {
    expect(applyResumeFromNow(items, 600).find(i => i.id === 'r2')?.startTime).toBe('11:05');
  });
  it('durations are preserved', () => {
    const result = applyResumeFromNow(items, 600);
    const r1 = result.find(i => i.id === 'r1')!;
    expect(tMins(r1.endTime) - tMins(r1.startTime)).toBe(60);
  });
  it('constraint items keep original time', () => {
    const constraint = makeItem({ id: 'con', startTime: '14:00', endTime: '15:00', blockKind: 'constraint', type: 'event' });
    const result = applyResumeFromNow([...items, constraint], 600);
    expect(result.find(i => i.id === 'con')?.startTime).toBe('14:00');
  });
  it('completed items keep their original times', () => {
    const done = makeItem({ id: 'done', startTime: '07:00', endTime: '08:00', completed: true });
    const result = applyResumeFromNow([done, ...items], 600);
    expect(result.find(i => i.id === 'done')?.startTime).toBe('07:00');
  });
  it('items that cannot fit are deferred', () => {
    const manyItems = Array.from({ length: 30 }, (_, i) =>
      makeItem({ id: `late${i}`, startTime: '09:00', endTime: '10:00' }));
    const result = applyResumeFromNow(manyItems, 1380);
    expect(result.some(i => i.completed && i.notes?.includes('[deferred_by_recovery]'))).toBe(true);
  });
});

// ─── applyCompressDay ─────────────────────────────────────────────────────────

describe('applyCompressDay', () => {
  function tMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  const items: PlanItem[] = [
    makeItem({ id: 'cp1', startTime: '10:00', endTime: '11:00' }), // 60 min
    makeItem({ id: 'cp2', startTime: '12:00', endTime: '13:30' }), // 90 min
  ];

  it('60 min session compressed to 42 min (70% of 60)', () => {
    const result = applyCompressDay(items, 600);
    const dur = tMins(result.find(i => i.id === 'cp1')!.endTime) - tMins(result.find(i => i.id === 'cp1')!.startTime);
    expect(dur).toBe(42);
  });
  it('compressed item has sizingMode = condensed', () => {
    expect(applyCompressDay(items, 600).find(i => i.id === 'cp1')?.sizingMode).toBe('condensed');
  });
  it('minimum duration floor: never below 15 min', () => {
    const short = makeItem({ id: 'sh', startTime: '10:00', endTime: '10:20' }); // 20 min → 14 min → should be 15
    const result = applyCompressDay([short], 600);
    const dur = tMins(result[0].endTime) - tMins(result[0].startTime);
    expect(dur).toBeGreaterThanOrEqual(15);
  });
  it('items start from nowMins after compression', () => {
    expect(applyCompressDay(items, 600).find(i => i.id === 'cp1')?.startTime).toBe('10:00');
  });
});

// ─── applyRecoveryMode dispatch ───────────────────────────────────────────────

describe('applyRecoveryMode dispatch', () => {
  const criticalItem = makeItem({ id: 'c1', isCritical: true });
  const lowItem      = makeItem({ id: 'l1' });
  const decision     = makeDecision({ mustDoItems: [] });

  it('save_day — defers non-critical items', () => {
    expect(applyRecoveryMode('save_day', [criticalItem, lowItem], decision, NOW)
      .find(i => i.id === 'l1')?.completed).toBe(true);
  });
  it('critical_only — keeps only critical item', () => {
    expect(applyRecoveryMode('critical_only', [criticalItem, lowItem], decision, NOW)
      .find(i => i.id === 'c1')?.completed).toBeFalsy();
  });
  it('resume_now — shifts items to start from now', () => {
    const old = [makeItem({ id: 'r1', startTime: '07:00', endTime: '08:00' })];
    expect(applyRecoveryMode('resume_now', old, null, 600).find(i => i.id === 'r1')?.startTime).toBe('10:00');
  });
  it('compress_day — reduces session duration', () => {
    function tMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
    const item = makeItem({ id: 'cp1', startTime: '10:00', endTime: '11:00' });
    const result = applyRecoveryMode('compress_day', [item], null, 600);
    expect(tMins(result[0].endTime) - tMins(result[0].startTime)).toBeLessThan(60);
  });
});
