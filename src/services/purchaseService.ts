/**
 * purchaseService — RevenueCat SDK wrapper with mock mode.
 *
 * Mock mode is active when:
 *   - react-native-purchases native module is unavailable (Expo Go / web), OR
 *   - EXPO_PUBLIC_RC_MOCK_MODE === 'true'  (set in eas.json development profile)
 *
 * In mock mode, purchasePro() calls activateWithBackend() directly so the full
 * backend activation path can be exercised without a real StoreKit session.
 * Once the activate-purchase Edge Function is deployed (Block C), this works
 * end-to-end even from Expo Go.
 */

import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// ── Conditional native module import ─────────────────────────────────────────
// react-native-purchases is a native module — not available in Expo Go or web.
// Wrap in try/catch so the app never hard-crashes at import time.

let RCPurchases: any = null;
try {
  const rc = require('react-native-purchases');
  RCPurchases = rc.Purchases ?? rc.default;
} catch {
  // Native module unavailable — mock mode will activate below
}

const IS_MOCK =
  !RCPurchases ||
  (__DEV__ && process.env.EXPO_PUBLIC_RC_MOCK_MODE === 'true');

// ── Config ────────────────────────────────────────────────────────────────────

const RC_API_KEY =
  Platform.OS === 'ios'
    ? (process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY     ?? '')
    : (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '');

/** RevenueCat entitlement identifier that unlocks Pro. */
const PRO_ENTITLEMENT = 'pro';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PurchaseResult =
  | { status: 'success';            tierId: 'pro' }
  | { status: 'cancelled' }
  | { status: 'activation_pending'; message: string }
  | { status: 'error';              message: string };

export type RestoreResult =
  | { restored: true;  tierId: 'pro' }
  | { restored: false; reason: 'no_active_subscription' | 'error'; message?: string };

// ── Internal state ────────────────────────────────────────────────────────────

let _initialized = false;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise RevenueCat and associate it with the Supabase user.
 * Idempotent — safe to call on every SIGNED_IN event (including token refreshes).
 * No-op in mock mode.
 */
export function initRevenueCat(userId: string): void {
  if (IS_MOCK) return;

  if (!_initialized) {
    if (!RC_API_KEY) {
      console.warn('[purchaseService] No RevenueCat API key configured for platform:', Platform.OS);
      return;
    }
    RCPurchases.configure({ apiKey: RC_API_KEY });
    _initialized = true;
  }

  // logIn is safe to call repeatedly — RC deduplicates the same userId
  RCPurchases.logIn(userId).catch((e: unknown) =>
    console.warn('[purchaseService] logIn error:', e),
  );
}

/**
 * Log out of RevenueCat on sign-out.
 * Resets to an anonymous user so no subscriber data leaks between accounts.
 */
export async function logOutRevenueCat(): Promise<void> {
  _initialized = false;
  if (IS_MOCK || !RCPurchases) return;
  try {
    await RCPurchases.logOut();
  } catch (e) {
    console.warn('[purchaseService] logOut error:', e);
  }
}

/**
 * Purchase the Pro subscription.
 *
 * Flow:
 *   1. Fetch current RC offerings.
 *   2. Purchase the first available package (StoreKit / Play Billing sheet).
 *   3. Regardless of RC entitlement state, call activateWithBackend() to
 *      upsert ai_user_tier — backend is the source of truth.
 *
 * In mock mode, skips RC entirely and calls activateWithBackend() directly.
 */
export async function purchasePro(): Promise<PurchaseResult> {
  if (IS_MOCK) {
    return activateWithBackend();
  }

  try {
    const offerings = await RCPurchases.getOfferings();
    const pkg = offerings?.current?.availablePackages?.[0];

    if (!pkg) {
      return {
        status: 'error',
        message: 'No subscription package found. Please try again later.',
      };
    }

    await RCPurchases.purchasePackage(pkg);
    // Always confirm with backend — guards against RC→backend propagation delay
    return activateWithBackend();
  } catch (e: any) {
    if (e?.userCancelled === true) {
      return { status: 'cancelled' };
    }
    return {
      status: 'error',
      message: e?.message ?? 'Purchase failed. Please try again.',
    };
  }
}

/**
 * Restore previous purchases.
 * Checks RC for an active Pro entitlement and syncs to backend if found.
 */
export async function restorePurchases(): Promise<RestoreResult> {
  if (IS_MOCK) {
    return { restored: false, reason: 'no_active_subscription' };
  }

  try {
    const customerInfo = await RCPurchases.restorePurchases();
    const isActive = !!customerInfo?.entitlements?.active?.[PRO_ENTITLEMENT];

    if (!isActive) {
      return { restored: false, reason: 'no_active_subscription' };
    }

    const result = await activateWithBackend();
    if (result.status === 'success') {
      return { restored: true, tierId: 'pro' };
    }

    return {
      restored: false,
      reason: 'error',
      message:
        result.status === 'activation_pending' || result.status === 'error'
          ? result.message
          : undefined,
    };
  } catch (e: any) {
    return {
      restored: false,
      reason: 'error',
      message: e?.message ?? 'Restore failed. Please try again.',
    };
  }
}

/**
 * Open the platform's native subscription management UI.
 * iOS: App Store subscriptions page.
 * Android: Play Store subscription management.
 */
export async function openManageSubscriptions(): Promise<void> {
  if (IS_MOCK || !RCPurchases) return;
  try {
    await RCPurchases.showManageSubscriptions();
  } catch {
    // Graceful no-op — not available on all OS versions
  }
}

// ── Offering price (for paywall display) ─────────────────────────────────────

/**
 * Price information for the current RC offering.
 * Used by the upgrade screen to display a localised price without hardcoding.
 */
export interface ProOffering {
  /** Localised price string from the store (e.g. "$4.99"). */
  priceString: string;
  productId: string;
}

/**
 * Fetch the current RC offering for the Pro subscription.
 * Returns null in mock mode, web, or if RC is not configured yet.
 * Never throws — callers treat null as "price unavailable".
 */
export async function getProOffering(): Promise<ProOffering | null> {
  if (IS_MOCK || !RCPurchases) return null;
  try {
    const offerings = await RCPurchases.getOfferings();
    const pkg = offerings?.current?.availablePackages?.[0];
    if (!pkg) return null;
    return {
      priceString: pkg.product?.priceString ?? '',
      productId:   pkg.product?.productIdentifier ?? '',
    };
  } catch {
    return null;
  }
}

// ── Private ───────────────────────────────────────────────────────────────────

/**
 * Call the activate-purchase Edge Function to upsert ai_user_tier → 'pro'.
 *
 * The Edge Function verifies the purchase with the RC REST API server-side,
 * so no client-side trust is required.
 *
 * Returns activation_pending (not error) for any non-success condition so the
 * caller can surface "Restore Purchases" as a recovery path.
 */
async function activateWithBackend(): Promise<PurchaseResult> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return {
        status: 'activation_pending',
        message: 'Please sign in again and tap "Restore Purchases" to activate Pro.',
      };
    }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    if (!supabaseUrl) {
      console.error('[purchaseService] EXPO_PUBLIC_SUPABASE_URL is not configured');
      return {
        status: 'activation_pending',
        message: 'Server configuration issue. Please contact support or restore your purchase.',
      };
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/activate-purchase`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({}),
    });

    if (res.ok) {
      return { status: 'success', tierId: 'pro' };
    }

    if (res.status === 402) {
      // RC webhook hasn't propagated the entitlement to our backend yet
      return {
        status: 'activation_pending',
        message:
          'Your purchase is being confirmed. If Pro is not active in a few minutes, tap "Restore Purchases".',
      };
    }

    return {
      status: 'activation_pending',
      message: 'Your purchase was received. Tap "Restore Purchases" if Pro is not active shortly.',
    };
  } catch {
    return {
      status: 'activation_pending',
      message:
        'Your purchase was received. Check your connection and tap "Restore Purchases" if needed.',
    };
  }
}
