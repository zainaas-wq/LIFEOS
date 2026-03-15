/**
 * activate-purchase — immediate post-purchase tier activation.
 *
 * POST /functions/v1/activate-purchase
 * Authorization: Bearer <supabase-jwt>
 * Body: {} (empty — user ID comes from the verified JWT, never from the client)
 *
 * Flow:
 *   1. Verify Supabase JWT, extract user ID.
 *   2. Call RevenueCat REST API server-side to fetch subscriber data.
 *   3. Confirm the 'pro' entitlement is currently active.
 *   4. Upsert ai_user_tier → 'pro' via service role (bypasses RLS).
 *   5. Return { tierId: 'pro' }.
 *
 * Returns 402 (entitlement_not_found) for any case where RC does not
 * confirm an active Pro entitlement — including RC API errors and
 * timeouts.  The client interprets 402 as activation_pending and
 * surfaces "Restore Purchases" as the recovery path.
 *
 * Security:
 *   - JWT validity is enforced by Supabase infra (verify_jwt = true default).
 *   - The RC secret API key never leaves the server.
 *   - The DB write uses SUPABASE_SERVICE_ROLE_KEY — user cannot forge it.
 *   - tier_id is always hard-coded to 'pro' here; the client cannot influence it.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Constants ────────────────────────────────────────────────────────────────

const RC_API_BASE     = 'https://api.revenuecat.com';
const PRO_ENTITLEMENT = 'pro';
const TIMEOUT_MS      = 10_000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface RCEntitlement {
  expires_date:              string | null;
  grace_period_expires_date: string | null;
  product_identifier:        string;
  purchase_date:             string;
}

interface RCSubscriber {
  app_user_id:  string;
  entitlements: Record<string, RCEntitlement> | null;
}

interface ErrorBody {
  error: string;
  code:  'auth_required' | 'entitlement_not_found' | 'server_error';
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function jsonError(message: string, code: ErrorBody['code'], status: number): Response {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function jsonOk(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ─── Entitlement check ────────────────────────────────────────────────────────

/**
 * Returns true when the entitlement is currently active.
 *
 * Active means:
 *   - The entitlement key exists in subscriber.entitlements, AND
 *   - Either expires_date is null (lifetime/no expiry), OR
 *   - expires_date is in the future, OR
 *   - grace_period_expires_date is in the future (payment issue grace period).
 *
 * RC REST API v1 includes all entitlements in the response (active and
 * expired), so we must check expiry ourselves.
 */
function isEntitlementActive(subscriber: RCSubscriber, entitlementId: string): boolean {
  const ent = subscriber.entitlements?.[entitlementId];
  if (!ent) return false;

  const now = Date.now();

  // Still in grace period (e.g. billing issue but RC hasn't expired yet)
  if (ent.grace_period_expires_date) {
    if (new Date(ent.grace_period_expires_date).getTime() > now) return true;
  }

  // No expiry = lifetime / active indefinitely
  if (!ent.expires_date) return true;

  // Expires in the future = still active
  return new Date(ent.expires_date).getTime() > now;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 'server_error', 405);
  }

  // ── Auth: extract user from Supabase JWT ──────────────────────────────────
  // Supabase infrastructure validates JWT before invoking this function
  // (verify_jwt = true by default).  We still need to call getUser() to
  // extract the user ID.

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError('Authentication required', 'auth_required', 401);
  }

  const supabaseUrl     = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const rcSecretKey     = Deno.env.get('REVENUECAT_SECRET_API_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error('[activate-purchase] Missing Supabase environment variables');
    return jsonError('Server misconfigured', 'server_error', 500);
  }
  if (!rcSecretKey) {
    console.error('[activate-purchase] REVENUECAT_SECRET_API_KEY is not configured');
    return jsonError('Server misconfigured', 'server_error', 500);
  }

  // User client — JWT has already been validated by Supabase infra.
  // getUser() extracts the identity from the already-verified token.
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonError('Invalid or expired token', 'auth_required', 401);
  }

  // Admin client — service role bypasses RLS for the tier upsert.
  // deno-lint-ignore no-explicit-any
  const adminClient: any = createClient(supabaseUrl, serviceRoleKey);

  // ── Call RevenueCat REST API ───────────────────────────────────────────────
  // Fetch the subscriber record server-side.  We never trust client-supplied
  // CustomerInfo — only the RC REST API response is authoritative here.

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let subscriber: RCSubscriber | null = null;

  try {
    const res = await fetch(
      `${RC_API_BASE}/v1/subscribers/${encodeURIComponent(user.id)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${rcSecretKey}`,
          'Content-Type':  'application/json',
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);

    if (!res.ok) {
      if (res.status === 404) {
        // Subscriber not in RC yet — purchase hasn't propagated server-side
        console.warn(`[activate-purchase] RC subscriber not found for user ${user.id}`);
        return jsonError('Entitlement not yet active', 'entitlement_not_found', 402);
      }
      const text = await res.text().catch(() => '');
      if (res.status === 401) {
        // 401 from RC always means the secret key is wrong — surface clearly for ops
        console.error('[activate-purchase] RC API returned 401 — check REVENUECAT_SECRET_API_KEY');
      } else if (res.status >= 500) {
        console.error(`[activate-purchase] RC API server error ${res.status}: ${text.slice(0, 200)}`);
      } else {
        console.warn(`[activate-purchase] RC API returned ${res.status}: ${text.slice(0, 200)}`);
      }
      return jsonError('Entitlement not yet active', 'entitlement_not_found', 402);
    }

    const data = await res.json();
    subscriber  = (data?.subscriber as RCSubscriber) ?? null;

  } catch (err: unknown) {
    clearTimeout(timer);
    const name = err instanceof Error ? err.name    : '';
    const msg  = err instanceof Error ? err.message : String(err);

    if (name === 'AbortError' || msg.includes('AbortError') || msg.toLowerCase().includes('aborted')) {
      console.warn('[activate-purchase] RC API timed out');
    } else {
      console.error('[activate-purchase] RC API fetch error:', msg);
    }
    return jsonError('Entitlement not yet active', 'entitlement_not_found', 402);
  }

  // ── Verify entitlement ────────────────────────────────────────────────────
  if (!subscriber || !isEntitlementActive(subscriber, PRO_ENTITLEMENT)) {
    console.warn(`[activate-purchase] Pro entitlement not active for user ${user.id}`);
    return jsonError('Entitlement not yet active', 'entitlement_not_found', 402);
  }

  // ── Upsert ai_user_tier → pro ─────────────────────────────────────────────
  // rc_event_at is set to now() as a synthetic anchor timestamp.
  // This prevents a stale EXPIRATION webhook (from a previous subscription
  // period) from downgrading the user after this fresh activation.
  // A future EXPIRATION event will have event_timestamp_ms > now(), so it
  // will correctly pass the ordering check in rc-webhook.

  const now = new Date().toISOString();

  const { error: upsertError } = await adminClient
    .from('ai_user_tier')
    .upsert(
      {
        user_id:     user.id,
        tier_id:     'pro',
        rc_event_at: now,
        updated_at:  now,
      },
      { onConflict: 'user_id' },
    );

  if (upsertError) {
    console.error('[activate-purchase] upsert failed:', upsertError.message);
    return jsonError('Failed to activate subscription', 'server_error', 500);
  }

  console.log(`[activate-purchase] Activated pro for user ${user.id}`);
  return jsonOk({ tierId: 'pro' });
});
