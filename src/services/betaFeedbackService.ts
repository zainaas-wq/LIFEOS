/**
 * betaFeedbackService — persistent storage for closed beta qualitative feedback.
 *
 * Separate from analytics events because:
 *   - Analytics are for dashboards (counts, rates, trends)
 *   - This table is for product decisions (what users actually said)
 *
 * Submit is fire-and-forget from the caller's perspective.
 * Fetch is used by the admin review screen only.
 */

import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

const APP_VERSION = '1.0.0-beta';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BetaFeedbackPayload {
  recommendation_score: 1 | 2 | 3 | 4 | 5;
  felt_personalized:    'yes' | 'somewhat' | 'no';
  would_return:         'yes' | 'somewhat' | 'no';
  confused?:            string;
  missing?:             string;
  impressed?:           string;
}

export interface BetaFeedbackRow {
  id:                   string;
  user_id:              string | null;
  recommendation_score: number;
  felt_personalized:    string;
  would_return:         string;
  confused:             string | null;
  missing:              string | null;
  impressed:            string | null;
  app_version:          string;
  platform:             string;
  created_at:           string;
}

export type FeedbackFilter =
  | 'all'
  | 'most_recent'
  | 'highest_score'
  | 'lowest_score'
  | 'return_yes'
  | 'return_no';

// ─── Submit ───────────────────────────────────────────────────────────────────

export async function submitBetaFeedback(payload: BetaFeedbackPayload): Promise<void> {
  const { session, isGuestMode } = useAppStore.getState();
  const userId = isGuestMode ? null : (session?.user?.id ?? null);

  await (supabase as any).from('beta_feedback').insert({
    user_id:              userId,
    recommendation_score: payload.recommendation_score,
    felt_personalized:    payload.felt_personalized,
    would_return:         payload.would_return,
    confused:             payload.confused?.trim()  || null,
    missing:              payload.missing?.trim()   || null,
    impressed:            payload.impressed?.trim() || null,
    app_version:          APP_VERSION,
    platform:             Platform.OS,
  });
}

// ─── Fetch (admin review) ─────────────────────────────────────────────────────

export async function fetchBetaFeedback(
  filter: FeedbackFilter = 'most_recent',
): Promise<BetaFeedbackRow[]> {
  const db = supabase as any;
  let query = db.from('beta_feedback').select('*');

  switch (filter) {
    case 'highest_score':
      query = query
        .order('recommendation_score', { ascending: false })
        .order('created_at', { ascending: false });
      break;
    case 'lowest_score':
      query = query
        .order('recommendation_score', { ascending: true })
        .order('created_at', { ascending: false });
      break;
    case 'return_yes':
      query = query
        .eq('would_return', 'yes')
        .order('created_at', { ascending: false });
      break;
    case 'return_no':
      query = query
        .eq('would_return', 'no')
        .order('created_at', { ascending: false });
      break;
    case 'all':
    case 'most_recent':
    default:
      query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as BetaFeedbackRow[];
}
