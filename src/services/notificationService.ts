/**
 * notificationService — Sprint 5: Notification Infrastructure
 *
 * Wraps expo-notifications to provide:
 *   - Permission requests
 *   - Nudge scheduling (OS-level push, not just in-app banners)
 *   - Notification cancellation
 *   - Tap handler / deep link routing
 *
 * All functions are safe to call when expo-notifications is unavailable
 * (e.g., web, simulator without push capability) — they log a warning and no-op.
 *
 * Install: expo install expo-notifications
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NudgeItem, Exam } from '../types';
import type { AcademicRisk }  from '../ai/academicRiskEngine';
import type { ProjectRisk }  from '../ai/projectIntelligenceEngine';

// ─── Lazy import guard ────────────────────────────────────────────────────────
// expo-notifications may not be installed yet. Lazy require prevents a hard
// crash if the package is missing; all public functions check availability first.

let Notifications: typeof import('expo-notifications') | null = null;
let notificationsAvailable = false;

function getNotifications(): typeof import('expo-notifications') | null {
  if (Notifications) return Notifications;
  try {
    Notifications = require('expo-notifications') as typeof import('expo-notifications');
    notificationsAvailable = true;
    return Notifications;
  } catch {
    console.warn('[notificationService] expo-notifications not installed — notifications disabled.');
    return null;
  }
}

// ─── Internal state ───────────────────────────────────────────────────────────

// Map from NudgeItem.id → OS notification identifier
const scheduledIds = new Map<string, string>();

// ─── Permission ───────────────────────────────────────────────────────────────

/**
 * Request push notification permissions from the OS.
 * Should be called once on app startup (after onboarding).
 * Returns true if permissions were granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const N = getNotifications();
  if (!N || Platform.OS === 'web') return false;

  try {
    const { status: existing } = await N.getPermissionsAsync();

    // Always set the handler — required on every launch so foreground notifications display
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge:  false,
      }),
    });

    if (existing === 'granted') {
      // Channel may still be missing if app was updated — re-create idempotently
      if (Platform.OS === 'android') {
        await N.setNotificationChannelAsync('lifeos-nudges', {
          name:       'LifeOS Reminders',
          importance: (N as any).AndroidImportance?.HIGH ?? 4,
          sound:      undefined,
        });
      }
      return true;
    }

    const { status } = await N.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[notificationService] Permission denied');
      return false;
    }

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('lifeos-nudges', {
        name:       'LifeOS Reminders',
        importance: (N as any).AndroidImportance?.HIGH ?? 4,
        sound:      undefined,
      });
    }

    return true;
  } catch (err) {
    console.warn('[notificationService] requestPermissions failed:', err);
    return false;
  }
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

/**
 * Schedule a single nudge as an OS notification.
 * triggerTime is "HH:MM" for today. If that time has already passed, no-op.
 */
export async function scheduleNudge(nudge: NudgeItem): Promise<void> {
  const N = getNotifications();
  if (!N || Platform.OS === 'web') return;

  // Cancel existing notification for this nudge (if rescheduling)
  await cancelNudge(nudge.id);

  const [h, m] = nudge.triggerTime.split(':').map(Number);
  const trigger = new Date();
  trigger.setHours(h, m, 0, 0);

  if (trigger.getTime() <= Date.now()) return; // already passed

  try {
    const title   = nudge.urgency === 'critical' || nudge.urgency === 'high'
      ? `⚡ ${nudge.itemTitle}`
      : nudge.itemTitle;
    const body    = nudge.contextReason ?? `Time to focus on ${nudge.itemTitle}`;

    const osId = await N.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          nudgeId:   nudge.id,
          itemId:    nudge.itemId,
          itemTitle: nudge.itemTitle,
          type:      nudge.type,
        },
        sound: undefined,
      },
      trigger: {
        hour:      h,
        minute:    m,
        repeats:   false,
        ...(Platform.OS === 'android' && { channelId: 'lifeos-nudges' }),
      } as any,
    });
    scheduledIds.set(nudge.id, osId);
  } catch (err) {
    console.warn('[notificationService] scheduleNudge failed:', err);
  }
}

/**
 * Cancel a scheduled OS notification for a nudge.
 */
export async function cancelNudge(nudgeId: string): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  const osId = scheduledIds.get(nudgeId);
  if (!osId) return;
  try {
    await N.cancelScheduledNotificationAsync(osId);
    scheduledIds.delete(nudgeId);
  } catch {
    scheduledIds.delete(nudgeId);
  }
}

/**
 * Cancel all scheduled nudge notifications and reschedule from a new list.
 * Call this whenever a new plan is generated.
 */
export async function rescheduleNudges(nudges: NudgeItem[]): Promise<void> {
  const N = getNotifications();
  if (!N || Platform.OS === 'web') return;

  // Cancel all tracked notifications
  for (const [, osId] of scheduledIds.entries()) {
    await N.cancelScheduledNotificationAsync(osId).catch(() => {});
  }
  scheduledIds.clear();

  // Schedule each nudge
  for (const nudge of nudges) {
    if (!nudge.snoozedUntil) {
      await scheduleNudge(nudge);
    }
  }
}

// ─── Academic reminders ───────────────────────────────────────────────────────

const EXAM_REMINDER_IDS = new Map<string, string[]>(); // examId → [osId, ...]

/**
 * Schedule OS notifications for an upcoming exam.
 * Fires at 08:00 on: 7 days before, 3 days before, and 1 day before.
 * Safe to call multiple times — cancels previous reminders first.
 */
export async function scheduleExamReminder(exam: Exam, courseName: string): Promise<void> {
  const N = getNotifications();
  if (!N || Platform.OS === 'web') return;

  // Cancel previous notifications for this exam
  const prevIds = EXAM_REMINDER_IDS.get(exam.id) ?? [];
  for (const osId of prevIds) {
    await N.cancelScheduledNotificationAsync(osId).catch(() => {});
  }
  EXAM_REMINDER_IDS.set(exam.id, []);

  const examDate = new Date(exam.date + 'T00:00:00');
  const nowMs = Date.now();
  const newIds: string[] = [];

  for (const daysBefore of [7, 3, 1]) {
    const triggerDate = new Date(examDate.getTime() - daysBefore * 86_400_000);
    triggerDate.setHours(8, 0, 0, 0);
    if (triggerDate.getTime() <= nowMs) continue; // already past

    const urgency = daysBefore === 1 ? '🔴' : daysBefore === 3 ? '🟡' : '📚';
    try {
      const osId = await N.scheduleNotificationAsync({
        content: {
          title: `${urgency} ${exam.title} — ${daysBefore} day${daysBefore !== 1 ? 's' : ''} away`,
          body:  `${courseName} exam on ${exam.date}${exam.topics.length ? `. Topics: ${exam.topics.slice(0, 3).join(', ')}` : ''}`,
          data:  { type: 'learning', examId: exam.id, courseId: exam.courseId },
          sound: undefined,
          ...(Platform.OS === 'android' && { channelId: 'lifeos-nudges' }),
        },
        trigger: { date: triggerDate } as any,
      });
      newIds.push(osId);
    } catch (err) {
      console.warn('[notificationService] examReminder failed:', err);
    }
  }

  if (newIds.length) EXAM_REMINDER_IDS.set(exam.id, newIds);
}

/**
 * Schedule a same-day assignment reminder at 08:00.
 */
export async function scheduleAssignmentReminder(
  assignmentId: string,
  title: string,
  dueDate: string,        // YYYY-MM-DD
  courseName: string,
): Promise<void> {
  const N = getNotifications();
  if (!N || Platform.OS === 'web') return;

  const trigger = new Date(dueDate + 'T08:00:00');
  if (trigger.getTime() <= Date.now()) return;

  try {
    await N.scheduleNotificationAsync({
      content: {
        title: `📋 Due today: ${title}`,
        body:  `${courseName} assignment is due today`,
        data:  { type: 'learning', assignmentId },
        sound: undefined,
        ...(Platform.OS === 'android' && { channelId: 'lifeos-nudges' }),
      },
      trigger: { date: trigger } as any,
    });
  } catch (err) {
    console.warn('[notificationService] assignmentReminder failed:', err);
  }
}

// ─── Proactive risk alert (once per calendar day) ────────────────────────────

const RISK_ALERT_KEY = 'lifeos:last-risk-alert-date';

/**
 * Fires a readiness-aware alert notification when CRITICAL or HIGH risks exist.
 * Guards to once per calendar day using AsyncStorage so repeated hydrations
 * don't spam the user.
 */
export async function scheduleProactiveRiskAlert(risks: AcademicRisk[]): Promise<void> {
  const N = getNotifications();
  if (!N || Platform.OS === 'web' || risks.length === 0) return;

  const today = new Date().toISOString().slice(0, 10);
  try {
    const lastDate = await AsyncStorage.getItem(RISK_ALERT_KEY);
    if (lastDate === today) return; // already alerted today
  } catch { /* ignore storage error */ }

  const critical = risks.find((r) => r.riskLevel === 'critical');
  const top = critical ?? risks[0];

  const title = critical ? `⚠️ Critical: ${top.courseName}` : `📚 Study Alert: ${top.courseName}`;
  const body  = `${top.reason} — ${top.actionRequired}`;

  try {
    const trigger = new Date();
    trigger.setSeconds(trigger.getSeconds() + 5); // fire ~5s after app open
    await N.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'learning', screen: '/(tabs)/study' },
        sound: undefined,
        ...(Platform.OS === 'android' && { channelId: 'lifeos-nudges' }),
      },
      trigger: { date: trigger } as any,
    });
    await AsyncStorage.setItem(RISK_ALERT_KEY, today);
  } catch (err) {
    console.warn('[notificationService] proactiveRiskAlert failed:', err);
  }
}

// ─── Stagnation alert (once per calendar day per project) ────────────────────

const STAGNATION_KEY_PREFIX = 'lifeos:stagnation-alert:';

/**
 * Fires a push notification for the highest-risk stalled project.
 * Guards to once per calendar day per project via AsyncStorage.
 */
export async function scheduleStagnationAlert(risks: ProjectRisk[]): Promise<void> {
  const N = getNotifications();
  if (!N || Platform.OS === 'web' || risks.length === 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const top   = risks[0];

  const key = STAGNATION_KEY_PREFIX + top.projectId;
  try {
    const lastDate = await AsyncStorage.getItem(key);
    if (lastDate === today) return;
  } catch { /* ignore */ }

  const isCritical = top.riskLevel === 'critical';
  const title = isCritical
    ? `🚨 ${top.projectName} is critical`
    : `⚠️ ${top.projectName} needs attention`;
  const body  = `${top.reason} — ${top.actionRequired}`;

  try {
    const trigger = new Date();
    trigger.setSeconds(trigger.getSeconds() + 8);
    await N.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'builder', screen: '/(tabs)/projects' },
        sound: undefined,
        ...(Platform.OS === 'android' && { channelId: 'lifeos-nudges' }),
      },
      trigger: { date: trigger } as any,
    });
    await AsyncStorage.setItem(key, today);
  } catch (err) {
    console.warn('[notificationService] stagnationAlert failed:', err);
  }
}

/**
 * Cancel all pending notifications (e.g., on sign-out).
 */
export async function cancelAllNotifications(): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
    scheduledIds.clear();
  } catch (err) {
    console.warn('[notificationService] cancelAll failed:', err);
  }
}

// ─── Tap handler ──────────────────────────────────────────────────────────────

type NotificationRouter = (screen: string, params?: Record<string, string>) => void;

let _router: NotificationRouter | null = null;

/**
 * Register a navigation callback for notification taps.
 * Call this from the root layout after the router is ready.
 */
export function registerNotificationRouter(router: NotificationRouter): void {
  _router = router;
}

/**
 * Handle a notification tap. Call from the notification response listener.
 * Routes the user to the correct screen based on nudge type.
 */
export function handleNotificationTap(
  data: Record<string, unknown>,
): void {
  if (!_router) return;
  const { type, itemId } = data;

  // If a specific screen is embedded in the data, use it directly
  const screen = typeof data.screen === 'string' ? data.screen : null;

  switch (type) {
    case 'start':
    case 'missed':
    case 'recovery':
    case 'opportunity':
      _router(screen ?? '/(tabs)/home');
      break;
    case 'learning':
      _router(screen ?? '/(tabs)/study');
      break;
    case 'project':
    case 'builder':
      _router(screen ?? '/(tabs)/projects');
      break;
    default:
      _router(screen ?? '/(tabs)/home');
  }
}

/**
 * Set up the notification response listener (called once at app root).
 * Returns a cleanup function to call on unmount.
 */
export function setupNotificationListener(): (() => void) {
  const N = getNotifications();
  if (!N) return () => {};

  const subscription = N.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    handleNotificationTap(data);
  });

  return () => subscription.remove();
}
