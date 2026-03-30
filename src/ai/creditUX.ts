/**
 * creditUX.ts — Pure UX helpers for AI credit transparency.
 *
 * No React, no Expo, no Supabase — safe for Node tests.
 * Consumed by CreditWarningBanner, CreditUsageBreakdown, CreditCostChip, tests.
 */

import { CREDIT_COSTS } from './creditRules';
import type { RequestMode } from './creditRules';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LowCreditState = 'ok' | 'soft' | 'strong' | 'exhausted';

export interface UsageBreakdown {
  text:  number;  // estimated text requests remaining
  voice: number;  // estimated voice requests remaining
  image: number;  // estimated image requests remaining
}

// ─── estimateUsageBreakdown ───────────────────────────────────────────────────

/**
 * Estimate how many requests of each type remain given the current balance.
 * Each estimate is independent (assumes the full balance is used for that mode only).
 */
export function estimateUsageBreakdown(balance: number): UsageBreakdown {
  const b = Math.max(0, Math.floor(balance));
  return {
    text:  Math.floor(b / CREDIT_COSTS.text),
    voice: Math.floor(b / CREDIT_COSTS.voice),
    image: Math.floor(b / CREDIT_COSTS.image),
  };
}

// ─── getLowCreditState ────────────────────────────────────────────────────────

/**
 * Classify balance into a warning severity tier.
 *   balance = 0   → 'exhausted'
 *   balance ≤ 2   → 'strong'
 *   balance ≤ 5   → 'soft'
 *   else          → 'ok'
 */
export function getLowCreditState(balance: number): LowCreditState {
  if (balance <= 0) return 'exhausted';
  if (balance <= 2) return 'strong';
  if (balance <= 5) return 'soft';
  return 'ok';
}

// ─── formatCost ──────────────────────────────────────────────────────────────

/**
 * Human-readable cost label for a request mode.
 * e.g. formatCost('voice') → '-2 credits'
 *      formatCost('text')  → '-1 credit'
 */
export function formatCost(mode: RequestMode): string {
  const cost = CREDIT_COSTS[mode];
  return cost === 1 ? '-1 credit' : `-${cost} credits`;
}

/**
 * Pre-send cost label (positive framing for cost chip).
 * e.g. costPreviewLabel('image') → '3 credits'
 */
export function costPreviewLabel(mode: RequestMode): string {
  const cost = CREDIT_COSTS[mode];
  return cost === 1 ? '1 credit' : `${cost} credits`;
}

// ─── getRefillCountdown ───────────────────────────────────────────────────────

/**
 * Convert a last_refill_at ISO string into a human-readable countdown.
 *   e.g. "Refills in 12 days"  /  "Refills tomorrow"  /  "Refill due soon"
 * Pass now as a second argument to enable deterministic tests.
 */
export function getRefillCountdown(lastRefillAt: string | null, now: Date = new Date()): string {
  if (!lastRefillAt) return 'Refills in ~30 days';
  const refillDate = new Date(lastRefillAt);
  const nextRefill = new Date(refillDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const daysLeft   = Math.ceil((nextRefill.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft <= 0)  return 'Refill due soon';
  if (daysLeft === 1) return 'Refills tomorrow';
  return `Refills in ${daysLeft} days`;
}

// ─── shouldShowUpgradeNudge ───────────────────────────────────────────────────

/**
 * Returns true when a smart upgrade nudge should be shown.
 * Triggers only on 'strong' or 'exhausted' states — never at 'ok' or 'soft'.
 * The `requestCount` guard prevents spam: nudge only every 3 requests.
 */
export function shouldShowUpgradeNudge(
  balance:      number,
  requestCount: number,   // total AI requests this session
): boolean {
  const state = getLowCreditState(balance);
  if (state === 'ok' || state === 'soft') return false;
  if (state === 'exhausted') return true;
  // strong: show on first request in state, then every 3rd after
  return requestCount === 0 || requestCount % 3 === 0;
}
