/**
 * creditRules.ts — Pure credit accounting constants and helpers.
 *
 * No React, no Supabase, no store deps — safe for Node tests.
 * Used by: aiCreditsService (hook layer), BackendAIClient, tests.
 */

export type RequestMode = 'text' | 'voice' | 'image';

/** Credit cost per request mode — mirrors edge function CREDIT_COSTS. */
export const CREDIT_COSTS: Record<RequestMode, number> = {
  text:  1,
  voice: 2,
  image: 3,
} as const;

/** Default tier allowances — mirrors edge function TIER_ALLOWANCE. */
export const TIER_ALLOWANCE: Record<string, number> = {
  free: 20,
  pro:  1000,
  max:  1000,
} as const;

/**
 * Returns true if currentBalance is sufficient to make a request of the given mode.
 */
export function canAfford(currentBalance: number, mode: RequestMode): boolean {
  return currentBalance >= CREDIT_COSTS[mode];
}

/**
 * Human-readable cost label for a request mode.
 * e.g. creditCostLabel('voice') → '2 credits'
 */
export function creditCostLabel(mode: RequestMode): string {
  const cost = CREDIT_COSTS[mode];
  return cost === 1 ? '1 credit' : `${cost} credits`;
}

/**
 * Simulate the consume_ai_credits PG function logic (pure mirror — for tests).
 * Returns { success, balanceAfter }.
 */
export function simulateConsume(
  balance: number,
  cost: number,
): { success: boolean; balanceAfter: number } {
  if (balance < cost) return { success: false, balanceAfter: balance };
  return { success: true, balanceAfter: balance - cost };
}

/**
 * Simulate the refund_ai_credits PG function logic (pure mirror — for tests).
 * Clamps to allowance — never over-credits.
 */
export function simulateRefund(balance: number, allowance: number, amount: number): number {
  return Math.min(balance + amount, allowance);
}

/**
 * Returns true when a 30-day rolling refill is due.
 */
export function isRefillDue(lastRefillAt: string, now: Date = new Date()): boolean {
  const refill       = new Date(lastRefillAt);
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return now.getTime() >= refill.getTime() + thirtyDaysMs;
}
