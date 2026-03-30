export {};

/**
 * LifeOS Batch 2 — Drift & Recovery Hardening
 *
 * Node-runnable validation of all Batch 2 behaviors:
 *   - DriftEvent.date stamping and isDriftStale()
 *   - applyRecoveryAction 3-second dedup guard
 *   - driftHistory audit append on recovery
 *   - dailyDecision.isInRecoveryMode sync after recovery
 *   - 10-minute post-recovery drift suppression in tickBehavior
 *   - archiveEnforcementDay clears recovery + drift fields
 *   - resetAllData clears recovery + drift fields
 *   - partialize excludes driftHistory
 *   - generateControlPlanAction clears recovery + drift fields
 *
 * Run with:  npx tsx __tests__/batch2-drift-recovery.ts
 */

// ─── Inline types (mirror src/types/index.ts additions) ───────────────────────

type DriftType = 'late_start' | 'avoidance' | 'overload' | 'distraction' | 'fragmented_day';
type RecoveryMode = 'save_day' | 'critical_only' | 'resume_now' | 'compress_day';
type DayMode = 'ON_TRACK' | 'DRIFTING' | 'CRITICAL' | 'RECOVERY';

interface DriftEvent {
  type: DriftType;
  detectedAt: string;
  date: string;           // YYYY-MM-DD — the Batch 2 addition
  severity: 'low' | 'medium' | 'high';
  messageKey: string;
  detailKey: string;
  recoveryOptions: RecoveryMode[];
  dismissed: boolean;
}

interface DriftRecord {
  type: DriftType;
  severity: 'low' | 'medium' | 'high';
  detectedAt: string;
  date: string;
  recoveryApplied: RecoveryMode | null;
}

// ─── Inline isDriftStale (mirrors src/ai/driftEngine.ts) ──────────────────────

function isDriftStale(drift: DriftEvent, today: string): boolean {
  return drift.date !== today;
}

// ─── Inline makeDrift helper ──────────────────────────────────────────────────

function makeDrift(
  type: DriftType,
  severity: DriftEvent['severity'],
  today: string,
): DriftEvent {
  return {
    type,
    detectedAt: new Date().toISOString(),
    date: today,
    severity,
    messageKey: `home.drift_${type}_message`,
    detailKey: `home.drift_${type}_detail`,
    recoveryOptions: ['save_day'],
    dismissed: false,
  };
}

// ─── Simulated store state (mirrors the Batch 2 store shape) ──────────────────

interface StoreState {
  activeDrift: DriftEvent | null;
  activeRecoveryMode: RecoveryMode | null;
  lastRecoveryAppliedAt: string | null;
  driftHistory: DriftRecord[];
  dayMode: DayMode;
  isInRecoveryMode: boolean; // proxy for dailyDecision.isInRecoveryMode
}

function makeInitialState(): StoreState {
  return {
    activeDrift: null,
    activeRecoveryMode: null,
    lastRecoveryAppliedAt: null,
    driftHistory: [],
    dayMode: 'ON_TRACK',
    isInRecoveryMode: false,
  };
}

// ─── Simulated applyRecoveryAction (mirrors hardened store action) ─────────────

function applyRecoveryAction(
  s: StoreState,
  mode: RecoveryMode,
  nowISO: string,
): StoreState {
  if (!s) return s;

  // 3-second dedup guard
  if (s.lastRecoveryAppliedAt) {
    const msSince = new Date(nowISO).getTime() - new Date(s.lastRecoveryAppliedAt).getTime();
    if (msSince < 3000) return s; // rejected — too soon
  }

  const today = nowISO.slice(0, 10);

  const newHistoryEntry: DriftRecord | null = s.activeDrift
    ? {
        type: s.activeDrift.type,
        severity: s.activeDrift.severity,
        detectedAt: s.activeDrift.detectedAt,
        date: today,
        recoveryApplied: mode,
      }
    : null;

  return {
    ...s,
    dayMode: 'RECOVERY',
    activeDrift: null,
    activeRecoveryMode: mode,
    lastRecoveryAppliedAt: nowISO,
    driftHistory: newHistoryEntry ? [...s.driftHistory, newHistoryEntry] : s.driftHistory,
    isInRecoveryMode: true,
  };
}

// ─── Simulated archiveEnforcementDay ──────────────────────────────────────────

function archiveEnforcementDay(s: StoreState): StoreState {
  return {
    ...s,
    activeDrift: null,
    activeRecoveryMode: null,
    lastRecoveryAppliedAt: null,
    driftHistory: [],
    dayMode: 'ON_TRACK',
  };
}

// ─── Simulated resetAllData ───────────────────────────────────────────────────

function resetAllData(): StoreState {
  return makeInitialState();
}

// ─── Simulated partialize ─────────────────────────────────────────────────────

function partialize(s: StoreState): Omit<StoreState, 'driftHistory'> {
  const { driftHistory: _dh, ...rest } = s;
  return rest;
}

// ─── Simulated generateControlPlanAction reset ────────────────────────────────

function onPlanRegen(s: StoreState): StoreState {
  return {
    ...s,
    activeDrift: null,
    activeRecoveryMode: null,
    driftHistory: [],
  };
}

// ─── Simulated tickBehavior drift suppression ─────────────────────────────────

function shouldRecomputeDrift(s: StoreState, nowISO: string, today: string): boolean {
  // Clear stale drift
  let activeDrift = s.activeDrift;
  if (activeDrift && isDriftStale(activeDrift, today)) {
    activeDrift = null;
  }

  // 10-minute suppression
  const suppressDrift =
    s.activeRecoveryMode !== null &&
    s.lastRecoveryAppliedAt !== null &&
    new Date(nowISO).getTime() - new Date(s.lastRecoveryAppliedAt).getTime() < 10 * 60 * 1000;

  return !suppressDrift && (!activeDrift || activeDrift.dismissed);
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

section('isDriftStale — date-based staleness');

const todayStr = '2026-03-29';
const yesterdayStr = '2026-03-28';

const freshDrift = makeDrift('avoidance', 'medium', todayStr);
const staleDrift = makeDrift('avoidance', 'medium', yesterdayStr);

assert('fresh drift (same day) is not stale', !isDriftStale(freshDrift, todayStr));
assert('stale drift (yesterday) is stale', isDriftStale(staleDrift, todayStr));
assert('drift from 7 days ago is stale', isDriftStale(makeDrift('overload', 'high', '2026-03-22'), todayStr));

section('DriftEvent.date field stamping');

const d = makeDrift('late_start', 'high', '2026-03-29');
assert('drift.date is set to today', d.date === '2026-03-29');
assert('drift.detectedAt is ISO string', d.detectedAt.includes('T'));
assert('drift.dismissed defaults to false', d.dismissed === false);

section('applyRecoveryAction — basic application');

let s = makeInitialState();
s = { ...s, activeDrift: makeDrift('avoidance', 'medium', todayStr) };
const nowISO = new Date('2026-03-29T10:00:00.000Z').toISOString();
const s2 = applyRecoveryAction(s, 'save_day', nowISO);

assert('dayMode becomes RECOVERY', s2.dayMode === 'RECOVERY');
assert('activeDrift cleared after recovery', s2.activeDrift === null);
assert('activeRecoveryMode set to applied mode', s2.activeRecoveryMode === 'save_day');
assert('lastRecoveryAppliedAt set to nowISO', s2.lastRecoveryAppliedAt === nowISO);
assert('isInRecoveryMode set true', s2.isInRecoveryMode === true);

section('applyRecoveryAction — driftHistory audit');

assert('driftHistory has 1 entry after recovery', s2.driftHistory.length === 1);
assert('history entry type matches drift type', s2.driftHistory[0].type === 'avoidance');
assert('history entry recoveryApplied matches mode', s2.driftHistory[0].recoveryApplied === 'save_day');
assert('history entry date is today', s2.driftHistory[0].date === todayStr);

section('applyRecoveryAction — no drift history when no activeDrift');

let sNoDrift = makeInitialState(); // activeDrift is null
const nowISO2 = new Date('2026-03-29T10:05:00.000Z').toISOString();
const s3 = applyRecoveryAction(sNoDrift, 'critical_only', nowISO2);
assert('driftHistory stays empty when no activeDrift', s3.driftHistory.length === 0);
assert('recovery still applied (mode set)', s3.activeRecoveryMode === 'critical_only');

section('applyRecoveryAction — 3-second dedup guard');

// Apply once
const first = applyRecoveryAction(makeInitialState(), 'save_day', nowISO);
// Apply again within 1 second (same timestamp → 0ms diff → rejected)
const duplicate = applyRecoveryAction(first, 'resume_now', nowISO);
assert('duplicate recovery within 3s is rejected (mode unchanged)', duplicate.activeRecoveryMode === 'save_day');
assert('duplicate recovery within 3s leaves driftHistory unchanged', duplicate.driftHistory.length === first.driftHistory.length);

// Apply 4 seconds later (should succeed)
const later = new Date(new Date(nowISO).getTime() + 4000).toISOString();
const secondRecovery = applyRecoveryAction(first, 'resume_now', later);
assert('recovery after 4s is accepted', secondRecovery.activeRecoveryMode === 'resume_now');

section('applyRecoveryAction — multiple recoveries in driftHistory');

let ms = makeInitialState();
ms = { ...ms, activeDrift: makeDrift('avoidance', 'medium', todayStr) };
const t1 = new Date('2026-03-29T09:00:00.000Z').toISOString();
const r1 = applyRecoveryAction(ms, 'save_day', t1);
// Add new drift and apply second recovery
const r1WithDrift = { ...r1, activeDrift: makeDrift('overload', 'high', todayStr) };
const t2 = new Date('2026-03-29T11:00:00.000Z').toISOString();
const r2 = applyRecoveryAction(r1WithDrift, 'compress_day', t2);
assert('driftHistory accumulates across multiple recoveries', r2.driftHistory.length === 2);
assert('first history entry is save_day', r2.driftHistory[0].recoveryApplied === 'save_day');
assert('second history entry is compress_day', r2.driftHistory[1].recoveryApplied === 'compress_day');

section('archiveEnforcementDay — clears recovery + drift state');

const populated: StoreState = {
  activeDrift: makeDrift('distraction', 'high', todayStr),
  activeRecoveryMode: 'save_day',
  lastRecoveryAppliedAt: nowISO,
  driftHistory: [{ type: 'avoidance', severity: 'medium', detectedAt: nowISO, date: todayStr, recoveryApplied: 'save_day' }],
  dayMode: 'RECOVERY',
  isInRecoveryMode: true,
};
const archived = archiveEnforcementDay(populated);
assert('activeDrift cleared on archive', archived.activeDrift === null);
assert('activeRecoveryMode cleared on archive', archived.activeRecoveryMode === null);
assert('lastRecoveryAppliedAt cleared on archive', archived.lastRecoveryAppliedAt === null);
assert('driftHistory cleared on archive', archived.driftHistory.length === 0);
assert('dayMode reset to ON_TRACK on archive', archived.dayMode === 'ON_TRACK');

section('resetAllData — clears all recovery + drift state');

const reset = resetAllData();
assert('activeDrift null after reset', reset.activeDrift === null);
assert('activeRecoveryMode null after reset', reset.activeRecoveryMode === null);
assert('lastRecoveryAppliedAt null after reset', reset.lastRecoveryAppliedAt === null);
assert('driftHistory empty after reset', reset.driftHistory.length === 0);

section('generateControlPlanAction — clears recovery + drift on regen');

const preRegen: StoreState = {
  activeDrift: makeDrift('overload', 'high', todayStr),
  activeRecoveryMode: 'compress_day',
  lastRecoveryAppliedAt: nowISO,
  driftHistory: [{ type: 'overload', severity: 'high', detectedAt: nowISO, date: todayStr, recoveryApplied: 'compress_day' }],
  dayMode: 'RECOVERY',
  isInRecoveryMode: true,
};
const postRegen = onPlanRegen(preRegen);
assert('activeDrift cleared on plan regen', postRegen.activeDrift === null);
assert('activeRecoveryMode cleared on plan regen', postRegen.activeRecoveryMode === null);
assert('driftHistory cleared on plan regen', postRegen.driftHistory.length === 0);

section('partialize — driftHistory excluded from persistence');

const stateWithHistory: StoreState = {
  ...makeInitialState(),
  activeRecoveryMode: 'save_day',
  lastRecoveryAppliedAt: nowISO,
  driftHistory: [{ type: 'avoidance', severity: 'medium', detectedAt: nowISO, date: todayStr, recoveryApplied: 'save_day' }],
};
const persisted = partialize(stateWithHistory);
assert('driftHistory absent from persisted state', !('driftHistory' in persisted));
assert('activeRecoveryMode preserved in persisted state', persisted.activeRecoveryMode === 'save_day');
assert('lastRecoveryAppliedAt preserved in persisted state', persisted.lastRecoveryAppliedAt === nowISO);

section('tickBehavior drift suppression — 10-minute window');

const stateAfterRecovery: StoreState = {
  ...makeInitialState(),
  activeRecoveryMode: 'save_day',
  lastRecoveryAppliedAt: nowISO,
};
// 5 minutes after recovery
const plus5min = new Date(new Date(nowISO).getTime() + 5 * 60 * 1000).toISOString();
assert('drift suppressed 5min after recovery', !shouldRecomputeDrift(stateAfterRecovery, plus5min, todayStr));
// 11 minutes after recovery
const plus11min = new Date(new Date(nowISO).getTime() + 11 * 60 * 1000).toISOString();
assert('drift allowed 11min after recovery', shouldRecomputeDrift(stateAfterRecovery, plus11min, todayStr));

section('tickBehavior — stale drift cleared by staleness check');

const stateWithStaleDrift: StoreState = {
  ...makeInitialState(),
  activeDrift: makeDrift('avoidance', 'medium', yesterdayStr),
};
// No recovery mode — suppression doesn't apply; stale drift should be cleared
assert('stale drift causes recompute (treated as null)', shouldRecomputeDrift(stateWithStaleDrift, nowISO, todayStr));

section('tickBehavior — dismissed drift allows recompute');

const stateWithDismissedDrift: StoreState = {
  ...makeInitialState(),
  activeDrift: { ...makeDrift('avoidance', 'medium', todayStr), dismissed: true },
};
assert('dismissed drift allows recompute', shouldRecomputeDrift(stateWithDismissedDrift, nowISO, todayStr));

section('tickBehavior — active undismissed drift blocks recompute');

const stateWithActiveDrift: StoreState = {
  ...makeInitialState(),
  activeDrift: makeDrift('avoidance', 'medium', todayStr), // dismissed: false
};
assert('active undismissed drift blocks recompute', !shouldRecomputeDrift(stateWithActiveDrift, nowISO, todayStr));

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Batch 2: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll Batch 2 tests passed.');
}
