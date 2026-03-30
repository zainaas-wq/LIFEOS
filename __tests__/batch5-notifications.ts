/**
 * __tests__/batch5-notifications.ts
 *
 * Node-runnable tests for notification policy pure functions.
 * Run: npx tsx __tests__/batch5-notifications.ts
 *
 * Tests: selectNotificationItems, isQuietHour, deriveReviewReminderHour,
 *        getTaskNotificationMins, buildTaskStartContent, NOTIF_IDS,
 *        timeStrToMins
 *
 * No React, no expo-notifications, no store.
 */

export {};

import {
  selectNotificationItems,
  isQuietHour,
  deriveReviewReminderHour,
  getTaskNotificationMins,
  buildTaskStartContent,
  buildTaskMissedContent,
  buildDriftContent,
  buildReviewReminderContent,
  NOTIF_IDS,
  timeStrToMins,
  TASK_START_LEAD_MINS,
  TASK_MISSED_LAG_MINS,
  MAX_TASK_NOTIFS,
  QUIET_START_HOUR,
  QUIET_END_HOUR,
  REVIEW_FALLBACK_HOUR,
  MIN_REVIEW_HOUR,
} from '../src/ai/notificationPlanner';
import type { PlanItem } from '../src/types';

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

function makeItem(overrides: Partial<PlanItem> & { id: string; startTime: string }): PlanItem {
  return {
    id:        overrides.id,
    startTime: overrides.startTime,
    endTime:   overrides.endTime   ?? '10:00',
    title:     overrides.title     ?? 'Test Task',
    type:      overrides.type      ?? 'goal',
    completed: overrides.completed ?? false,
    isCritical: overrides.isCritical,
    goalId:    overrides.goalId,
  };
}

// ─── Suite 1: isQuietHour ─────────────────────────────────────────────────────

console.log('\nSuite 1: isQuietHour');

{
  assert('22:00 is quiet (start of quiet)', isQuietHour(22) === true);
  assert('23:00 is quiet',                  isQuietHour(23) === true);
  assert('0:00 is quiet (midnight)',         isQuietHour(0)  === true);
  assert('6:00 is quiet (before 7)',         isQuietHour(6)  === true);
  assert('7:00 is NOT quiet (boundary)',     isQuietHour(7)  === false);
  assert('8:00 is NOT quiet',               isQuietHour(8)  === false);
  assert('21:00 is NOT quiet',              isQuietHour(21) === false);
  assert('12:00 is NOT quiet',              isQuietHour(12) === false);
  assert('QUIET_START_HOUR constant = 22',  QUIET_START_HOUR === 22);
  assert('QUIET_END_HOUR constant = 7',     QUIET_END_HOUR === 7);
}

// ─── Suite 2: timeStrToMins ───────────────────────────────────────────────────

console.log('\nSuite 2: timeStrToMins');

{
  assert('"00:00" = 0',    timeStrToMins('00:00') === 0);
  assert('"01:00" = 60',   timeStrToMins('01:00') === 60);
  assert('"09:30" = 570',  timeStrToMins('09:30') === 570);
  assert('"14:45" = 885',  timeStrToMins('14:45') === 885);
  assert('"22:00" = 1320', timeStrToMins('22:00') === 1320);
}

// ─── Suite 3: deriveReviewReminderHour ────────────────────────────────────────

console.log('\nSuite 3: deriveReviewReminderHour');

{
  assert('undefined → fallback 21',     deriveReviewReminderHour(undefined) === REVIEW_FALLBACK_HOUR);
  assert('"22:00" → 21 (sleep-1)',       deriveReviewReminderHour('22:00') === 21);
  assert('"23:00" → 21 (capped at 21)', deriveReviewReminderHour('23:00') === 21);
  assert('"20:00" → 19',               deriveReviewReminderHour('20:00') === 19);
  assert('"19:00" → 18 (clamped to min)', deriveReviewReminderHour('19:00') === 18);
  assert('"10:00" → 18 (way too early, clamped)', deriveReviewReminderHour('10:00') === 18);
  assert('MIN_REVIEW_HOUR = 18',        MIN_REVIEW_HOUR === 18);
  assert('REVIEW_FALLBACK_HOUR = 21',   REVIEW_FALLBACK_HOUR === 21);
}

// ─── Suite 4: selectNotificationItems ────────────────────────────────────────

console.log('\nSuite 4: selectNotificationItems');

{
  const items: PlanItem[] = [
    makeItem({ id: 'g1', startTime: '09:00', type: 'goal', completed: false }),
    makeItem({ id: 'g2', startTime: '11:00', type: 'skill', completed: false }),
    makeItem({ id: 'g3', startTime: '14:00', type: 'goal', completed: false }),
    makeItem({ id: 'g4', startTime: '16:00', type: 'goal', completed: false }),
    makeItem({ id: 'b1', startTime: '10:00', type: 'break', completed: false }),
    makeItem({ id: 'g5', startTime: '08:30', type: 'goal', completed: true }), // completed
  ];

  // nowMins = 07:00 = 420 → all future items qualify
  const selected = selectNotificationItems(items, 420);
  assert(`max ${MAX_TASK_NOTIFS} items selected`, selected.length === MAX_TASK_NOTIFS);
  assert('breaks excluded',                      !selected.some((i) => i.type === 'break'));
  assert('completed items excluded',             !selected.some((i) => i.completed));
  assert('sorted by startTime ascending',        selected[0].startTime <= selected[1].startTime);
  assert('first item is earliest (09:00)',       selected[0].id === 'g1');
}

{
  // nowMins = 11:30 = 690 → items starting before 11:20 (= 690 - 10) are excluded
  const items: PlanItem[] = [
    makeItem({ id: 'g1', startTime: '09:00', type: 'goal', completed: false }), // start at 540, 540+10=550 < 690 → exclude
    makeItem({ id: 'g2', startTime: '11:15', type: 'goal', completed: false }), // start at 675, 675+10=685 < 690 → exclude
    makeItem({ id: 'g3', startTime: '11:25', type: 'goal', completed: false }), // start at 685, 685 > 680 → include
    makeItem({ id: 'g4', startTime: '14:00', type: 'goal', completed: false }),
  ];
  const selected = selectNotificationItems(items, 690);
  assert('items before missed window excluded (g1)',  !selected.some((i) => i.id === 'g1'));
  assert('items before missed window excluded (g2)',  !selected.some((i) => i.id === 'g2'));
  assert('item within missed window included (g3)',    selected.some((i) => i.id === 'g3'));
  assert('future item included (g4)',                  selected.some((i) => i.id === 'g4'));
}

// ─── Suite 5: getTaskNotificationMins ─────────────────────────────────────────

console.log('\nSuite 5: getTaskNotificationMins');

{
  const item = makeItem({ id: 'task1', startTime: '10:00', isCritical: true });
  const pair = getTaskNotificationMins(item);

  assert('itemId matches',               pair.itemId === 'task1');
  assert('startCandidateMins = 600-5',   pair.startCandidateMins === 600 - TASK_START_LEAD_MINS);
  assert('missedCandidateMins = 600+10', pair.missedCandidateMins === 600 + TASK_MISSED_LAG_MINS);
  assert('isCritical = true',            pair.isCritical === true);
  assert('title = item.title',           pair.title === item.title);
  assert('TASK_START_LEAD_MINS = 5',    TASK_START_LEAD_MINS === 5);
  assert('TASK_MISSED_LAG_MINS = 10',   TASK_MISSED_LAG_MINS === 10);
}

{
  const item = makeItem({ id: 'task2', startTime: '09:30' });
  const pair = getTaskNotificationMins(item);
  const expectedStart = 9 * 60 + 30 - TASK_START_LEAD_MINS;
  const expectedMissed = 9 * 60 + 30 + TASK_MISSED_LAG_MINS;
  assert('09:30 start → correct startCandidateMins',  pair.startCandidateMins === expectedStart);
  assert('09:30 start → correct missedCandidateMins', pair.missedCandidateMins === expectedMissed);
}

// ─── Suite 6: Notification content builders ───────────────────────────────────

console.log('\nSuite 6: Notification content builders');

{
  const critical = makeItem({ id: 'c1', startTime: '10:00', isCritical: true });
  const normal   = makeItem({ id: 'n1', startTime: '10:00' });

  const cs = buildTaskStartContent(critical);
  const ns = buildTaskStartContent(normal);
  assert('critical start title has ⭐',   cs.title.includes('⭐'));
  assert('normal start title has no ⭐',  !ns.title.includes('⭐'));
  assert('start title includes task name', cs.title.includes(critical.title));

  const missed = buildTaskMissedContent(normal);
  assert('missed title includes task name', missed.title.includes(normal.title));
  assert('missed body mentions minutes',    missed.body.includes('10 min'));

  const drift = buildDriftContent();
  assert('drift title includes LifeOS', drift.title.includes('LifeOS'));
  assert('drift body mentions open',    drift.body.includes('Open'));

  const review = buildReviewReminderContent();
  assert('review title includes LifeOS',    review.title.includes('LifeOS'));
  assert('review body mentions 2 minutes',  review.body.includes('2 min'));
}

// ─── Suite 7: NOTIF_IDS ───────────────────────────────────────────────────────

console.log('\nSuite 7: NOTIF_IDS');

{
  assert('taskStart ID format', NOTIF_IDS.taskStart('abc') === 'task-start-abc');
  assert('taskMissed ID format', NOTIF_IDS.taskMissed('abc') === 'task-missed-abc');
  assert('drift ID constant',    NOTIF_IDS.drift === 'drift-intervention');
  assert('review ID constant',   NOTIF_IDS.review === 'review-reminder');

  // Uniqueness: different items produce different IDs
  assert('unique start IDs',    NOTIF_IDS.taskStart('a') !== NOTIF_IDS.taskStart('b'));
  assert('start vs missed different', NOTIF_IDS.taskStart('x') !== NOTIF_IDS.taskMissed('x'));
}

// ─── Suite 8: MAX_TASK_NOTIFS limit enforcement ───────────────────────────────

console.log('\nSuite 8: MAX_TASK_NOTIFS enforcement');

{
  const manyItems: PlanItem[] = Array.from({ length: 10 }, (_, i) =>
    makeItem({ id: `g${i}`, startTime: `${9 + i}:00`, type: 'goal', completed: false }),
  );
  const selected = selectNotificationItems(manyItems, 0);
  assert(`exactly MAX_TASK_NOTIFS (${MAX_TASK_NOTIFS}) selected`, selected.length === MAX_TASK_NOTIFS);
  assert('MAX_TASK_NOTIFS = 3', MAX_TASK_NOTIFS === 3);
}

// ─── Suite 9: selectNotificationItems with custom max ─────────────────────────

console.log('\nSuite 9: Custom max parameter');

{
  const items: PlanItem[] = Array.from({ length: 6 }, (_, i) =>
    makeItem({ id: `g${i}`, startTime: `${9 + i}:00`, type: 'goal', completed: false }),
  );
  const selected5 = selectNotificationItems(items, 0, 5);
  assert('custom max=5 respected', selected5.length === 5);

  const selected1 = selectNotificationItems(items, 0, 1);
  assert('custom max=1 respected', selected1.length === 1);
}

// ─── Suite 10: empty plan → empty selection ───────────────────────────────────

console.log('\nSuite 10: Edge cases');

{
  const empty = selectNotificationItems([], 0);
  assert('empty plan → no items', empty.length === 0);

  // All items completed
  const allDone: PlanItem[] = [
    makeItem({ id: 'x1', startTime: '09:00', type: 'goal', completed: true }),
    makeItem({ id: 'x2', startTime: '10:00', type: 'goal', completed: true }),
  ];
  const noneDone = selectNotificationItems(allDone, 0);
  assert('all completed → no items', noneDone.length === 0);

  // No goal/skill items
  const onlyBreaks: PlanItem[] = [
    makeItem({ id: 'b1', startTime: '09:00', type: 'break', completed: false }),
    makeItem({ id: 'e1', startTime: '10:00', type: 'event', completed: false }),
  ];
  const noActionable = selectNotificationItems(onlyBreaks, 0);
  assert('breaks + events only → no items', noActionable.length === 0);
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
