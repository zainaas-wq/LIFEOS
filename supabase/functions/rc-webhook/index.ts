/**
 * rc-webhook — RevenueCat lifecycle event handler.
 *
 * POST /functions/v1/rc-webhook
 * Authorization: <REVENUECAT_WEBHOOK_AUTH>  (raw shared secret, no Bearer prefix)
 *
 * Synchronises ai_user_tier with RevenueCat entitlement state for lifecycle
 * events that cannot be handled by the activate-purchase fast path.
 *
 * Event routing:
 *   UPGRADE events   → upsert ai_user_tier → 'pro'
 *   EXPIRATION       → downgrade to 'free' (only if event is not stale)
 *   CANCELLATION     → no-op  (subscription still active until period end)
 *   BILLING_ISSUE    → no-op  (may self-heal; EXPIRATION handles final downgrade)
 *   all others       → no-op, logged
 *
 * The backend invariant maintained here:
 *   ai_user_tier = 'pro'  only when RC confirms active Pro entitlement.
 *   ai_user_tier = 'free' when the Pro subscription has definitively expired.
 *
 * Stale-event protection:
 *   rc_event_at tracks the timestamp of the last processed RC event.
 *   EXPIRATION events are skipped when their event_timestamp_ms is not
 *   newer than the stored rc_event_at — preventing an old EXPIRATION from
 *   overwriting a fresh INITIAL_PURCHASE or activate-purchase confirmation.
 *
 * Security:
 *   - verify_jwt = false (supabase/config.toml) — RC has no Supabase JWT.
 *   - Shared secret validation is the first operation in the handler.
 *   - DB writes use SUPABASE_SERVICE_ROLE_KEY — RC cannot forge them.
 *   - app_user_id is validated as a UUID before any DB operation.
 *
 * Response contract:
 *   200 — processed, acknowledged, or deliberate no-op  (RC will NOT retry)
 *   401 — auth failure                                    (RC will NOT retry)
 *   400 — malformed payload                               (RC will NOT retry)
 *   500 — transient server/DB error                       (RC WILL retry)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RCEvent {
  type:                 string;
  app_user_id:          string;
  original_app_user_id: string;
  id:                   string;
  event_timestamp_ms:   number;
  product_id?:          string;
  entitlement_ids?:     string[];
  entitlement_id?:      string;
}

interface RCWebhookBody {
  event:        RCEvent;
  api_version?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRO_ENTITLEMENT = 'pro';

/**
 * Events that confirm an active Pro subscription.
 * All result in an unconditional upsert to tier_id = 'pro'.
 */
const UPGRADE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',   // user re-enabled auto-renew before expiry
  'PRODUCT_CHANGE',   // user changed plan (within Pro tier)
]);

/**
 * Events that confirm Pro has definitively ended.
 * Subject to stale-event protection (see maybeDowngradeTier).
 */
const DOWNGRADE_EVENTS = new Set(['EXPIRATION']);

// UUID format expected from app_user_id (= Supabase user ID set via logIn())
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Entitlement scope helper ─────────────────────────────────────────────────

/**
 * Returns true if this event affects the 'pro' entitlement.
 *
 * When entitlement_ids is absent or empty we conservatively assume the
 * event affects 'pro'.  This handles older RC event versions that omit
 * the field, and is safe for a single-subscription app.
 */
function affectsProEntitlement(event: RCEvent): boolean {
  const ids: string[] =
    event.entitlement_ids ??
    (event.entitlement_id ? [event.entitlement_id] : []);
  return ids.length === 0 || ids.includes(PRO_ENTITLEMENT);
}

// ─── Database helpers ─────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type AdminClient = any;

/**
 * Unconditionally upsert ai_user_tier.
 * Used for all upgrade events — granting pro to an already-pro user is safe.
 * Sets rc_event_at so future EXPIRATION events can detect if they're stale.
 */
async function upgradeTier(
  client:           AdminClient,
  userId:           string,
  tierId:           string,
  eventTimestampMs: number,
): Promise<void> {
  const { error } = await client
    .from('ai_user_tier')
    .upsert(
      {
        user_id:     userId,
        tier_id:     tierId,
        rc_event_at: new Date(eventTimestampMs).toISOString(),
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) throw new Error(`upgradeTier failed: ${error.message}`);
}

/**
 * Downgrade ai_user_tier to 'free', but only if the EXPIRATION event is
 * newer than the last RC event we processed for this user.
 *
 * This protects against the following scenario:
 *   1. User's old subscription expired  → EXPIRATION arrives (ts=T_old)
 *   2. User immediately buys new sub    → activate-purchase sets rc_event_at=now
 *   3. Stale EXPIRATION arrives late    → event_timestamp_ms=T_old < rc_event_at
 *      → downgrade is SKIPPED ✓
 *
 * If no row exists (edge case: row was deleted after initial setup), the
 * function inserts a new 'free' row.  The FK constraint on user_id ensures
 * we only write for valid Supabase users.
 */
async function maybeDowngradeTier(
  client:           AdminClient,
  userId:           string,
  eventTimestampMs: number,
): Promise<{ applied: boolean; reason: string }> {
  // Read current rc_event_at to perform ordering check
  const { data: current, error: selectError } = await client
    .from('ai_user_tier')
    .select('rc_event_at, tier_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`maybeDowngradeTier select failed: ${selectError.message}`);
  }

  if (current) {
    // 0 means "no previous event" — any real timestamp will be newer
    const lastEventAt = current.rc_event_at
      ? new Date(current.rc_event_at).getTime()
      : 0;

    if (eventTimestampMs <= lastEventAt) {
      return { applied: false, reason: 'stale_event' };
    }
  }

  const { error: upsertError } = await client
    .from('ai_user_tier')
    .upsert(
      {
        user_id:     userId,
        tier_id:     'free',
        rc_event_at: new Date(eventTimestampMs).toISOString(),
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (upsertError) {
    throw new Error(`maybeDowngradeTier upsert failed: ${upsertError.message}`);
  }

  return { applied: true, reason: '' };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ── Auth: validate shared secret ──────────────────────────────────────────
  // This is the only auth mechanism — Supabase JWT verification is disabled
  // for this function (verify_jwt = false in supabase/config.toml).

  const expectedAuth = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!expectedAuth) {
    console.error('[rc-webhook] REVENUECAT_WEBHOOK_AUTH is not configured');
    return new Response('Server misconfigured', { status: 500 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== expectedAuth) {
    console.warn('[rc-webhook] Rejected: auth header mismatch');
    return new Response('Unauthorized', { status: 401 });
  }

  // ── Setup admin client ────────────────────────────────────────────────────
  const supabaseUrl    = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[rc-webhook] Missing Supabase environment variables');
    return new Response('Server misconfigured', { status: 500 });
  }

  const adminClient: AdminClient = createClient(supabaseUrl, serviceRoleKey);

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: RCWebhookBody;
  try {
    body = await req.json() as RCWebhookBody;
  } catch {
    console.warn('[rc-webhook] Failed to parse JSON body');
    // 400 — malformed: RC should not retry this
    return new Response('Bad request', { status: 400 });
  }

  const event = body?.event;
  if (
    !event ||
    typeof event.type         !== 'string' ||
    typeof event.app_user_id  !== 'string' ||
    typeof event.event_timestamp_ms !== 'number'
  ) {
    console.warn('[rc-webhook] Invalid event shape:', JSON.stringify(body).slice(0, 200));
    // Return 200 — don't let RC retry a structurally invalid payload forever
    return new Response('OK', { status: 200 });
  }

  const { type: eventType, app_user_id: appUserId, event_timestamp_ms: eventTimestampMs } = event;

  // ── Validate app_user_id ──────────────────────────────────────────────────
  // RC may send events for anonymous users or test subscribers whose IDs are
  // not Supabase UUIDs.  Skip these cleanly rather than failing the DB write.
  if (!UUID_RE.test(appUserId)) {
    console.log(`[rc-webhook] Skipping non-UUID app_user_id for event ${eventType}: ${appUserId}`);
    return new Response('OK', { status: 200 });
  }

  // ── Route by event type ───────────────────────────────────────────────────
  console.log(`[rc-webhook] event=${eventType} user=${appUserId} ts=${eventTimestampMs}`);

  try {
    if (UPGRADE_EVENTS.has(eventType)) {
      if (!affectsProEntitlement(event)) {
        console.log(`[rc-webhook] ${eventType} does not affect '${PRO_ENTITLEMENT}' — skipping`);
        return new Response('OK', { status: 200 });
      }

      await upgradeTier(adminClient, appUserId, 'pro', eventTimestampMs);
      console.log(`[rc-webhook] Upgraded to pro: user=${appUserId} event=${eventType}`);

    } else if (DOWNGRADE_EVENTS.has(eventType)) {
      if (!affectsProEntitlement(event)) {
        console.log(`[rc-webhook] ${eventType} does not affect '${PRO_ENTITLEMENT}' — skipping`);
        return new Response('OK', { status: 200 });
      }

      const result = await maybeDowngradeTier(adminClient, appUserId, eventTimestampMs);

      if (result.applied) {
        console.log(`[rc-webhook] Downgraded to free: user=${appUserId} event=${eventType}`);
      } else {
        // Stale event — subscription was re-activated after the event was issued.
        // This is expected when a user purchases immediately after expiry.
        console.log(
          `[rc-webhook] Downgrade skipped (${result.reason}): user=${appUserId} event=${eventType}`,
        );
      }

    } else {
      // ── No-op events ───────────────────────────────────────────────────────
      //
      // CANCELLATION:  User cancelled auto-renew.  Subscription remains active
      //   until the current period ends.  EXPIRATION will fire later to
      //   trigger the actual downgrade.  Downgrading here would incorrectly
      //   remove access for remaining paid days.
      //
      // BILLING_ISSUE: Payment failed.  RC enters a grace period / retry cycle.
      //   The subscription may self-heal.  Only downgrade on EXPIRATION after
      //   all retries are exhausted.
      //
      // TRANSFER, SUBSCRIBER_ALIAS, TEST, and any future event types: log only.
      console.log(`[rc-webhook] No-op for event type '${eventType}' — no tier change`);
    }

  } catch (err: unknown) {
    // DB errors are transient — return 500 so RC retries the webhook.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[rc-webhook] DB error for user=${appUserId} event=${eventType}:`, msg);
    return new Response('Internal server error', { status: 500 });
  }

  // 200 tells RC the event was received and processed (or was a deliberate no-op).
  // RC does not retry on 200.
  return new Response('OK', { status: 200 });
});
