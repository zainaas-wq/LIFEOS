/**
 * LifeOS Adaptation Engine
 *
 * Pure computation layer. No store access, no React, no side effects.
 *
 * Single export: computeAdaptationHints()
 *
 * Reads the last PATTERN_LOOKBACK daily reviews, detects repeated execution
 * patterns, and returns AdaptationHints that the planning engine uses to
 * adjust tomorrow's plan.
 *
 * Signal → Hint mapping:
 *
 *   overload_pattern  (≥2 of last 3) → capMultiplier = 0.60  (40% load reduction)
 *   overload_pattern  (1 of last 3)  → capMultiplier = 0.70  (12% load reduction)
 *   low_execution     (≥2 of last 3) → capMultiplier = 0.65  (simplify plan)
 *   avoidance_pattern (≥2 of last 3) → firstSessionCapMins = 25
 *   avoidance_pattern (1) + low_exec (1) → firstSessionCapMins = 30
 *   distraction_heavy (≥2 of last 3) → preferHighEnergyFirst = true
 *
 * Recovery ranking:
 *   Last RECOVERY_LOOKBACK reviews with recoveryMode set are scored by
 *   effectiveness (completionRate ≥ 0.5). Modes are ranked descending.
 *
 * Safe boundaries:
 *   - capMultiplier never goes below MIN_CAP (0.5) or above DEFAULT_CAP (0.8)
 *   - firstSessionCapMins never goes below MIN_FIRST_SESSION (20)
 *   - No hint is applied unless at least MIN_REVIEWS_TO_ADAPT reviews exist
 */

import type { DailyReview, AdaptationHints, RecoveryMode } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default daily scheduling cap (matches planner baseline). */
const DEFAULT_CAP = 0.8;
/** Hard floor — never schedule less than 50% of free time. */
const MIN_CAP = 0.5;
/** Minimum first-session cap enforced regardless of hint. */
const MIN_FIRST_SESSION = 20;
/** How many recent reviews to inspect for pattern detection. */
const PATTERN_LOOKBACK = 3;
/** How many recent reviews to inspect for recovery effectiveness. */
const RECOVERY_LOOKBACK = 7;
/** Minimum reviews required before any adaptation is applied. */
const MIN_REVIEWS_TO_ADAPT = 1;

const ALL_MODES: RecoveryMode[] = ['save_day', 'critical_only', 'resume_now', 'compress_day'];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Derives planning adaptation hints from saved daily reviews.
 *
 * @param dailyReviews  All locally stored reviews (up to 30 days).
 * @returns             AdaptationHints — deterministic, pure, never throws.
 */
export function computeAdaptationHints(dailyReviews: DailyReview[]): AdaptationHints {
  if (dailyReviews.length < MIN_REVIEWS_TO_ADAPT) {
    return _defaultHints(0);
  }

  // Sort by date descending (most recent first).
  const sorted = [...dailyReviews].sort((a, b) => b.date.localeCompare(a.date));
  const recent = sorted.slice(0, PATTERN_LOOKBACK);

  // Count systemTakeaway occurrences in the pattern window.
  const counts = new Map<string, number>();
  for (const r of recent) {
    if (r.systemTakeaway) {
      counts.set(r.systemTakeaway, (counts.get(r.systemTakeaway) ?? 0) + 1);
    }
  }

  const overload     = counts.get('overload_pattern')  ?? 0;
  const avoidance    = counts.get('avoidance_pattern') ?? 0;
  const distraction  = counts.get('distraction_heavy') ?? 0;
  const lowExec      = counts.get('low_execution')     ?? 0;

  const rationale: string[] = [];

  // ── Daily cap multiplier ─────────────────────────────────────────────────
  let capMultiplier = DEFAULT_CAP;

  if (overload >= 2) {
    capMultiplier = 0.60;
    rationale.push('cap 60%: overload_pattern ×' + overload + ' in last ' + recent.length + ' days');
  } else if (overload >= 1) {
    capMultiplier = 0.70;
    rationale.push('cap 70%: single overload_pattern signal');
  } else if (lowExec >= 2) {
    capMultiplier = 0.65;
    rationale.push('cap 65%: low_execution ×' + lowExec + ' in last ' + recent.length + ' days');
  }

  // Clamp to safe range.
  capMultiplier = Math.max(MIN_CAP, Math.min(DEFAULT_CAP, capMultiplier));

  // ── First session cap ────────────────────────────────────────────────────
  let firstSessionCapMins: number | null = null;

  if (avoidance >= 2) {
    firstSessionCapMins = Math.max(MIN_FIRST_SESSION, 25);
    rationale.push('first task ≤25min: avoidance_pattern ×' + avoidance);
  } else if (avoidance >= 1 && lowExec >= 1) {
    firstSessionCapMins = Math.max(MIN_FIRST_SESSION, 30);
    rationale.push('first task ≤30min: avoidance + low_execution signals');
  }

  // ── High-energy ordering ─────────────────────────────────────────────────
  const preferHighEnergyFirst = distraction >= 2;
  if (preferHighEnergyFirst) {
    rationale.push('deep-work first: distraction_heavy ×' + distraction);
  }

  // ── Recovery mode ranking ─────────────────────────────────────────────────
  const preferredRecoveryModes = _rankRecoveryModes(sorted.slice(0, RECOVERY_LOOKBACK));

  return {
    capMultiplier,
    firstSessionCapMins,
    preferHighEnergyFirst,
    preferredRecoveryModes,
    rationale: rationale.length > 0 ? rationale.join('; ') : 'no active adaptation',
    reviewCount: recent.length,
  };
}

// ─── Private ──────────────────────────────────────────────────────────────────

/**
 * Ranks RecoveryModes by past effectiveness.
 * Effectiveness = completionRate ≥ 0.5 on days where that mode was used.
 * Only modes the user has actually tried are included in the ranked list.
 * Tie-breaking: first in ALL_MODES insertion order.
 */
function _rankRecoveryModes(reviews: DailyReview[]): RecoveryMode[] {
  const effective = new Map<RecoveryMode, number>();
  const total     = new Map<RecoveryMode, number>();

  for (const r of reviews) {
    if (!r.recoveryMode) continue;
    const mode = r.recoveryMode;
    total.set(mode, (total.get(mode) ?? 0) + 1);
    const rate = r.totalCount > 0 ? r.completedCount / r.totalCount : 1;
    if (rate >= 0.5) {
      effective.set(mode, (effective.get(mode) ?? 0) + 1);
    }
  }

  // Only rank modes the user has tried at least once.
  return ALL_MODES
    .filter((m) => total.has(m))
    .sort((a, b) => {
      const scoreA = (effective.get(a) ?? 0) / (total.get(a) ?? 1);
      const scoreB = (effective.get(b) ?? 0) / (total.get(b) ?? 1);
      return scoreB - scoreA; // descending effectiveness
    });
}

function _defaultHints(reviewCount: number): AdaptationHints {
  return {
    capMultiplier:          DEFAULT_CAP,
    firstSessionCapMins:    null,
    preferHighEnergyFirst:  false,
    preferredRecoveryModes: [],
    rationale:              'no adaptation needed — insufficient review history',
    reviewCount,
  };
}
