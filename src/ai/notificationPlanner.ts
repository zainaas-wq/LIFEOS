/**
 * LifeOS Notification Planner
 *
 * Pure functions that compute WHAT to notify and WHEN.
 * No side effects, no expo-notifications imports, no React.
 * Safe to import in Node test environments.
 *
 * Notification policy constants:
 *   TASK_START_LEAD_MINS  = 5   — fire 5 min before item startTime
 *   TASK_MISSED_LAG_MINS  = 10  — fire 10 min after item startTime (if incomplete)
 *   MAX_TASK_NOTIFS       = 3   — max upcoming task start notifications at once
 *   QUIET_START_HOUR      = 22  — no notifications at or after 22:00
 *   QUIET_END_HOUR        = 7   — no notifications before 07:00
 *   DRIFT_DELAY_MINS      = 15  — drift notification fires 15 min after detection
 *   REVIEW_FALLBACK_HOUR  = 21  — default review reminder hour (9 PM)
 *   MIN_REVIEW_HOUR       = 18  — review reminder never before 6 PM
 */

import type { PlanItem } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

export const TASK_START_LEAD_MINS = 5;
export const TASK_MISSED_LAG_MINS = 10;
export const MAX_TASK_NOTIFS      = 3;
export const QUIET_START_HOUR     = 22;
export const QUIET_END_HOUR       = 7;
export const DRIFT_DELAY_MINS     = 15;
export const REVIEW_FALLBACK_HOUR = 21;
export const MIN_REVIEW_HOUR      = 18;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationCandidate {
  /** Notification identifier (e.g. "task-start-abc123"). */
  id: string;
  title: string;
  body: string;
  /** Minutes from midnight at which this notification should fire. */
  triggerMins: number;
  /** Auxiliary data for tap handler routing. */
  data: Record<string, string>;
}

export interface TaskNotificationPair {
  itemId: string;
  startCandidateMins: number;   // when to fire the "about to start" notification
  missedCandidateMins: number;  // when to fire the "you missed this" notification
  title: string;
  isCritical: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns whether the given hour is inside the quiet window.
 * Quiet window: [QUIET_START_HOUR, 24) ∪ [0, QUIET_END_HOUR).
 * No notifications during this range regardless of content.
 */
export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * Selects upcoming actionable plan items that should receive notifications.
 *
 * Rules:
 *  - Only goal/skill type items
 *  - Not already completed
 *  - Start time is after (nowMins - TASK_MISSED_LAG_MINS) — still worth notifying
 *  - Sorted ascending by startTime
 *  - Capped at MAX_TASK_NOTIFS entries
 *
 * @param items    All plan items for today
 * @param nowMins  Current time in minutes from midnight
 * @param max      Override for max count (default MAX_TASK_NOTIFS)
 */
export function selectNotificationItems(
  items: PlanItem[],
  nowMins: number,
  max = MAX_TASK_NOTIFS,
): PlanItem[] {
  return items
    .filter((i) => (i.type === 'goal' || i.type === 'skill') && !i.completed)
    .filter((i) => timeStrToMins(i.startTime) > nowMins - TASK_MISSED_LAG_MINS)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, max);
}

/**
 * For a given plan item, returns the minute-offsets at which notifications
 * should fire (start notification and missed notification).
 *
 * Both are relative to the item's startTime in minutes from midnight.
 * The caller is responsible for converting to absolute Date objects.
 */
export function getTaskNotificationMins(item: PlanItem): TaskNotificationPair {
  const startMins = timeStrToMins(item.startTime);
  return {
    itemId:              item.id,
    startCandidateMins:  startMins - TASK_START_LEAD_MINS,
    missedCandidateMins: startMins + TASK_MISSED_LAG_MINS,
    title:               item.title,
    isCritical:          !!item.isCritical,
  };
}

/**
 * Derives the review reminder hour from the user's sleep-time config.
 *
 * Logic:
 *   If fixedScheduleEnd is set (e.g. "22:00") → reminder = (sleepHour - 1)
 *   Result is clamped to [MIN_REVIEW_HOUR, QUIET_START_HOUR - 1]
 *   Fallback: REVIEW_FALLBACK_HOUR (21:00)
 */
export function deriveReviewReminderHour(fixedScheduleEnd?: string): number {
  if (!fixedScheduleEnd) return REVIEW_FALLBACK_HOUR;
  const parts = fixedScheduleEnd.split(':');
  if (parts.length < 2) return REVIEW_FALLBACK_HOUR;
  const sleepHour = parseInt(parts[0], 10);
  if (isNaN(sleepHour)) return REVIEW_FALLBACK_HOUR;
  const candidate = sleepHour - 1;
  return Math.max(MIN_REVIEW_HOUR, Math.min(QUIET_START_HOUR - 1, candidate));
}

/**
 * Builds notification content for a task-start notification.
 */
export function buildTaskStartContent(item: PlanItem): { title: string; body: string } {
  const prefix = item.isCritical ? '⭐ ' : '';
  return {
    title: `${prefix}Starting soon: ${item.title}`,
    body:  item.isCritical
      ? 'Your critical task starts in 5 min — get ready'
      : 'Starts in 5 min — wrap up and get focused',
  };
}

/**
 * Builds notification content for a task-missed notification.
 */
export function buildTaskMissedContent(item: PlanItem): { title: string; body: string } {
  return {
    title: `Missed: ${item.title}`,
    body:  'This task started 10 min ago — still time to begin',
  };
}

/**
 * Builds notification content for the drift intervention notification.
 */
export function buildDriftContent(): { title: string; body: string } {
  return {
    title: 'LifeOS: Your day may be drifting',
    body:  'Open the app to recover and get back on track',
  };
}

/**
 * Builds notification content for the end-of-day review reminder.
 */
export function buildReviewReminderContent(): { title: string; body: string } {
  return {
    title: 'LifeOS: Close the loop on today',
    body:  'Take 2 minutes to review — it shapes tomorrow\'s plan',
  };
}

// ─── Notification ID helpers ──────────────────────────────────────────────────

export const NOTIF_IDS = {
  taskStart:  (itemId: string) => `task-start-${itemId}`,
  taskMissed: (itemId: string) => `task-missed-${itemId}`,
  drift:      'drift-intervention' as const,
  review:     'review-reminder' as const,
  retention:  'retention-nudge' as const,
};

/**
 * Notification category identifiers — one per notification type.
 * Each category maps to a set of action buttons registered at app startup.
 *
 * Action identifiers used across categories:
 *   "start_now"   — open app + navigate to home (task start)
 *   "snooze"      — no navigation (task start)
 *   "open"        — open app + navigate to home (missed / drift / retention)
 *   "review_now"  — open app + navigate to review
 *   "later"       — no navigation (review reminder)
 */
export const NOTIF_CATEGORIES = {
  taskStart:  'task_start'       as const,
  taskMissed: 'task_missed'      as const,
  drift:      'drift_alert'      as const,
  review:     'review_reminder'  as const,
  retention:  'retention_nudge'  as const,
} as const;

/** Action identifiers used in notification categories. */
export const NOTIF_ACTIONS = {
  startNow:  'start_now'  as const,
  snooze:    'snooze'     as const,
  open:      'open'       as const,
  reviewNow: 'review_now' as const,
  later:     'later'      as const,
  default:   'expo.modules.notifications.actions.DEFAULT' as const,
} as const;

/**
 * Builds notification content for a retention re-engagement nudge.
 *
 * Sent when the user hasn't opened the app for ≥ 1 day.
 * Tone: soft, forward-facing, no guilt.
 *
 * @param missedDays - Days since last user activity (≥ 1).
 */
export function buildRetentionNudgeContent(
  missedDays: number,
): { title: string; body: string } {
  if (missedDays === 1) {
    return {
      title: 'LifeOS: Start small today',
      body:  'Just do the first task — nothing else needed',
    };
  }
  if (missedDays === 2) {
    return {
      title: 'LifeOS: Pick up where you left off',
      body:  'One step at a time. Your plan is still here.',
    };
  }
  return {
    title: 'LifeOS is ready when you are',
    body:  'Start light. The system adjusts to where you are.',
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Converts "HH:MM" to minutes from midnight. */
export function timeStrToMins(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
