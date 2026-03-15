import { useCallback } from 'react';
import { useMonthlyUsage } from './usageService';
import type { UseMonthlyUsageResult } from './usageService';

// ─── Feature identifiers ──────────────────────────────────────────────────────

export type PlanFeature =
  | 'ai_chat'
  | 'ai_build_day'
  | 'ai_recover_day'
  | 'ai_monthly_review'   // Pro only
  | 'ai_weekly_plan';     // Pro only — covers both weekly planning and weekly review

// ─── Tier → feature map ───────────────────────────────────────────────────────
//
// Keyed by tier ID (matches ai_plan_tiers.id in the DB).
// Unknown tier IDs resolve to FREE_ENTITLEMENTS (fail-closed).
//
// Max is defined here so the app handles it correctly if the DB row is
// ever assigned, without requiring an app update.

export const PLAN_ENTITLEMENTS: Record<string, ReadonlySet<PlanFeature>> = {
  free: new Set(['ai_chat', 'ai_build_day', 'ai_recover_day']),
  pro:  new Set(['ai_chat', 'ai_build_day', 'ai_recover_day', 'ai_monthly_review', 'ai_weekly_plan']),
  max:  new Set(['ai_chat', 'ai_build_day', 'ai_recover_day', 'ai_monthly_review', 'ai_weekly_plan']),
};

const FREE_ENTITLEMENTS: ReadonlySet<PlanFeature> = PLAN_ENTITLEMENTS['free']!;

// ─── Pure helpers (no hooks — safe to call anywhere) ─────────────────────────

/**
 * Returns true if the given tier includes the given feature.
 * Unknown tier IDs fail-closed to Free entitlements.
 */
export function canUseFeature(tierId: string, feature: PlanFeature): boolean {
  return (PLAN_ENTITLEMENTS[tierId] ?? FREE_ENTITLEMENTS).has(feature);
}

/**
 * Returns the full feature set for a tier.
 * Useful for rendering plan comparison tables.
 */
export function getEntitlements(tierId: string): ReadonlySet<PlanFeature> {
  return PLAN_ENTITLEMENTS[tierId] ?? FREE_ENTITLEMENTS;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseEntitlementsResult extends UseMonthlyUsageResult {
  /** Returns true if the current user's tier includes the given feature. */
  can: (feature: PlanFeature) => boolean;
  /** True for 'pro' and 'max' tiers. */
  isPro: boolean;
}

/**
 * Returns all monthly usage data plus entitlement checks for the current user.
 *
 * Extends useMonthlyUsage() — callers that previously used useMonthlyUsage()
 * can drop-in replace it with useEntitlements() and gain can() + isPro
 * without losing any existing fields (creditsUsed, creditsQuota, etc.).
 */
export function useEntitlements(): UseEntitlementsResult {
  const usage = useMonthlyUsage();

  const can = useCallback(
    (feature: PlanFeature) => canUseFeature(usage.tierId, feature),
    [usage.tierId],
  );

  return {
    ...usage,
    can,
    isPro: usage.tierId === 'pro' || usage.tierId === 'max',
  };
}
