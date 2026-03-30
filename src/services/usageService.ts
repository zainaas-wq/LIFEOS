import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

// ─── Credit cost per action ──────────────────────────────────────────────────

export const ACTION_CREDIT_COSTS: Record<string, number> = {
  chat: 1,
  build_day: 3,
  recover_day: 2,
  monthly_review: 5,
  weekly_plan: 5,
  weekly_review: 5,
};

// ─── Inline types for new tables (not yet in supabaseTypes.ts) ───────────────

interface UsageLogRow {
  action: string | null;
  total_tokens: number;
}

interface TierRow {
  tier_id: string;
}

interface PlanTierRow {
  monthly_token_budget: number;
  tokens_per_credit: number;
  display_name: string;
}

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface MonthlyUsage {
  creditsUsed: number;
  creditsQuota: number;
  percentUsed: number;
  tierName: string;
  tierId: string;      // raw tier ID ('free' | 'pro' | 'max') — used by entitlementService
  resetDate: string;   // e.g. 'April 1'
  isLoading: boolean;
  error: string | null;
}

export interface UseMonthlyUsageResult extends MonthlyUsage {
  refresh: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function billingPeriodStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function nextResetDate(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return `${MONTH_NAMES[next.getUTCMonth()]} ${next.getUTCDate()}`;
}

function rowCredits(row: UsageLogRow, tokensPerCredit: number): number {
  if (row.action && row.action in ACTION_CREDIT_COSTS) {
    return ACTION_CREDIT_COSTS[row.action];
  }
  // Token-derived fallback for unknown or null actions
  return Math.max(1, Math.ceil((row.total_tokens ?? 0) / tokensPerCredit));
}

// ─── Core fetch function ──────────────────────────────────────────────────────

export async function fetchMonthlyUsage(userId: string): Promise<MonthlyUsage> {
  const db = supabase as any;
  const periodStart = billingPeriodStart();
  const resetDate = nextResetDate();

  try {
    // 1 & 2: usage log + tier are independent — fetch in parallel
    const [usageResult, tierResult] = await Promise.all([
      db
        .from('ai_usage_log')
        .select('action, total_tokens')
        .eq('user_id', userId)
        .gte('created_at', periodStart),
      db
        .from('ai_user_tier')
        .select('tier_id')
        .eq('user_id', userId)
        .single(),
    ]);

    if (usageResult.error) throw usageResult.error;
    const usageRows = usageResult.data;

    if (tierResult.error && tierResult.error.code !== 'PGRST116') throw tierResult.error;
    const tierId = (tierResult.data as TierRow | null)?.tier_id ?? 'free';

    // 3. Get tier limits (depends on tierId from step 2)
    const { data: planTier, error: planTierErr } = await db
      .from('ai_plan_tiers')
      .select('monthly_token_budget, tokens_per_credit, display_name')
      .eq('id', tierId)
      .single();

    if (planTierErr) throw planTierErr;

    const { monthly_token_budget, tokens_per_credit, display_name } = planTier as PlanTierRow;
    const creditsQuota = Math.floor(monthly_token_budget / tokens_per_credit);

    // 4. Sum credits by action (token fallback for unknown actions)
    const creditsUsed = (usageRows as UsageLogRow[]).reduce(
      (sum, row) => sum + rowCredits(row, tokens_per_credit),
      0,
    );

    const percentUsed = creditsQuota > 0
      ? Math.min(100, Math.round((creditsUsed / creditsQuota) * 100))
      : 0;

    return {
      creditsUsed,
      creditsQuota,
      percentUsed,
      tierName: display_name,
      tierId,
      resetDate,
      isLoading: false,
      error: null,
    };
  } catch (err: any) {
    return {
      creditsUsed: 0,
      creditsQuota: 100,  // safe default (free tier = 100 credits)
      percentUsed: 0,
      tierName: 'Free',
      tierId: 'free',
      resetDate,
      isLoading: false,
      error: err?.message ?? 'Failed to load usage',
    };
  }
}

// ─── Trial start date ─────────────────────────────────────────────────────────

/**
 * Fetch the server-authoritative trial start date for this user.
 * Returns null when the row does not exist or the column is unset
 * (pre-migration accounts, or users who never triggered activate-purchase).
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
  creditsUsed: 0,
  creditsQuota: 100,
  percentUsed: 0,
  tierName: 'Free',
  tierId: 'free',
  resetDate: nextResetDate(),
  isLoading: true,
  error: null,
};

export function useMonthlyUsage(): UseMonthlyUsageResult {
  const session = useAppStore((s) => s.session);
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
