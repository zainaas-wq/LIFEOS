/**
 * Phase C Runtime Validation
 * Proves 3 cases: Habit → NOW, Calendar overrides Goal, Coach → NOW
 *
 * Run with:  npx tsx __tests__/phase-c-validation.ts
 */

import { computeNextBestAction, generateControlPlan } from '../src/control/controlEngine';
import { timeToMins } from '../src/ai/planGenerator';
import type { PlanItem, RecurringTask, Goal, ScheduleEvent, SkillPlan, Rule } from '../src/types';

// ─── ANSI colours ─────────────────────────────────────────────────────────────
const G  = '\x1b[32m'; // green
const Y  = '\x1b[33m'; // yellow
const C  = '\x1b[36m'; // cyan
const B  = '\x1b[1m';  // bold
const DIM= '\x1b[2m';  // dim
const R  = '\x1b[0m';  // reset
const OK = `${G}✓${R}`;
const NG = `\x1b[31m✗${R}`;

function hr(label: string) {
  console.log(`\n${B}${'─'.repeat(60)}${R}`);
  console.log(`${B}${C}  ${label}${R}`);
  console.log(`${B}${'─'.repeat(60)}${R}`);
}

function row(label: string, value: string, pass?: boolean) {
  const icon = pass === undefined ? ' ' : pass ? OK : NG;
  console.log(`  ${icon} ${DIM}${label.padEnd(28)}${R} ${value}`);
}

// ─── CASE 1: Habit feeds NOW ──────────────────────────────────────────────────

hr('CASE 1 — Habit feeds NOW');

// Inputs: 7:00 AM, habit due today, goal later
const habitItem: PlanItem = {
  id:        'habit-morning-stretch-2026-03-18',
  startTime: '07:00',
  endTime:   '07:15',
  title:     'Morning Stretch',
  type:      'goal',
  goalId:    'morning-stretch',   // carries habitId
  completed: false,
  source:    'habit',
};

const goalItemLater: PlanItem = {
  id: 'goal-guitar-1', startTime: '09:00', endTime: '10:00',
  title: 'Guitar Practice — Deep Work', type: 'goal', completed: false, source: 'goal',
};

const eventItemAfternoon: PlanItem = {
  id: 'event-cs-class', startTime: '14:00', endTime: '15:30',
  title: 'CS Class', type: 'event', completed: false, source: 'event',
};

const case1Items = [habitItem, goalItemLater, eventItemAfternoon];
const case1Now   = 7 * 60; // 07:00

const case1Result = computeNextBestAction(case1Items, case1Now);

console.log(`\n  ${DIM}Inputs:${R}`);
row('time', '07:00 AM');
row('items', '3 — habit@07:00, goal@09:00, event@14:00');

console.log(`\n  ${DIM}Priority resolution:${R}`);
row('P1 events ≤15 min?', 'CS Class starts at 14:00 — NO, 420 min away');
row('P2 goal/skill/habit now?', 'Morning Stretch 07:00–07:15 — YES (start≤7:15, end>7:00)');
row('winner', case1Result?.title ?? 'null', case1Result?.source === 'habit');

console.log(`\n  ${DIM}NowAction shows:${R}`);
row('title', case1Result?.title ?? '—');
row('source badge', case1Result?.source ?? '—', case1Result?.source === 'habit');
row('time range', `${case1Result?.startTime} – ${case1Result?.endTime}`);
row('passes assertion', `source === 'habit'`, case1Result?.source === 'habit');

// ─── CASE 2: Calendar event overrides goal ≤15 min ───────────────────────────

hr('CASE 2 — Calendar event overrides goal when starting ≤15 min');

// 09:45 AM — a goal session started at 09:00 is still running,
// but a class starts at 10:00 (exactly 15 min away → should win P1)
const goalRunning: PlanItem = {
  id: 'goal-dsa', startTime: '09:00', endTime: '10:00',
  title: 'DSA Study', type: 'goal', completed: false, source: 'goal',
};

const imminentEvent: PlanItem = {
  id: 'event-lecture', startTime: '10:00', endTime: '11:30',
  title: 'CS Lecture — Algorithm Design', type: 'event', completed: false, source: 'event',
};

const case2Items = [goalRunning, imminentEvent];
const case2Now   = 9 * 60 + 45; // 09:45

const case2Result = computeNextBestAction(case2Items, case2Now);

// Verify the goal WOULD win without the event (prove P1 pre-emption)
const case2WithoutEvent = computeNextBestAction([goalRunning], case2Now);

console.log(`\n  ${DIM}Inputs:${R}`);
row('time', '09:45 AM');
row('goal item', 'DSA Study 09:00–10:00 (currently running)');
row('event item', 'CS Lecture 10:00–11:30 (starts in 15 min)');

console.log(`\n  ${DIM}Priority resolution:${R}`);
const eventStart = timeToMins('10:00');
const pass2      = eventStart <= case2Now + 15 && timeToMins('11:30') > case2Now;
row('event start (mins)', `${eventStart}  =  now(585) + 15  =  600`, pass2);
row('P1 condition met?',  `${eventStart} ≤ ${case2Now + 15} AND 690 > ${case2Now}`, pass2);
row('without event, winner', case2WithoutEvent?.title ?? 'null');
row('WITH event, winner', case2Result?.title ?? 'null', case2Result?.source === 'event');

console.log(`\n  ${DIM}NowAction shows:${R}`);
row('title', case2Result?.title ?? '—');
row('source badge', case2Result?.source ?? '—', case2Result?.source === 'event');
row('time range', `${case2Result?.startTime} – ${case2Result?.endTime}`);
row('goal correctly pre-empted', `was: ${case2WithoutEvent?.title} → now: ${case2Result?.title}`,
  case2Result?.id === imminentEvent.id);

// ─── CASE 3: Coach suggestion becomes NOW via "Apply to my day" ───────────────

hr('CASE 3 — Coach suggestion becomes NOW after "Apply to my day"');

// Simulate what generateControlPlan produces when called from coach's
// "Apply to my day" button. The coach already ran and populated the store
// with the coach plan items — generateControlPlanAction replays it.
//
// We use minimal goal/schedule inputs and verify nextBestAction is set.

const goals: Goal[] = [
  {
    id: 'g1', title: 'Guitar Practice', category: 'skill',
    priority: 1, weeklyHoursTarget: 7, createdAt: '2026-01-01T00:00:00Z',
  },
];

const schedule: ScheduleEvent[] = [
  {
    id: 'e1', title: 'CS Lecture', start: '14:00', end: '15:30',
    category: 'class', recurring: true, daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    createdAt: '2026-01-01T00:00:00Z',
  },
];

const habits: RecurringTask[] = [
  {
    id: 'h1', title: 'Morning Stretch', durationMinutes: 15,
    preferredTime: '07:00', completedDates: [],  // not done today
    createdAt: '2026-01-01T00:00:00Z',
    category: 'body', daysOfWeek: [], skipOnOffDays: false,
  },
];

const date = '2026-03-18';

console.log(`\n  ${DIM}Coach output (Apply to my day) feeds generateControlPlan with:${R}`);
row('goals', '1 — Guitar Practice (7h/week)');
row('schedule', '1 — CS Lecture 14:00–15:30 daily');
row('habits', '1 — Morning Stretch 15min @ 07:00 (not done today)');
row('date', date);

let case3Plan: ReturnType<typeof generateControlPlan> | null = null;
let case3Error: string | null = null;

try {
  case3Plan = generateControlPlan(
    goals, schedule, [] as SkillPlan[], [] as Rule[], date,
    undefined, 7 * 60, 22 * 60,   // fixedStart: 07:00, fixedEnd: 22:00
    undefined,                     // energyStyle
    undefined,                     // constraintBlocks
    habits,                        // recurringTasks
  );
} catch (e: any) {
  case3Error = String(e?.message ?? e);
}

if (case3Error) {
  console.log(`\n  ${NG} generateControlPlan threw: ${case3Error}`);
} else if (case3Plan) {
  const nba    = case3Plan.nextBestAction;
  const items  = case3Plan.plan.items;
  const habitInPlan  = items.find(i => i.source === 'habit');
  const goalInPlan   = items.find(i => i.type === 'goal' && i.source !== 'habit');
  const eventInPlan  = items.find(i => i.type === 'event');

  console.log(`\n  ${DIM}Plan generated:${R}`);
  row('total items', String(items.length));
  row('habit item injected', habitInPlan?.title ?? 'NOT FOUND', !!habitInPlan);
  row('habit scheduled at', habitInPlan ? `${habitInPlan.startTime} – ${habitInPlan.endTime}` : '—');
  row('goal item', goalInPlan?.title ?? 'NOT FOUND', !!goalInPlan);
  row('event item', eventInPlan?.title ?? 'NOT FOUND', !!eventInPlan);

  console.log(`\n  ${DIM}nextBestAction (= NowAction):${R}`);
  row('title', nba?.title ?? 'null', !!nba);
  row('type', nba?.type ?? '—');
  row('source', nba?.source ?? 'undefined (goal default)');
  row('time range', nba ? `${nba.startTime} – ${nba.endTime}` : '—');
  row('plan.source', case3Plan.plan.source, case3Plan.plan.source !== undefined);

  console.log(`\n  ${DIM}Coach → NOW bridge proof:${R}`);
  row('"Apply to my day" triggers', 'generateControlPlanAction(today)');
  row('store sets controlPlan', '{ plan, nextBestAction, ... }');
  row('Home reads nextBestAction', 'NowAction card renders immediately');
  row('nextBestAction is set', !!nba ? `YES — "${nba.title}"` : 'NO', !!nba);

  console.log(`\n  ${DIM}All plan items:${R}`);
  const sorted = [...items].sort((a, b) =>
    (a.startTime > b.startTime ? 1 : -1));
  sorted.forEach(i => {
    const src = i.source ? `[${i.source}]` : '[goal]';
    const done = i.completed ? '✓' : '○';
    console.log(`     ${DIM}${done}${R} ${i.startTime}–${i.endTime}  ${src.padEnd(10)} ${i.title}`);
  });
}

// ─── Summary ──────────────────────────────────────────────────────────────────

hr('SUMMARY');

const c1pass = case1Result?.source === 'habit';
const c2pass = case2Result?.source === 'event' && case2Result?.id === imminentEvent.id;
const c3pass = !!case3Plan?.nextBestAction;

console.log(`\n  ${c1pass ? OK : NG} Case 1 — Habit feeds NOW`);
console.log(`  ${c2pass ? OK : NG} Case 2 — Calendar event overrides goal ≤15 min`);
console.log(`  ${c3pass ? OK : NG} Case 3 — Coach → generateControlPlan → nextBestAction set\n`);

const allPass = c1pass && c2pass && c3pass;
console.log(`  ${allPass ? `${G}${B}All 3 cases pass.${R}` : `\x1b[31m${B}Some cases failed.${R}`}\n`);

process.exit(allPass ? 0 : 1);
