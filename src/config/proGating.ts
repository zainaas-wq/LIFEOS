/**
 * proGating.ts — Centralized Free vs Pro feature boundaries.
 *
 * One place to define what Pro unlocks and the copy to surface it.
 * Never scatter gating logic across UI files — import this instead.
 *
 * Design rules:
 *   - Free must feel complete: planning, execution, basic drift, basic review.
 *   - Pro deepens intelligence: prediction detail, recovery ranking, history depth.
 *   - No hard-blocking of core value. Nudges only.
 */

/** Identifiers for every Pro-gated capability. */
export type ProFeature =
  | 'predictive_insights'   // Predictive drift action hints + explanation layer
  | 'advanced_recovery'     // Recovery ranked by past effectiveness + risk profile
  | 'weekly_insights_depth' // 30-day outcome window vs 7-day
  | 'outcome_history';      // Full trend dashboard with 30-day view

/**
 * Human-readable copy for each Pro feature.
 * Used by ProContextCard to surface contextual nudges.
 * Keep nudge copy to one line — this is ambient, not disruptive.
 */
export const PRO_FEATURE_LABELS: Record<ProFeature, { headline: string; nudge: string }> = {
  predictive_insights: {
    headline: 'Smarter Risk Insights',
    nudge:    'Get AI-powered action hints for predicted drift risks.',
  },
  advanced_recovery: {
    headline: 'Personalized Recovery',
    nudge:    'Recovery options ranked by what has worked for you.',
  },
  weekly_insights_depth: {
    headline: 'Long-Term Patterns',
    nudge:    'See what is driving drift — 30-day view.',
  },
  outcome_history: {
    headline: '30-Day Outcome History',
    nudge:    'Track whether LifeOS is improving your execution over time.',
  },
};
