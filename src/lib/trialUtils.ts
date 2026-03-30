/**
 * trialUtils.ts — Single source of truth for trial / subscription state.
 *
 * SubscriptionState:
 *   trial_active  — within the 3-day free trial window
 *   trial_expired — trial ended, no purchase
 *   pro           — active RevenueCat subscription
 *
 * All access-control decisions use computeSubscriptionState().
 * Never use local flags (paywallSeen etc.) for gating.
 *
 * ─── PRODUCTION HARDENING NOTE ────────────────────────────────────────────────
 * The current implementation uses a locally-persisted trialStartDate (Zustand /
 * AsyncStorage). This is acceptable for beta and development but has gaps in
 * production:
 *
 *   - Uninstall + reinstall → trialStartDate resets → user gets another trial
 *   - resetAllData() → same effect
 *   - AsyncStorage tampering → date can be pushed forward
 *
 * Production fix (3 steps):
 *
 *   1. Schema: Add `trial_started_at TIMESTAMPTZ` to `ai_user_tier` (Supabase).
 *      Set it server-side on profile creation — COALESCE to make it set-once.
 *
 *   2. Sync: `usageService.ts` selects `trial_started_at`; `hydrateFromCloud`
 *      stores it as `serverTrialStartDate` in the Zustand store. Update this
 *      function to accept `serverTrialStartDate` as an additional param and
 *      prefer it over the local value:
 *        const authoritative = serverTrialStartDate ?? localTrialStartDate;
 *
 *   3. RevenueCat: RC tracks introductory offer eligibility per entitlement.
 *      On reinstall, RC will not offer a second free trial — the billing layer
 *      enforces this automatically. `isPro` is the RC-authoritative signal here.
 *
 * Until step 1–2 are implemented, the local trialStartDate is the app's gate.
 * The RC entitlement check (isPro) is already server-authoritative.
 * ──────────────────────────────────────────────────────────────────────────────
 */

export type SubscriptionState = 'trial_active' | 'trial_expired' | 'pro';

/** Duration of the free trial in full calendar days. */
export const TRIAL_DAYS = 3;

/**
 * Compute the current subscription state from persisted store values.
 * @param trialStartDate ISO timestamp set once when onboarding completes.
 * @param isPro          From profile.isPro, synced via RevenueCat / backend.
 */
export function computeSubscriptionState(
  trialStartDate: string | null,
  isPro: boolean,
): SubscriptionState {
  if (isPro) return 'pro';
  if (!trialStartDate) return 'trial_expired';
  const daysSince =
    (Date.now() - new Date(trialStartDate).getTime()) / 86_400_000;
  return daysSince < TRIAL_DAYS ? 'trial_active' : 'trial_expired';
}

/**
 * Returns the number of full days remaining in the trial (minimum 0).
 * Returns 0 when trial_expired or trialStartDate is null.
 */
export function getTrialDaysLeft(trialStartDate: string | null): number {
  if (!trialStartDate) return 0;
  const daysSince =
    (Date.now() - new Date(trialStartDate).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(TRIAL_DAYS - daysSince));
}
