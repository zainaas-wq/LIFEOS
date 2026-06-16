/**
 * analyticsService — lightweight product event tracking.
 *
 * Design contract:
 *   - track() is fire-and-forget: it returns void synchronously and never
 *     throws. Callers are never blocked and never see analytics errors.
 *   - user_id is sourced from Zustand store state (sync, no async call).
 *   - session_id is a stable in-memory string for the current app lifecycle.
 *     It is NOT persisted — a fresh ID is generated on each cold start.
 *   - properties must contain only scalar values. No raw message content,
 *     no plan data, no PII beyond user_id (which comes from the auth session).
 *   - Both authenticated and guest (user_id = null) events are supported.
 *     RLS on analytics_events enforces the correct insert path for each.
 *
 * Fail-open guarantee:
 *   Any error in _doTrack (network, Supabase, RLS) is silently swallowed.
 *   Analytics must never affect product functionality.
 */

import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

// ─── Event name registry ──────────────────────────────────────────────────────

export type AnalyticsEventName =
  // ── Core lifecycle ─────────────────────────────────────────────────────────
  | 'app_opened'
  | 'onboarding_completed'
  | 'screen_viewed'
  // ── AI ────────────────────────────────────────────────────────────────────
  | 'ai_chat_used'
  | 'ai_action_executed'
  | 'ai_action_failed'
  // ── Memory ────────────────────────────────────────────────────────────────
  | 'memory_created'
  | 'memory_deleted'
  | 'memory_searched'
  // ── Goals ─────────────────────────────────────────────────────────────────
  | 'goal_created'
  | 'goal_completed'
  | 'recommendation_accepted'
  // ── Focus ─────────────────────────────────────────────────────────────────
  | 'focus_session_started'
  | 'focus_session_completed'
  // ── Projects ──────────────────────────────────────────────────────────────
  | 'project_created'
  | 'milestone_completed'
  // ── Study ─────────────────────────────────────────────────────────────────
  | 'course_created'
  | 'exam_added'
  | 'assignment_completed'
  // ── Beta Launch ───────────────────────────────────────────────────────────
  | 'welcome_flow_seen'
  | 'welcome_flow_completed'
  | 'demo_data_loaded'
  | 'walkthrough_started'
  | 'walkthrough_completed'
  | 'walkthrough_skipped'
  // ── Phase E — Closed Beta ──────────────────────────────────────────────────
  | 'recommendation_shown'
  | 'recommendation_dismissed'
  | 'beta_feedback_submitted'
  | 'day_1_active'
  | 'day_3_active'
  | 'day_7_active'
  | 'day_14_active'
  // ── Retention ─────────────────────────────────────────────────────────────
  | 'build_day_used'
  | 'recover_day_used'
  | 'weekly_review_used'
  // ── Monetisation ──────────────────────────────────────────────────────────
  | 'upgrade_cta_opened'
  | 'paywall_viewed'
  | 'purchase_started'
  | 'purchase_succeeded'
  | 'purchase_restored'
  | 'quota_exhausted';

// ─── Event properties ─────────────────────────────────────────────────────────

/**
 * Scalar-only properties map.
 * No objects, no arrays, no raw content — keeps payloads compact and safe.
 */
export type EventProperties = Record<string, string | number | boolean | null>;

// ─── Session ID ───────────────────────────────────────────────────────────────

/**
 * Module-level session identifier.
 * Generated once per app lifecycle (cold start), not persisted.
 * Used to correlate events within a single session.
 */
let _sessionId: string | null = null;

function getSessionId(): string {
  if (!_sessionId) {
    // Not cryptographically secure — just unique enough for session correlation.
    _sessionId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  return _sessionId;
}

// ─── User ID resolution ───────────────────────────────────────────────────────

/**
 * Synchronously resolves the current user ID from Zustand store state.
 * Returns null for guest mode or unauthenticated sessions.
 * Accessing store state outside React is supported by Zustand's .getState() API.
 */
function getCurrentUserId(): string | null {
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
 * The insert runs in the background and errors are silently discarded.
 *
 * Usage:
 *   track('paywall_viewed');
 *   track('purchase_started', { product_id: offering.productId });
 *   track('ai_chat_used', { action: 'weekly_plan' });
 */
export function track(
  eventName:  AnalyticsEventName,
  properties: EventProperties = {},
): void {
  _doTrack(eventName, properties).catch(() => {
    // Intentional no-op. Analytics failures must never surface to the user.
  });
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function _doTrack(
  eventName:  AnalyticsEventName,
  properties: EventProperties,
): Promise<void> {
  const db     = supabase as any;
  const userId = getCurrentUserId();

  await db.from('analytics_events').insert({
    event_name: eventName,
    user_id:    userId,
    session_id: getSessionId(),
    properties,
  });
}
