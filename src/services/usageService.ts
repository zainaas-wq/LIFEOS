/**
 * usageService — AI credit balance service (Batch 11 ledger edition).
 *
 * All credit data now reads from ai_user_credits (the atomic ledger),
 * not from ai_plan_tiers token-budget arithmetic.
 *
 * The public MonthlyUsage interface is preserved so every downstream
 * consumer (coach ContextStrip, profile AIUsageCard, entitlementService,
 * upgrade screen) continues to work without modification.
 *
 * Mapping from ledger → interface:
 *   creditsUsed  = tierAllowance - currentBalance   (spent this cycle)
 *   creditsQuota = tierAllowance                    (full allowance)
 *   percentUsed  = round((creditsUsed / creditsQuota) * 100)
 *   tierName     = derived from tierId inline (no ai_plan_tiers query)
 *   resetDate    = last_refill_at + 30 days → human-readable label
 *
 * The legacy ai_plan_tiers table is no longer queried by the client.
 * Tier resolution still reads ai_user_tier for tierId (entitlement gating).
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

// ─── Inline types ─────────────────────────────────────────────────────────────

interface TierRow {
  tier_id: string;
}

interface CreditsRow {
  current_balance: number;
  tier_allowance:  number;
  last_refill_at:  string | null;
}

// ─── Tier display names ───────────────────────────────────────────────────────

const TIER_DISPLAY: Record<string, string> = {
  free: 'Free',
  pro:  'Pro',
  max:  'Max',
};

// ─── Public interfaces (unchanged — backward compatible) ──────────────────────

export interface MonthlyUsage {
  /** Credits consumed this cycle (= allowance − balance). */
  creditsUsed:  number;
  /** Total credit allowance for this cycle. */
  creditsQuota: number;
  /** Percentage consumed (0–100). */
  percentUsed:  number;
  /** Human-readable tier name, e.g. 'Free', 'Pro'. */
  tierName:     string;
  /** Raw tier ID ('free' | 'pro' | 'max') — used by entitlementService. */
  tierId:       string;
  /** Human-readable refill label, e.g. 'April 29'. */
  resetDate:    string;
  isLoading:    boolean;
  error:        string | null;
}

export interface UseMonthlyUsageResult extends MonthlyUsage {
  refresh: () => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Compute the next refill date label from last_refill_at.
 * Adds 30 days (rolling window) and formats as "Month Day".
 */
function computeResetDate(lastRefillAt: string | null): string {
  if (!lastRefillAt) {
    // No row yet — first use will bootstrap, so refill in ~30 days
    const next = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return `${MONTH_NAMES[next.getMonth()]} ${next.getDate()}`;
  }
  const last = new Date(lastRefillAt);
  const next = new Date(last.getTime() + 30 * 24 * 60 * 60 * 1000);
  return `${MONTH_NAMES[next.getMonth()]} ${next.getDate()}`;
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

/**
 * Fetch the current AI credit state for a user.
 *
 * Reads two tables in parallel:
 *   1. ai_user_tier    → tierId (for entitlement checks)
 *   2. ai_user_credits → balance + allowance + refill timestamp
 *
 * Falls back to safe defaults (free, 0/20 used) on any error.
 * Never throws — callers can treat error field for display only.
 */
export async function fetchMonthlyUsage(userId: string): Promise<MonthlyUsage> {
  const db = supabase as any;

  try {
    // Read tier and credit balance in parallel — independent lookups
    const [tierResult, creditsResult] = await Promise.all([
      db
        .from('ai_user_tier')
        .select('tier_id')
        .eq('user_id', userId)
        .maybeSingle(),
      db
        .from('ai_user_credits')
        .select('current_balance, tier_allowance, last_refill_at')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    // Tier ID — default 'free' on missing row (pre-signup or trigger miss)
    if (tierResult.error && tierResult.error.code !== 'PGRST116') {
      throw tierResult.error;
    }
    const tierId   = (tierResult.data as TierRow | null)?.tier_id ?? 'free';
    const tierName = TIER_DISPLAY[tierId] ?? 'Free';

    // Credits — if row missing, user hasn't made an AI call yet; show 0/allowance
    if (creditsResult.error && creditsResult.error.code !== 'PGRST116') {
      throw creditsResult.error;
    }

    const row            = creditsResult.data as CreditsRow | null;
    const tierAllowance  = row?.tier_allowance  ?? (tierId === 'pro' || tierId === 'max' ? 1000 : 20);
    const currentBalance = row?.current_balance ?? tierAllowance; // no row = full balance
    const lastRefillAt   = row?.last_refill_at  ?? null;

    const creditsUsed  = Math.max(0, tierAllowance - currentBalance);
    const creditsQuota = tierAllowance;
    const percentUsed  = creditsQuota > 0
      ? Math.min(100, Math.round((creditsUsed / creditsQuota) * 100))
      : 0;

    return {
      creditsUsed,
      creditsQuota,
      percentUsed,
      tierName,
      tierId,
      resetDate: computeResetDate(lastRefillAt),
      isLoading: false,
      error:     null,
    };
  } catch (err: any) {
    return {
      creditsUsed:  0,
      creditsQuota: 20,
      percentUsed:  0,
      tierName:     'Free',
      tierId:       'free',
      resetDate:    computeResetDate(null),
      isLoading:    false,
      error:        err?.message ?? 'Failed to load usage',
    };
  }
}

// ─── Trial start date (unchanged) ────────────────────────────────────────────

/**
 * Fetch the server-authoritative trial start date for this user.
 * Returns null when the row does not exist or the column is unset.
 */
export async function getTrialStartedAt(userId: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from('ai_user_tier')
    .select('trial_started_at')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { trial_started_at: string | null } | null)?.trial_started_at ?? null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const LOADING_STATE: MonthlyUsage = {
  creditsUsed:  0,
  creditsQuota: 20,
  percentUsed:  0,
  tierName:     'Free',
  tierId:       'free',
  resetDate:    computeResetDate(null),
  isLoading:    true,
  error:        null,
};

export function useMonthlyUsage(): UseMonthlyUsageResult {
  const session     = useAppStore((s) => s.session);
  const isGuestMode = useAppStore((s) => s.isGuestMode);
  const [data, setData] = useState<MonthlyUsage>(LOADING_STATE);

  const refresh = useCallback(async () => {
    if (isGuestMode || !session?.user?.id) {
      setData({ ...LOADING_STATE, isLoading: false });
      return;
    }
    setData((prev) => ({ ...prev, isLoading: true, error: null }));
    const result = await fetchMonthlyUsage(session.user.id);
    setData(result);
  }, [session?.user?.id, isGuestMode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...data, refresh };
}
