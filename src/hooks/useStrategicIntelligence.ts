/**
 * useStrategicIntelligence — component-level hook for strategic intelligence.
 *
 * Batch 19: Weekly / Monthly Intelligence Layer wiring.
 *
 * Reads dailyReviews from the store and computes the full intelligence
 * pipeline (weekly → monthly → momentum → recommendations → coach summary).
 *
 * Use this hook in components that need to display intelligence data directly
 * (e.g. weekly review screen, monthly summary card).
 *
 * For AI context injection, the intelligence is already wired into useAIContext()
 * inside useAppStore — this hook is the component-facing access point.
 *
 * Memoized: recomputes only when dailyReviews changes.
 */

import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  computeWeeklyIntelligence,
  computeMonthlyIntelligence,
  getMomentumState,
  buildStrategicRecommendations,
  buildStrategicCoachSummary,
  getWeekStartForIntelligence,
} from '../ai/intelligenceEngine';
import { getTodayDate } from '../lib/utils';
import type { StrategicIntelligenceSummary } from '../types';

export function useStrategicIntelligence(): StrategicIntelligenceSummary {
  const dailyReviews = useAppStore((s) => s.dailyReviews);
  const today        = getTodayDate();

  return useMemo<StrategicIntelligenceSummary>(() => {
    const weekStart      = getWeekStartForIntelligence(today);
    const weekly         = computeWeeklyIntelligence(dailyReviews, weekStart);
    const monthly        = computeMonthlyIntelligence(dailyReviews, today);
    const momentumState  = getMomentumState(weekly);
    const recommendations = buildStrategicRecommendations(weekly, monthly);
    const coachSummary   = buildStrategicCoachSummary(weekly, monthly, recommendations);

    return { weekly, monthly, momentumState, recommendations, coachSummary };
  }, [dailyReviews, today]);
}
