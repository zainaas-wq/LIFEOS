/**
 * LifeOS Progress Engine
 *
 * Computes alignment score from control plan items rather than legacy tasks.
 * Drop-in compatible with alignmentScore.ts — returns the same AlignmentResult.
 *
 * Weights:
 *   taskScore    40pts — completed work sessions / total, minus distraction penalty
 *   ruleScore    30pts — rules followed today
 *   criticalScore 20pts — isCritical item completed (10pts neutral if none)
 *   reflectionScore 10pts — reflection saved today
 */

import type { PlanItem, Rule, AlignmentResult } from '../types';

export interface ProgressInput {
  /** Non-break, non-event PlanItems from today's control plan. */
  planItems: PlanItem[];
  rules: Rule[];
  /** True if the isCritical plan item has been completed. */
  criticalActionCompleted: boolean;
  hasReflection: boolean;
  /** Number of distraction logs today. */
  distractionCount: number;
  seriousnessScore: number; // 1–10
}

export function computeProgressScore(input: ProgressInput): AlignmentResult {
  const {
    planItems,
    rules,
    criticalActionCompleted,
    hasReflection,
    distractionCount,
    seriousnessScore,
  } = input;

  // ── Task Score (40 pts) ───────────────────────────────────────────────────
  const total = planItems.length;
  const completed = planItems.filter((i) => i.completed).length;
  const taskRatio = total > 0 ? completed / total : 0;
  const taskRaw = Math.round(taskRatio * 40);

  // Distraction penalty: −2 per log, capped at −10, absorbed from taskScore
  const distractionPenalty = Math.min(distractionCount * 2, 10);
  const taskScore = Math.max(0, taskRaw - distractionPenalty);

  // ── Rule Score (30 pts) ───────────────────────────────────────────────────
  const activeRules = rules.filter((r) => r.enabled);
  const followedRules = activeRules.filter((r) => r.followedToday).length;
  const ruleRatio = activeRules.length > 0 ? followedRules / activeRules.length : 0;
  const ruleScore = Math.round(ruleRatio * 30);

  // ── Critical Score (20 pts) ───────────────────────────────────────────────
  const hasCriticalItem = planItems.some((i) => i.isCritical);
  let criticalScore: number;
  if (!hasCriticalItem) {
    criticalScore = 10; // neutral — no plan generated yet
  } else {
    criticalScore = criticalActionCompleted ? 20 : 0;
  }

  // ── Reflection Score (10 pts) ─────────────────────────────────────────────
  const reflectionScore = hasReflection ? 10 : 0;

  // ── Raw + Seriousness Multiplier ──────────────────────────────────────────
  const raw = taskScore + ruleScore + criticalScore + reflectionScore;
  const seriousnessMultiplier = 0.85 + (seriousnessScore / 10) * 0.15;
  const score = Math.min(100, Math.round(raw * seriousnessMultiplier));

  // ── Label ─────────────────────────────────────────────────────────────────
  let label: AlignmentResult['label'];
  if (score >= 85) label = 'locked-in';
  else if (score >= 60) label = 'aligned';
  else if (score >= 35) label = 'building';
  else label = 'off-track';

  return { score, taskScore, ruleScore, criticalScore, reflectionScore, label };
}
