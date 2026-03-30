/**
 * LifeOS Execution Core — Node-runnable validation
 *
 * Self-contained: inlines all logic to avoid the
 * react-native → utils.ts → Platform dep chain.
 *
 * Run with:  npx tsx __tests__/execution-core-node.ts
 *
 * This file is NOT a substitute for the jest test suite.
 * It validates engine logic in a plain node environment.
 */

// ─── Inline pure helpers (avoid react-native dep chain) ───────────────────────

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minsToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// ─── Inline engine logic (copy of driftEngine + recoveryActions pure fns) ─────
// We duplicate only the pure logic to avoid the import chain.
// The authoritative source is src/ai/driftEngine.ts and src/ai/recoveryActions.ts.

type DayMode   = 'ON_TRACK' | 'DRIFTING' | 'CRITICAL' | 'RECOVERY';
type DriftType = 'late_start' | 'avoidance' | 'overload' | 'distraction' | 'fragmented_day';
type RecoveryMode = 'save_day' | 'critical_only' | 'resume_now' | 'compress_day';

interface Pressure { grade: 0|1|2|3; timeRatio: number; remainingMins: number; requiredMins: number; }
interface BehaviorState { dayState: string; driftLevel: number; lateStartDetectedAt: string | null; }
interface Decision { driftScore: number; isInRecoveryMode: boolean; mustDoItems: string[]; }
interface Item {
  id: string; startTime: string; endTime: string; title: string;
  type: string; completed: boolean; isCritical?: boolean;
  blockKind?: string; notes?: string; sizingMode?: string;
  minViableDuration?: number;
}

function computeDayMode(p: Pressure, b: BehaviorState, d: Decision | null, skips: number): DayMode {
  if (p.grade >= 3 || b.driftLevel >= 3 || (d?.driftScore ?? 0) >= 70) return 'CRITICAL';
  if (b.dayState === 'in_recovery' || d?.isInRecoveryMode) return 'RECOVERY';
  if (p.grade >= 2 || b.driftLevel >= 2 || (d?.driftScore ?? 0) >= 40 || skips >= 3) return 'DRIFTING';
  return 'ON_TRACK';
}

function computeDrift(args: {
  pressure: Pressure; behavior: BehaviorState; items: Item[];
  decision: Decision | null; distractions: number;
  skips: number; nowMins: number; today: string;
}): { type: DriftType; severity: 'low'|'medium'|'high'; recoveryOptions: RecoveryMode[] } | null {
  const { pressure, behavior, items, distractions, skips, nowMins } = args;

  // Overload
  if (pressure.timeRatio > 1.3 && pressure.remainingMins > 0) {
    const over = pressure.requiredMins - pressure.remainingMins;
    return { type: 'overload', severity: over >= 60 ? 'high' : 'medium', recoveryOptions: ['compress_day','critical_only','save_day'] };
  }

  // Late start
  if (behavior.lateStartDetectedAt || behavior.dayState === 'late_start') {
    const expired = items.filter(i => !i.completed && (i.type === 'goal' || i.type === 'skill') && timeToMins(i.endTime) < nowMins).length;
    if (expired > 0) return { type: 'late_start', severity: expired >= 3 ? 'high' : 'medium', recoveryOptions: ['resume_now','save_day','critical_only'] };
  }

  // Avoidance
  if (skips >= 2) return { type: 'avoidance', severity: skips >= 4 ? 'high' : 'medium', recoveryOptions: ['critical_only','resume_now','save_day'] };

  // Distraction
  if (distractions >= 3 || behavior.driftLevel >= 3) {
    return { type: 'distraction', severity: distractions >= 5 ? 'high' : 'medium', recoveryOptions: ['resume_now','critical_only'] };
  }

  // Fragmented
  const actionable = items.filter(i => i.type === 'goal' || i.type === 'skill');
  const done = actionable.filter(i => i.completed).length;
  const total = actionable.length;
  const rate = total > 0 ? done / total : 1;
  const midDay = nowMins >= 720 && nowMins <= 1020;
  if (midDay && rate < 0.25 && skips >= 1 && total >= 3) {
    return { type: 'fragmented_day', severity: 'medium', recoveryOptions: ['save_day','critical_only','resume_now'] };
  }

  return null;
}

function applySaveMyDay(items: Item[], mustDo: string[], _nowMins: number): Item[] {
  const keep = new Set<string>();
  const crit = items.find(i => i.isCritical && !i.completed && (i.type === 'goal' || i.type === 'skill'));
  if (crit) keep.add(crit.id);
  let added = 0;
  for (const item of items) {
    if (keep.has(item.id)) continue;
    if (!item.completed && (item.type === 'goal' || item.type === 'skill') && mustDo.includes(item.title)) {
      keep.add(item.id); added++; if (added >= 2) break;
    }
  }
  if (keep.size === 0) { const f = items.find(i => !i.completed && (i.type === 'goal' || i.type === 'skill')); if (f) keep.add(f.id); }
  return items.map(i => {
    if (i.completed || !['goal','skill','habit'].includes(i.type) || keep.has(i.id)) return i;
    return { ...i, completed: true, notes: (i.notes ?? '') + '[deferred_by_recovery]' };
  });
}

function applyCriticalOnly(items: Item[], mustDo: string[]): Item[] {
  const crit = items.find(i => i.isCritical && !i.completed && (i.type === 'goal' || i.type === 'skill'));
  const fallback = !crit ? items.find(i => !i.completed && (i.type === 'goal' || i.type === 'skill') && mustDo.includes(i.title)) : null;
  const keep = crit ?? fallback ?? items.find(i => !i.completed && (i.type === 'goal' || i.type === 'skill'));
  return items.map(i => {
    if (i.completed || !['goal','skill','habit'].includes(i.type) || (keep && i.id === keep.id)) return i;
    return { ...i, completed: true, notes: (i.notes ?? '') + '[deferred_by_recovery]' };
  });
}

function applyResumeFromNow(items: Item[], nowMins: number): Item[] {
  const startFrom = Math.ceil(nowMins / 5) * 5;
  const sorted = [...items].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
  let cursor = startFrom;
  const result: Item[] = [];
  for (const item of sorted) {
    if (item.blockKind === 'constraint' || item.type === 'event') {
      result.push(item);
      const e = timeToMins(item.endTime);
      if (e > cursor) cursor = e;
      continue;
    }
    if (item.completed) { result.push(item); continue; }
    const dur = Math.max(5, timeToMins(item.endTime) - timeToMins(item.startTime));
    if (cursor >= 1439) { result.push({ ...item, completed: true, notes: (item.notes ?? '') + '[deferred_by_recovery]' }); continue; }
    result.push({ ...item, startTime: minsToTime(cursor), endTime: minsToTime(Math.min(cursor + dur, 1439)) });
    cursor = Math.min(cursor + dur + 5, 1439);
  }
  return result;
}

function applyCompressDay(items: Item[], nowMins: number): Item[] {
  const COMPRESS = 0.7; const MIN = 15;
  const compressed = items.map(i => {
    if (i.completed || !['goal','skill','habit'].includes(i.type) || i.blockKind === 'constraint') return i;
    if (timeToMins(i.startTime) < nowMins) return i;
    const dur = Math.max(5, timeToMins(i.endTime) - timeToMins(i.startTime));
    const newDur = Math.max(MIN, Math.round(dur * COMPRESS));
    return { ...i, endTime: minsToTime(timeToMins(i.startTime) + newDur), sizingMode: 'condensed' };
  });
  return applyResumeFromNow(compressed, nowMins);
}

// ─── Test runner ──────────────────────────────────────────────────────────────

const G = '\x1b[32m'; const R = '\x1b[0m'; const RED = '\x1b[31m'; const B = '\x1b[1m'; const DIM = '\x1b[2m';
const OK = `${G}✓${R}`; const NG = `${RED}✗${R}`;
let passed = 0; let failed = 0;

function assert(label: string, val: boolean, detail?: string) {
  if (val) { console.log(`  ${OK} ${label}`); passed++; }
  else { console.log(`  ${NG} ${label}${detail ? `  ${DIM}(${detail})${R}` : ''}`); failed++; }
}
function section(name: string) { console.log(`\n${B}── ${name} ${'─'.repeat(Math.max(0, 50 - name.length))}${R}`); }

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const p0: Pressure = { grade: 0, timeRatio: 0.5, remainingMins: 240, requiredMins: 120 };
const b0: BehaviorState = { dayState: 'in_task', driftLevel: 0, lateStartDetectedAt: null };
const d0: Decision = { driftScore: 0, isInRecoveryMode: false, mustDoItems: [] };
const i0: Item = { id: 'i1', startTime: '09:00', endTime: '10:00', title: 'Deep Work', type: 'goal', completed: false };

// ─── DayMode ──────────────────────────────────────────────────────────────────
section('computeDayMode');
assert('ON_TRACK default', computeDayMode(p0, b0, d0, 0) === 'ON_TRACK');
assert('DRIFTING grade>=2', computeDayMode({...p0,grade:2}, b0, d0, 0) === 'DRIFTING');
assert('DRIFTING driftLevel>=2', computeDayMode(p0, {...b0,driftLevel:2}, d0, 0) === 'DRIFTING');
assert('DRIFTING driftScore>=40', computeDayMode(p0, b0, {...d0,driftScore:40}, 0) === 'DRIFTING');
assert('DRIFTING skips>=3', computeDayMode(p0, b0, d0, 3) === 'DRIFTING');
assert('CRITICAL grade>=3', computeDayMode({...p0,grade:3}, b0, d0, 0) === 'CRITICAL');
assert('CRITICAL driftLevel>=3', computeDayMode(p0, {...b0,driftLevel:3}, d0, 0) === 'CRITICAL');
assert('CRITICAL driftScore>=70', computeDayMode(p0, b0, {...d0,driftScore:70}, 0) === 'CRITICAL');
assert('CRITICAL wins over RECOVERY', computeDayMode({...p0,grade:3}, {...b0,dayState:'in_recovery'}, {...d0,isInRecoveryMode:true}, 0) === 'CRITICAL');
assert('RECOVERY dayState', computeDayMode(p0, {...b0,dayState:'in_recovery'}, d0, 0) === 'RECOVERY');
assert('RECOVERY isInRecoveryMode', computeDayMode(p0, b0, {...d0,isInRecoveryMode:true}, 0) === 'RECOVERY');
assert('null decision → ON_TRACK', computeDayMode(p0, b0, null, 0) === 'ON_TRACK');

// ─── DriftEvent ───────────────────────────────────────────────────────────────
section('computeDriftEvent');
const base = { pressure: p0, behavior: b0, items: [i0], decision: d0, distractions: 0, skips: 0, nowMins: 540, today: '2026-03-28' };

assert('null when on track', computeDrift(base) === null);
assert('overload when ratio>1.3 and remaining>0', computeDrift({...base,pressure:{...p0,timeRatio:1.4,grade:2,remainingMins:100,requiredMins:140}})?.type === 'overload');
assert('overload high severity when over>=60', computeDrift({...base,pressure:{...p0,timeRatio:2.0,grade:3,remainingMins:60,requiredMins:180}})?.severity === 'high');
assert('no overload when remaining=0', computeDrift({...base,pressure:{...p0,timeRatio:2.0,grade:3,remainingMins:0,requiredMins:120},items:[]}) === null);
const expiredItem: Item = { id:'exp', startTime:'07:00', endTime:'08:00', title:'Old Task', type:'goal', completed:false };
assert('late_start when flag+expired items', computeDrift({...base,behavior:{...b0,lateStartDetectedAt:'x',dayState:'late_start'},items:[expiredItem],nowMins:600})?.type === 'late_start');
assert('no late_start when expired items completed', computeDrift({...base,behavior:{...b0,lateStartDetectedAt:'x',dayState:'late_start'},items:[{...expiredItem,completed:true}],nowMins:600}) === null);
assert('overload wins over late_start', computeDrift({...base,pressure:{...p0,timeRatio:1.4,grade:2,remainingMins:100,requiredMins:140},behavior:{...b0,lateStartDetectedAt:'x',dayState:'late_start'},items:[expiredItem],nowMins:600})?.type === 'overload');
assert('avoidance when skips>=2', computeDrift({...base,skips:2})?.type === 'avoidance');
assert('avoidance high severity skips>=4', computeDrift({...base,skips:4})?.severity === 'high');
assert('avoidance medium severity skips=2', computeDrift({...base,skips:2})?.severity === 'medium');
assert('avoidance has critical_only', computeDrift({...base,skips:2})?.recoveryOptions.includes('critical_only'));
assert('distraction when distractions>=3', computeDrift({...base,distractions:3})?.type === 'distraction');
assert('distraction from driftLevel>=3', computeDrift({...base,behavior:{...b0,driftLevel:3}})?.type === 'distraction');
assert('distraction high severity>=5', computeDrift({...base,distractions:5})?.severity === 'high');
const multi = ['i1','i2','i3'].map(id => ({...i0,id}));
assert('fragmented mid-day low completion', computeDrift({...base,items:multi,skips:1,nowMins:780})?.type === 'fragmented_day');
assert('no fragmented before 12:00', computeDrift({...base,items:multi,skips:1,nowMins:660}) === null);

// ─── SaveMyDay ────────────────────────────────────────────────────────────────
section('applySaveMyDay');
const c1: Item = {...i0, id:'c1', isCritical:true, title:'Critical'};
const m1: Item = {...i0, id:'m1', title:'Must Do 1'};
const m2: Item = {...i0, id:'m2', title:'Must Do 2'};
const l1: Item = {...i0, id:'l1', title:'Low'};
const saved = applySaveMyDay([c1,m1,m2,l1], ['Must Do 1','Must Do 2'], 540);
assert('critical not deferred', !saved.find(i=>i.id==='c1')?.completed);
assert('must-do 1 not deferred', !saved.find(i=>i.id==='m1')?.completed);
assert('must-do 2 not deferred', !saved.find(i=>i.id==='m2')?.completed);
assert('low priority deferred', saved.find(i=>i.id==='l1')?.completed === true);
assert('deferred has recovery tag', saved.find(i=>i.id==='l1')?.notes?.includes('[deferred_by_recovery]'));
assert('total count unchanged', saved.length === 4);
const fb = applySaveMyDay([m1,m2], [], 540);
assert('fallback keeps first item', !fb.find(i=>i.id==='m1')?.completed);
assert('fallback defers second', fb.find(i=>i.id==='m2')?.completed === true);

// ─── CriticalOnly ─────────────────────────────────────────────────────────────
section('applyCriticalOnly');
const cOnly = applyCriticalOnly([c1,m1,l1], ['Must Do 1']);
assert('critical kept', !cOnly.find(i=>i.id==='c1')?.completed);
assert('must-do deferred when critical exists', cOnly.find(i=>i.id==='m1')?.completed === true);
assert('low deferred', cOnly.find(i=>i.id==='l1')?.completed === true);
const cFallback = applyCriticalOnly([m1,m2], ['Must Do 1']);
assert('no critical: first must-do kept', !cFallback.find(i=>i.id==='m1')?.completed);
assert('no critical: second must-do deferred', cFallback.find(i=>i.id==='m2')?.completed === true);

// ─── ResumeFromNow ────────────────────────────────────────────────────────────
section('applyResumeFromNow');
const rItems: Item[] = [
  {...i0, id:'r1', startTime:'07:00', endTime:'08:00'},
  {...i0, id:'r2', startTime:'09:00', endTime:'10:00'},
];
const resumed = applyResumeFromNow(rItems, 600);
assert('r1 starts at 10:00', resumed.find(i=>i.id==='r1')?.startTime === '10:00');
assert('r2 starts at 11:05 (10:00+60+5)', resumed.find(i=>i.id==='r2')?.startTime === '11:05');
assert('r1 duration preserved (60 min)', timeToMins(resumed.find(i=>i.id==='r1')!.endTime) - timeToMins('10:00') === 60);
const constraint: Item = {...i0, id:'con', startTime:'14:00', endTime:'15:00', type:'event', blockKind:'constraint'};
assert('constraint keeps original time', applyResumeFromNow([...rItems,constraint],600).find(i=>i.id==='con')?.startTime === '14:00');
const done: Item = {...i0, id:'done', startTime:'07:00', endTime:'08:00', completed:true};
assert('completed keeps original time', applyResumeFromNow([done,...rItems],600).find(i=>i.id==='done')?.startTime === '07:00');
const many = Array.from({length:30},(_,i)=>({...i0,id:`late${i}`}));
assert('overflow items deferred', applyResumeFromNow(many,1380).some(i=>i.completed && i.notes?.includes('[deferred_by_recovery]')));

// ─── CompressDay ──────────────────────────────────────────────────────────────
section('applyCompressDay');
const cp1: Item = {...i0, id:'cp1', startTime:'10:00', endTime:'11:00'};
const compressed = applyCompressDay([cp1], 600);
const dur = timeToMins(compressed[0].endTime) - timeToMins(compressed[0].startTime);
assert('60min → 42min (round(60*0.7))', dur === 42);
assert('sizingMode = condensed', compressed[0].sizingMode === 'condensed');
assert('starts at 10:00', compressed[0].startTime === '10:00');
const short: Item = {...i0, id:'sh', startTime:'10:00', endTime:'10:20'};
const shortDur = timeToMins(applyCompressDay([short],600)[0].endTime) - timeToMins('10:00');
assert('minimum 15 min floor', shortDur >= 15, `got ${shortDur}`);

// ─── Summary ──────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${B}── Results ${'─'.repeat(50)}${R}`);
console.log(`\n  ${passed===total?`${G}${B}`:`${RED}${B}`}${passed}/${total} tests passed${R}\n`);
process.exit(failed > 0 ? 1 : 0);
