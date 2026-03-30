/**
 * analyticsService — lightweight behavioral event tracking.
 *
 * Design contract:
 *   - track() is fire-and-forget: returns void synchronously, never throws.
 *   - Events are queued in memory and batch-flushed to Supabase every 3s,
 *     or immediately when the queue reaches MAX_BATCH (50).
 *   - The queue is persisted to AsyncStorage so events survive app kills.
 *     On cold start, the persisted queue is reloaded and flushed first.
 *   - Properties must contain only scalar values. No raw message content,
 *     no plan data, no PII beyond user_id (from auth session).
 *   - Both authenticated and guest (user_id = null) events are supported.
 *
 * Fail-open guarantee:
 *   Any error in flush or persistence is silently swallowed.
 *   Analytics must never affect product functionality.
 *
 * Data model boundary:
 *   - Analytics events:  ephemeral stream → analytics_events Supabase table.
 *   - Product state:     Zustand store (NOT here).
 *   - User data:         daily_reviews, goals etc. (NOT here).
 *   - Memory signals:    ai_user_memory via memoryService (NOT here).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

// ─── Event name registry ──────────────────────────────────────────────────────

export type AnalyticsEventName =
  // ── Product / business events (pre-existing) ─────────────────────────────
  | 'app_opened'
  | 'onboarding_completed'
  | 'ai_chat_used'
  | 'build_day_used'
  | 'recover_day_used'
  | 'weekly_review_used'
  | 'upgrade_cta_opened'
  | 'paywall_viewed'
  | 'purchase_started'
  | 'purchase_succeeded'
  | 'purchase_restored'
  | 'quota_exhausted'
  // ── Execution events (Batch 6) ────────────────────────────────────────────
  | 'plan_generated'        // new control plan created
  | 'task_completed'        // user marked a plan item done
  | 'task_skipped'          // user explicitly skipped a plan item
  | 'drift_detected'        // drift engine fired a new drift event
  | 'recovery_applied'      // user selected a recovery mode
  | 'review_saved'          // user saved the end-of-day review
  | 'day_archived'          // day boundary crossed, enforcement archived
  // ── Notification events (Batch 6) ─────────────────────────────────────────
  | 'notification_scheduled' // local notifications scheduled for a plan
  | 'notification_opened'   // user tapped a local notification
  // ── Retention events (Batch 10) ───────────────────────────────────────────
  | 'streak_continued'       // user completed tasks on consecutive day
  | 'streak_recovered'       // user recovered after a 1-day gap (recovery saved streak)
  | 'reentry_after_gap'      // user returned after 2+ missed days
  | 'day_missed'             // day archived without a review saved
  | 'review_skipped';        // end-of-day passed without the user saving a review

// ─── Event properties ─────────────────────────────────────────────────────────

/**
 * Scalar-only properties map.
 * No objects, no arrays, no raw content — keeps payloads compact and safe.
 */
export type EventProperties = Record<string, string | number | boolean | null>;

// ─── Persisted queue key ──────────────────────────────────────────────────────

const QUEUE_KEY    = '@lifeos/analytics_queue';
const MAX_BATCH    = 50;
const FLUSH_DELAY  = 3_000; // ms — debounce window before auto-flush

// ─── In-memory queue ──────────────────────────────────────────────────────────

interface QueuedEvent {
  event_name: AnalyticsEventName;
  user_id:    string | null;
  session_id: string;
  properties: EventProperties;
  created_at: string;         // ISO — added by client so Supabase has accurate timestamps
}

const _queue: QueuedEvent[] = [];
let   _flushTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Session ID ───────────────────────────────────────────────────────────────

let _sessionId: string | null = null;

function _getSessionId(): string {
  if (!_sessionId) {
    _sessionId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  return _sessionId;
}

// ─── User ID ─────────────────────────────────────────────────────────────────

function _getUserId(): string | null {
  try {
    const { session, isGuestMode } = useAppStore.getState();
    if (isGuestMode) return null;
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Track a product analytics event.
 *
 * Fire-and-forget: returns void immediately. Never throws.
 * The event is pushed to the in-memory queue; the queue flushes
 * to Supabase asynchronously on a 3s debounce (or immediately at 50 events).
 *
 * Usage:
 *   track('task_completed', { item_type: 'goal', is_critical: 1 });
 *   track('drift_detected', { drift_type: 'avoidance', severity: 'high' });
 */
export function track(
  eventName:  AnalyticsEventName,
  properties: EventProperties = {},
): void {
  try {
    const event: QueuedEvent = {
      event_name: eventName,
      user_id:    _getUserId(),
      session_id: _getSessionId(),
      properties,
      created_at: new Date().toISOString(),
    };
    _enqueue(event);
  } catch {
    // Intentional no-op — analytics must never surface errors.
  }
}

/**
 * Force-flush the queue immediately.
 * Call on app backgrounding or before process exit to minimize event loss.
 * Fire-and-forget — errors are swallowed.
 */
export function flushAnalytics(): void {
  _flushQueue().catch(() => {});
}

// ─── Queue internals ──────────────────────────────────────────────────────────

function _enqueue(event: QueuedEvent): void {
  _queue.push(event);
  // Persist the updated queue asynchronously (crash safety)
  _persistQueue();
  if (_queue.length >= MAX_BATCH) {
    // Queue is full — flush immediately rather than waiting for debounce
    if (_flushTimer !== null) {
      clearTimeout(_flushTimer);
      _flushTimer = null;
    }
    _flushQueue().catch(() => {});
  } else {
    _scheduleFlush();
  }
}

function _scheduleFlush(): void {
  if (_flushTimer !== null) return; // already scheduled
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    _flushQueue().catch(() => {});
  }, FLUSH_DELAY);
}

async function _flushQueue(): Promise<void> {
  if (_queue.length === 0) return;

  // Splice up to MAX_BATCH events off the front of the queue
  const batch = _queue.splice(0, MAX_BATCH);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('analytics_events').insert(batch);
    // Clear persisted queue on successful flush
    AsyncStorage.removeItem(QUEUE_KEY).catch(() => {});
  } catch {
    // Re-enqueue failed batch at the front to retry on next flush
    _queue.unshift(...batch);
  }
}

// ─── AsyncStorage persistence ─────────────────────────────────────────────────

/** Persist current queue to AsyncStorage (crash safety). Non-blocking. */
function _persistQueue(): void {
  AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(_queue)).catch(() => {});
}

/**
 * Load any queue that survived a previous app kill.
 * Called once on module init. Events are prepended and flushed immediately.
 * Exported for testing — do not call in production code directly.
 */
export async function _loadPersistedQueue(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return;
    const events = JSON.parse(raw) as QueuedEvent[];
    if (!Array.isArray(events) || events.length === 0) return;
    // Prepend persisted events (they predate the current session's events)
    _queue.unshift(...events);
    // Flush immediately — don't wait for debounce
    await _flushQueue();
  } catch {
    // silent — if the persisted queue is corrupt, discard it
    AsyncStorage.removeItem(QUEUE_KEY).catch(() => {});
  }
}

// Load persisted queue on module initialization (cold start crash recovery)
_loadPersistedQueue().catch(() => {});
