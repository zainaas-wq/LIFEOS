/**
 * notificationService — thin wrapper around expo-notifications.
 *
 * Responsibilities:
 *   - Permission request
 *   - Schedule/cancel local notifications by deterministic ID
 *   - Cancel by ID prefix (for batch cancellation of task notifications)
 *   - Set default foreground notification handler (show alert, no sound, no badge)
 *
 * Design rules:
 *   - Every function is safe to call on web (no-op on Platform.OS === 'web')
 *   - Never throws — errors are console.warn'd and swallowed
 *   - All scheduling is idempotent: cancel-before-schedule prevents duplicates
 *   - Caller provides the trigger Date; this service does not apply time policy
 *
 * The foreground handler shows alerts for all notifications.
 * The in-app NudgeBanner handles foreground nudges; notifications are the
 * fallback when the app is backgrounded or closed.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// ─── Foreground handler ───────────────────────────────────────────────────────

// Call once at app startup. Shows notification alerts even while the app is open.
// Sound is enabled so notifications ring whether the app is open or backgrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

// ─── Android channel setup ────────────────────────────────────────────────────

/**
 * Creates (or updates) the default Android notification channel.
 * Must be called once at app startup (before any notification is scheduled).
 * On Android 8+ (API 26+) channels control sound, vibration, and importance.
 * No-op on iOS / web.
 */
/**
 * Registers notification action categories for interactive notifications.
 * Must be called once at app startup (after channel setup, before scheduling).
 *
 * Categories registered:
 *   task_start      → "Start now" (opens app) + "Snooze 10 min" (silent)
 *   task_missed     → "Open app" (opens app)
 *   drift_alert     → "Get back on track" (opens app)
 *   review_reminder → "Review now" (opens app) + "Later" (silent)
 *   retention_nudge → "Open LifeOS" (opens app)
 *
 * No-op on web. Safe to call multiple times (idempotent).
 */
export async function setupNotificationCategories(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setNotificationCategoryAsync('task_start', [
      {
        identifier: 'start_now',
        buttonTitle: 'Start now',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'snooze',
        buttonTitle: 'Snooze 10 min',
        options: { opensAppToForeground: false },
      },
    ]);
    await Notifications.setNotificationCategoryAsync('task_missed', [
      {
        identifier: 'open',
        buttonTitle: 'Open app',
        options: { opensAppToForeground: true },
      },
    ]);
    await Notifications.setNotificationCategoryAsync('drift_alert', [
      {
        identifier: 'open',
        buttonTitle: 'Get back on track',
        options: { opensAppToForeground: true },
      },
    ]);
    await Notifications.setNotificationCategoryAsync('review_reminder', [
      {
        identifier: 'review_now',
        buttonTitle: 'Review now',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'later',
        buttonTitle: 'Later',
        options: { opensAppToForeground: false },
      },
    ]);
    await Notifications.setNotificationCategoryAsync('retention_nudge', [
      {
        identifier: 'open',
        buttonTitle: 'Open LifeOS',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch (e) {
    console.warn('[notificationService] setupNotificationCategories:', e);
  }
}

export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name:              'LifeOS Notifications',
      importance:        Notifications.AndroidImportance.HIGH,
      sound:             'default',
      vibrationPattern:  [0, 250, 150, 250],
      lightColor:        '#F59E0B',
      enableLights:      true,
      enableVibrate:     true,
      showBadge:         false,
    });
  } catch (e) {
    console.warn('[notificationService] setupAndroidChannel:', e);
  }
}

// ─── Permissions ──────────────────────────────────────────────────────────────

/**
 * Requests notification permission if not already granted.
 * Returns true if permission is granted, false otherwise.
 * On web, always returns false.
 */
export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    console.warn('[notificationService] requestPermissions:', e);
    return false;
  }
}

/**
 * Checks whether notification permission is currently granted.
 * Does NOT prompt the user. Returns false on web.
 */
export async function checkPermissionGranted(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

/**
 * Schedules a local notification at the given Date.
 *
 * Idempotent: any existing notification with the same `id` is cancelled first.
 * No-op if `triggerDate` is in the past.
 * No-op on web.
 */
export async function scheduleLocal(
  id: string,
  title: string,
  body: string,
  triggerDate: Date,
  data: Record<string, string> = {},
  categoryIdentifier?: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (triggerDate.getTime() <= Date.now()) return;

  try {
    // Always cancel before rescheduling to prevent duplicate IDs
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});

    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title,
        body,
        sound:           'default',
        ...(categoryIdentifier && { categoryIdentifier }),
        ...(Platform.OS === 'android' && { channelId: 'default' }),
        data: { notificationId: id, ...data },
      },
      trigger: { date: triggerDate } as Notifications.DateTriggerInput,
    });
  } catch (e) {
    console.warn(`[notificationService] scheduleLocal(${id}):`, e);
  }
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

/**
 * Cancels a scheduled notification by its exact identifier.
 * No-op if the notification doesn't exist or on web.
 */
export async function cancelNotification(id: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/**
 * Cancels all currently scheduled notifications.
 * Called on day archive and hard reset.
 */
export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

/**
 * Cancels all scheduled notifications whose identifier starts with `prefix`.
 * Used for batch-cancelling all task-start or task-missed notifications.
 */
export async function cancelByPrefix(prefix: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const targets = scheduled.filter((n) => n.identifier.startsWith(prefix));
    await Promise.all(targets.map((n) =>
      Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {}),
    ));
  } catch (e) {
    console.warn(`[notificationService] cancelByPrefix(${prefix}):`, e);
  }
}

/**
 * Returns the identifiers of all currently scheduled notifications.
 * Used for dedup checks and debugging.
 */
export async function getScheduledIds(): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.map((n) => n.identifier);
  } catch {
    return [];
  }
}
