/**
 * aiCreditsService — Batch 11: client-side credit accounting helpers.
 *
 * The server is always authoritative for credit balances.
 * This module provides:
 *   - Centralized CREDIT_COSTS / TIER_ALLOWANCE constants (mirror of edge function)
 *   - fetchAIBalance() — read current balance from ai_user_credits
 *   - useAIBalance() — React hook for live balance in components
 *
 * Balance is never deducted or modified here — all mutations go through
 * the ai-chat edge function which calls consume_ai_credits server-side.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

// ─── Credit constants + pure helpers (re-exported from pure creditRules) ──────

export type { RequestMode } from '../ai/creditRules';
export { CREDIT_COSTS, TIER_ALLOWANCE, canAfford, creditCostLabel } from '../ai/creditRules';

// ─── Balance shape ─────────────────────────────────────────────────────────────

export interface AIBalance {
  currentBalance: number;
  tierAllowance:  number;
  lifetimeUsed:   number;
  lastRefillAt:   string | null;
  /** Percentage of allowance remaining (0–100). */
  pctRemaining:   number;
  /** True when balance ≤ 10% of allowance. */
  isLow:          boolean;
  /** True when balance === 0. */
  isExhausted:    boolean;
}

const EMPTY_BALANCE: AIBalance = {
  currentBalance: 0,
  tierAllowance:  20,
  lifetimeUsed:   0,
  lastRefillAt:   null,
  pctRemaining:   0,
  isLow:          true,
  isExhausted:    true,
};

// ─── Core fetch ────────────────────────────────────────────────────────────────

interface CreditsRow {
  current_balance: number;
  tier_allowance:  number;
  lifetime_used:   number;
  last_refill_at:  string;
}

/**
 * Fetch the current AI credit balance for a user.
 * Returns null if the row does not exist yet (first-use bootstrap happens on next AI call).
 */
export async function fetchAIBalance(userId: string): Promise<AIBalance | null> {
  try {
    const { data, error } = await (supabase as any)
      .from('ai_user_credits')
      .select('current_balance, tier_allowance, lifetime_used, last_refill_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[aiCreditsService] fetchAIBalance error:', error.message);
      return null;
    }
    if (!data) return null;

    const row            = data as CreditsRow;
    const currentBalance = row.current_balance ?? 0;
    const tierAllowance  = row.tier_allowance  ?? 20;
    const pctRemaining   = tierAllowance > 0
      ? Math.min(100, Math.round((currentBalance / tierAllowance) * 100))
      : 0;

    return {
      currentBalance,
      tierAllowance,
      lifetimeUsed:  row.lifetime_used ?? 0,
      lastRefillAt:  row.last_refill_at ?? null,
      pctRemaining,
      isLow:         pctRemaining <= 10,
      isExhausted:   currentBalance === 0,
    };
  } catch (err: any) {
    console.error('[aiCreditsService] fetchAIBalance threw:', err?.message);
    return null;
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export interface UseAIBalanceResult {
  balance:   AIBalance | null;
  isLoading: boolean;
  error:     string | null;
  refresh:   () => Promise<void>;
}

export function useAIBalance(): UseAIBalanceResult {
  const session    = useAppStore((s) => s.session);
  const isGuest    = useAppStore((s) => s.isGuestMode);
  const [balance,   setBalance]   = useState<AIBalance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isGuest || !session?.user?.id) {
      setBalance(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const b = await fetchAIBalance(session.user.id);
      setBalance(b);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load credits');
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id, isGuest]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, isLoading, error, refresh };
}

// canAfford + creditCostLabel are re-exported from creditRules above.
