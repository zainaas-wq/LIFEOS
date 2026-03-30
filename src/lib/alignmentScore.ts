import type { AlignmentInput, AlignmentResult } from '../types';

/**
 * Alignment Score Algorithm
 *
 * Weights:
 *   - Task completion     40%
 *   - Rules followed      30%
 *   - Critical action     20%
 *   - Daily reflection    10%
 *
 * The seriousness score (1-10) from onboarding acts as a multiplier
 * that slightly boosts or dampens the final score expectation.
 */
export function computeAlignmentScore(input: AlignmentInput): AlignmentResult {
  const {
    tasks,
    rules,
    hasCriticalAction,
    criticalActionCompleted,
    hasReflection,
    seriousnessScore,
  } = input;

  // ── Task Score (40 pts) ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayTasks = tasks.filter((t: any) => !t.scheduledStart || true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completedTasks = todayTasks.filter((t: any) => t.completed).length;
  const taskRatio = todayTasks.length > 0 ? completedTasks / todayTasks.length : 0;
  const taskScore = Math.round(taskRatio * 40);

  // ── Rule Score (30 pts) ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeRules = rules.filter((r: any) => r.enabled);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const followedRules = activeRules.filter((r: any) => r.followedToday).length;
  const ruleRatio = activeRules.length > 0 ? followedRules / activeRules.length : 0;
  const ruleScore = Math.round(ruleRatio * 30);

  // ── Critical Action Score (20 pts) ────────────────────────────────────────
  let criticalScore = 0;
  if (hasCriticalAction) {
    criticalScore = criticalActionCompleted ? 20 : 0;
  } else {
    // No plan generated yet — neutral, don't penalize
    criticalScore = 10;
  }

  // ── Reflection Score (10 pts) ─────────────────────────────────────────────
  const reflectionScore = hasReflection ? 10 : 0;

  // ── Raw Score ─────────────────────────────────────────────────────────────
  let raw = taskScore + ruleScore + criticalScore + reflectionScore;

  // ── Seriousness Adjustment ────────────────────────────────────────────────
  // High seriousness (8-10): score is taken as-is (earned)
  // Low seriousness (1-4): we gently lower the ceiling to reflect low commitment
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

export function getLabelColor(label: AlignmentResult['label']): string {
  switch (label) {
    case 'locked-in': return '#C9A84C';
    case 'aligned':   return '#4ADE80';
    case 'building':  return '#FBBF24';
    case 'off-track': return '#F87171';
  }
}

export function getLabelText(label: AlignmentResult['label']): string {
  switch (label) {
    case 'locked-in': return 'Locked In';
    case 'aligned':   return 'Aligned';
    case 'building':  return 'Building';
    case 'off-track': return 'Off Track';
  }
}
