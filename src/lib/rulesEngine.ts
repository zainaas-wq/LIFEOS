import type { Rule } from '../types';

export const FREE_PLAN_RULE_LIMIT = 3;

/**
 * Rules Engine
 *
 * Enforces business logic around the rules system:
 * - Free users: max 3 rules
 * - Pro users: unlimited
 * - Evaluates which rules are active for the day
 */

export function canAddRule(rules: Rule[], isPro: boolean): boolean {
  if (isPro) return true;
  const activeRules = rules.filter((r) => r.enabled);
  return activeRules.length < FREE_PLAN_RULE_LIMIT;
}

export function getRulesAtCapacity(rules: Rule[], isPro: boolean): boolean {
  if (isPro) return false;
  return rules.filter((r) => r.enabled).length >= FREE_PLAN_RULE_LIMIT;
}

export function evaluateRuleCompliance(rules: Rule[]): {
  followed: number;
  total: number;
  complianceRate: number;
} {
  const activeRules = rules.filter((r) => r.enabled);
  const followed = activeRules.filter((r) => r.followedToday).length;
  const total = activeRules.length;
  const complianceRate = total > 0 ? followed / total : 1;

  return { followed, total, complianceRate };
}

/**
 * Resets daily rule tracking — called at midnight / new day
 */
export function resetDailyRuleTracking(rules: Rule[]): Rule[] {
  return rules.map((r) => ({ ...r, followedToday: false }));
}

/**
 * Returns a motivational prompt based on compliance rate
 */
export function getRuleMotivation(complianceRate: number): string {
  if (complianceRate === 1) return 'Perfect rule alignment today.';
  if (complianceRate >= 0.75) return 'Strong discipline. Keep it going.';
  if (complianceRate >= 0.5) return 'Halfway there. Tighten your standards.';
  if (complianceRate > 0) return 'Your rules exist for a reason. Honor them.';
  return 'No rules followed yet today. Choose discipline.';
}
