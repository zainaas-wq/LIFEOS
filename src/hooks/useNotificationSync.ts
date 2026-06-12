/**
 * useNotificationSync — connects store state to local notification scheduling.
 *
 * Mount once in app/(tabs)/_layout.tsx. Handles all notification side effects:
 *
 *   Plan generated/changed  → schedule task-start + task-missed for next N items
 *   Item completed           → cancel its start + missed notifications
 *   Drift detected           → schedule drift-intervention (15 min delay)
 *   Drift cleared/dismissed  → cancel drift-intervention
 *   Recovery applied         → cancel drift-intervention
 *   Review pending           → schedule review-reminder at tonight's hour
 *   Review saved             → cancel review-reminder
 *   Day archived             → cancel all notifications
 *
 * Notification policy (see notificationPlanner.ts for constants):
 *   - Max 3 task start notifications at once (next upcoming items only)
 *   - No notifications during quiet hours (22:00–07:00)
 *   - One drift notification per drift event (dedup by activeDrift.id)
 *   - One review reminder per day
 *   - All IDs are deterministic — cancel-before-reschedule prevents duplicates
 *
 * Tap handler: notification taps navigate to the relevant screen.
 * Cold-start taps are handled in app/_layout.tsx.
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAppStore } from '../store/useAppStore';
import { track } from '../services/analyticsService';
import {
  requestPermissions,
  setupAndroidChannel,
  setupNotificationCategories,
  scheduleLocal,
  cancelNotification,
  cancelAllNotifications,
  cancelByPrefix,
} from '../services/notificationService';
import {
  selectNotificationItems,
  getTaskNotificationMins,
  buildTaskStartContent,
  buildTaskMissedContent,
  buildDriftContent,
  buildReviewReminderContent,
  deriveReviewReminderHour,
  isQuietHour,
  DRIFT_DELAY_MINS,
  NOTIF_IDS,
  NOTIF_CATEGORIES,
  NOTIF_ACTIONS,
  timeStrToMins,
} from '../ai/notificationPlanner';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Returns a Date for today at the given HH:MM offset in minutes from midnight. */
function todayAtMins(totalMins: number): Date {
  const d = new Date();
  d.setHours(Math.floor(totalMins / 60), totalMins % 60, 0, 0);
  return d;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotificationSync(): void {
  const router = useRouter();

  // Store subscriptions — use granular selectors to avoid unnecessary re-renders
  const controlPlan    = useAppStore((s) => s.controlPlan);
  const activeDrift    = useAppStore((s) => s.activeDrift);
  const activeRecovery = useAppStore((s) => s.activeRecoveryMode);
  const pendingReview  = useAppStore((s) => s.pendingReview);
  const profile        = useAppStore((s) => s.profile);

  // Refs for dedup guards — don't need to be state (no re-render needed)
  const permGranted          = useRef(false);
  const lastPlanId           = useRef<string | null>(null);
  const lastDriftId          = useRef<string | null>(null);
  const driftNotifScheduled  = useRef(false);
  const reviewNotifScheduled = useRef(false);

  // ── Permission request + channel + category setup on first mount ─────────
  useEffect(() => {
    setupAndroidChannel();        // no-op on iOS; idempotent on Android
    setupNotificationCategories(); // registers interactive action buttons
    requestPermissions().then((granted) => {
      permGranted.current = granted;
    });
  }, []);

  // ── Tap + action handler → in-app navigation ──────────────────────────────
  // Handles notification taps and action button presses when the app is open.
  // Cold-start taps are handled separately in app/_layout.tsx.
  //
  // Routing table:
  //   review-reminder tap / review_now action  → /review
  //   task-start / task-missed / drift / retention tap or "open"/"start_now" → /(tabs)/home
  //   "snooze" / "later" actions               → no navigation (user dismissed)
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data     = response.notification.request.content.data as Record<string, string>;
      const id       = data?.notificationId ?? '';
      const actionId = response.actionIdentifier;

      // Silent actions — user chose to dismiss without opening
      if (actionId === NOTIF_ACTIONS.snooze || actionId === NOTIF_ACTIONS.later) return;

      track('notification_opened', {
        notification_id: id,
        action:          actionId,
        screen:          data?.screen ?? null,
      });

      if (id === NOTIF_IDS.review || actionId === NOTIF_ACTIONS.reviewNow) {
        router.push('/review' as any);
      } else {
        // task-start / task-missed / drift / retention + default tap
        router.push('/(tabs)/home' as any);
      }
    });
    return () => sub.remove();
  }, []);

  // ── Plan change → reschedule task notifications ─────────────────────────
  // Fires when a new plan is generated (plan ID changes).
  // Cancels old task notifications first, then schedules next N items.
  useEffect(() => {
    if (!controlPlan) return;
    if (controlPlan.plan.id === lastPlanId.current) return; // same plan, no-op
    lastPlanId.current = controlPlan.plan.id;

    if (!permGranted.current) return;

    const nowMins = (() => {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    })();

    if (isQuietHour(new Date().getHours())) return;

    const schedule = async () => {
      // Clear all existing task notifications before rescheduling
      await cancelByPrefix('task-start-');
      await cancelByPrefix('task-missed-');

      const candidates = selectNotificationItems(controlPlan.plan.items, nowMins);

      track('notification_scheduled', {
        item_count:  candidates.length,
        plan_id:     controlPlan.plan.id,
      });

      for (const item of candidates) {
        const { startCandidateMins, missedCandidateMins } = getTaskNotificationMins(item);

        // task-start: fires 5 min before start
        const startDate = todayAtMins(startCandidateMins);
        if (startDate.getTime() > Date.now() && !isQuietHour(Math.floor(startCandidateMins / 60))) {
          const { title, body } = buildTaskStartContent(item);
          await scheduleLocal(NOTIF_IDS.taskStart(item.id), title, body, startDate, {
            itemId: item.id,
          }, NOTIF_CATEGORIES.taskStart);
        }

        // task-missed: fires 10 min after start (if still incomplete at that time)
        const missedDate = todayAtMins(missedCandidateMins);
        if (missedDate.getTime() > Date.now() && !isQuietHour(Math.floor(missedCandidateMins / 60))) {
          const { title, body } = buildTaskMissedContent(item);
          await scheduleLocal(NOTIF_IDS.taskMissed(item.id), title, body, missedDate, {
            itemId: item.id,
          }, NOTIF_CATEGORIES.taskMissed);
        }
      }
    };

    schedule().catch(console.warn);
  }, [controlPlan?.plan.id]);

  // ── Item completion → cancel its pending notifications ──────────────────
  // Fires whenever any plan item is toggled (items array reference changes).
  // Idempotent — cancelling an already-cancelled notification is a no-op.
  useEffect(() => {
    if (!controlPlan) return;
    const cancel = async () => {
      for (const item of controlPlan.plan.items) {
        if (item.completed) {
          await cancelNotification(NOTIF_IDS.taskStart(item.id));
          await cancelNotification(NOTIF_IDS.taskMissed(item.id));
        }
      }
    };
    cancel().catch(console.warn);
  }, [controlPlan?.plan.items]);

  // ── Drift detected → schedule delayed intervention notification ─────────
  // Fires 15 minutes after drift is detected.
  // Cancels immediately when drift is dismissed or recovery is applied.
  // Dedup: only one notification per drift event (by activeDrift.id).
  useEffect(() => {
    // Drift cleared or dismissed — cancel pending notification
    if (!activeDrift || activeDrift.dismissed) {
      cancelNotification(NOTIF_IDS.drift).catch(console.warn);
      driftNotifScheduled.current = false;
      lastDriftId.current = null;
      return;
    }

    // Same drift event — don't reschedule
    if (activeDrift.id === lastDriftId.current) return;
    lastDriftId.current = activeDrift.id;

    // Suppress: quiet hours or recovery already active
    if (!permGranted.current || isQuietHour(new Date().getHours()) || activeRecovery) return;

    // Suppress: already scheduled for this event
    if (driftNotifScheduled.current) return;

    const fireDate = new Date(Date.now() + DRIFT_DELAY_MINS * 60_000);
    const { title, body } = buildDriftContent();

    scheduleLocal(NOTIF_IDS.drift, title, body, fireDate, { screen: 'home' }, NOTIF_CATEGORIES.drift)
      .then(() => { driftNotifScheduled.current = true; })
      .catch(console.warn);
  }, [activeDrift?.id, activeDrift?.dismissed]);

  // ── Recovery applied → cancel drift notification ─────────────────────────
  useEffect(() => {
    if (!activeRecovery) return;
    cancelNotification(NOTIF_IDS.drift).catch(console.warn);
    driftNotifScheduled.current = false;
  }, [activeRecovery]);

  // ── Pending review → schedule end-of-day reminder ───────────────────────
  // Schedules once when pendingReview appears. Cancelled when review is saved.
  // Time is derived from profile sleep schedule; default 21:00.
  useEffect(() => {
    if (!pendingReview || !permGranted.current) return;
    if (reviewNotifScheduled.current) return;

    const reminderHour = deriveReviewReminderHour(profile?.fixedScheduleEnd);
    if (isQuietHour(reminderHour)) return;

    const reminderDate = todayAtMins(reminderHour * 60);
    if (reminderDate.getTime() <= Date.now()) return; // already past this hour today

    const { title, body } = buildReviewReminderContent();
    scheduleLocal(NOTIF_IDS.review, title, body, reminderDate, { screen: 'review' }, NOTIF_CATEGORIES.review)
      .then(() => { reviewNotifScheduled.current = true; })
      .catch(console.warn);
  }, [pendingReview, profile?.fixedScheduleEnd]);

  // ── Review saved → cancel reminder ───────────────────────────────────────
  useEffect(() => {
    if (pendingReview) return; // review still pending — don't cancel
    cancelNotification(NOTIF_IDS.review).catch(console.warn);
    reviewNotifScheduled.current = false;
  }, [pendingReview]);
}
