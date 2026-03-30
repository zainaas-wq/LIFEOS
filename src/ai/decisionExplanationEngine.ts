/**
 * decisionExplanationEngine.ts
 *
 * Structured, deterministic explanations for major LifeOS decisions.
 * Every explanation cites the specific signal that drove it.
 *
 * Pure functions: no store, no React, no side effects.
 * Node-testable: safe to import in __tests__/batch8-predictive.ts
 *
 * Design contract:
 *   - Explanations must be traceable — every `signal` field maps to real data
 *   - Copy is user-facing: plain English, no technical jargon
 *   - Confidence reflects how much actual history backs the statement
 *   - Used in: PredictiveWarningCard, coach context, recovery UI
 */

import type { AdaptationHints, PlanItem, RecoveryMode } from '../types';
import type { RecoveryStats } from './metricsEngine';
import type { DriftPrediction } from './predictiveEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Explanation {
  /** What decision was made. Short, noun-phrase. */
  decision: string;
  /** Why — 1–2 sentences, plain English, suitable for coach context. */
  reason: string;
  /** The exact signal that drove the decision — traceable to actual data. */
  signal: string;
  /** How much real history backs this explanation. */
  confidence: 'low' | 'medium' | 'high';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Explains why today's plan is lighter, heavier, or standard.
 * Driven by AdaptationHints derived from recent review history.
 */
export function explainPlanIntensity(
  hints: AdaptationHints,
  taskCount: number,
): Explanation {
  const capPct = Math.round(hints.capMultiplier * 100);

  // System reduced capacity — explain why
  if (hints.capMultiplier <= 0.62) {
    return {
      decision: 'Lighter plan today',
      reason:   `The system reduced your daily capacity to ${capPct}% based on your recent pattern. ${hints.rationale}`,
      signal:   `capMultiplier = ${capPct}% (reduced from default 80%)`,
      confidence: hints.reviewCount >= 3 ? 'high' : 'medium',
    };
  }

  if (hints.capMultiplier < 0.75) {
    return {
      decision: 'Slightly reduced plan',
      reason:   `Capacity is at ${capPct}% — a moderate reduction based on recent signals. ${hints.rationale}`,
      signal:   `capMultiplier = ${capPct}%`,
      confidence: hints.reviewCount >= 3 ? 'medium' : 'low',
    };
  }

  // Dense plan — explain that too
  if (taskCount >= 6) {
    return {
      decision: 'Full-capacity plan',
      reason:   `No overload or avoidance signals in recent reviews. Running at full capacity with ${taskCount} tasks.`,
      signal:   `capMultiplier = ${capPct}%, ${taskCount} tasks, ${hints.reviewCount} reviews checked`,
      confidence: hints.reviewCount >= 3 ? 'medium' : 'low',
    };
  }

  // Default — no strong signal in either direction
  return {
    decision: 'Standard plan',
    reason:   hints.reviewCount >= 3
      ? `No significant adaptation signals in recent ${hints.reviewCount} reviews.`
      : 'Not enough review history yet — running at default capacity.',
    signal:   `capMultiplier = ${capPct}%, ${hints.reviewCount} reviews`,
    confidence: 'low',
  };
}

/**
 * Explains why a specific task was selected as the next action.
 * Considers criticality, energy scheduling, and position.
 */
export function explainTaskSelection(
  item: PlanItem,
  hints: AdaptationHints,
  isFirstItem: boolean,
): Explanation {
  if (item.isCritical) {
    return {
      decision: `"${item.title}" is next`,
      reason:   'This task is marked critical — it takes priority over everything else today.',
      signal:   'isCritical = true',
      confidence: 'high',
    };
  }

  if (isFirstItem && hints.preferHighEnergyFirst) {
    return {
      decision: `"${item.title}" is next`,
      reason:   'High-energy tasks are scheduled first because your reviews show better execution in the first session.',
      signal:   'preferHighEnergyFirst = true (derived from distraction pattern in reviews)',
      confidence: 'medium',
    };
  }

  if (isFirstItem && hints.firstSessionCapMins !== null) {
    return {
      decision: `"${item.title}" is next`,
      reason:   `First session is capped at ${hints.firstSessionCapMins} min to reduce avoidance — a pattern the system detected in your reviews.`,
      signal:   `firstSessionCapMins = ${hints.firstSessionCapMins} (avoidance adaptation)`,
      confidence: 'medium',
    };
  }

  return {
    decision: `"${item.title}" is next`,
    reason:   'Next task in your schedule by planned start time.',
    signal:   `Scheduled at ${item.startTime}`,
    confidence: 'low',
  };
}

/**
 * Explains why a specific recovery mode is ranked first.
 * Considers past effectiveness + predicted drift type.
 */
export function explainRecoveryRanking(
  topMode: RecoveryMode,
  stats: RecoveryStats,
  topPrediction: DriftPrediction | null,
): Explanation {
  const modeData = stats.rankedModes.find((m) => m.mode === topMode);
  const effectivePct = modeData ? Math.round(modeData.score * 100) : null;
  const uses = modeData?.uses ?? 0;

  // We have solid effectiveness data for this mode
  if (modeData && uses >= 3 && effectivePct !== null) {
    return {
      decision: `${topMode} recommended`,
      reason:   `This mode worked ${effectivePct}% of the time across your last ${uses} recovery sessions.`,
      signal:   `Effectiveness: ${effectivePct}% (${uses} uses)`,
      confidence: uses >= 5 ? 'high' : 'medium',
    };
  }

  // Effectiveness data exists but thin
  if (modeData && uses >= 1 && effectivePct !== null) {
    return {
      decision: `${topMode} recommended`,
      reason:   `This mode worked ${effectivePct}% of the time in limited data (${uses} use${uses === 1 ? '' : 's'}).`,
      signal:   `Effectiveness: ${effectivePct}% (${uses} uses — limited data)`,
      confidence: 'low',
    };
  }

  // Prediction-driven ranking (no personal history)
  if (topPrediction) {
    return {
      decision: `${topMode} recommended`,
      reason:   `Selected because it best addresses your predicted risk: ${topPrediction.headline.toLowerCase()}.`,
      signal:   `Predicted risk: ${topPrediction.riskType}`,
      confidence: 'medium',
    };
  }

  // No history, no prediction — default
  return {
    decision: `${topMode} recommended`,
    reason:   'Default recommendation — no effectiveness history yet.',
    signal:   'No recovery history',
    confidence: 'low',
  };
}

/**
 * Returns a one-line rationale string for a given prediction.
 * Suitable for coach context injection (plain text, not structured).
 */
export function explainPrediction(prediction: DriftPrediction): string {
  return `${prediction.headline} — ${prediction.rationale} → ${prediction.actionHint}`;
}

/**
 * Returns a compact coach context string summarising the top predictions.
 * Injected into the AI system prompt alongside reviewSignals.
 */
export function buildPredictionContext(predictions: DriftPrediction[]): string {
  if (predictions.length === 0) return 'No significant drift risk predicted today.';
  const lines = predictions
    .slice(0, 2)
    .map((p) => `• ${p.riskType} (${p.confidence}): ${p.rationale}`);
  return `Predicted risks today:\n${lines.join('\n')}`;
}
