/**
 * projectIntelligenceEngine — Phase C: Project Intelligence System
 *
 * Computes health scores, velocity, completion probability, and risk signals
 * per project. Pure functions — no side effects, no store imports.
 *
 * Health Score (0–100):
 *   Base:                        50
 *   Completion progress:        +30 * (done/total)
 *   Blocked milestones:         −12 each (cap −30)
 *   Overdue milestones:         −10 each (cap −20)
 *   Stagnation (>7d no work):   −20
 *   Recent activity (<3d):      +10
 *   Project memories exist:     +5
 *   Deadline <7d:               −15
 *   Deadline <14d:              −8
 */

import type { Project, Milestone, FocusSession, MemoryEntry, Goal } from '../types';

// ─── Output types ─────────────────────────────────────────────────────────────

export type HealthLabel   = 'critical' | 'at-risk' | 'building' | 'healthy';
export type DeadlineRisk  = 'none' | 'low' | 'high' | 'critical';
export type RiskLevel     = 'critical' | 'high' | 'medium';

export interface ProjectIntelligence {
  projectId:             string;
  projectName:           string;
  healthScore:           number;          // 0–100
  healthLabel:           HealthLabel;
  completionProbability: number;          // 0–100
  velocity:              number;          // milestones completed per week (last 30d)
  blockedCount:          number;
  overdueCount:          number;
  daysSinceActivity:     number;          // days since last milestone completion or linked memory
  deadlineRisk:          DeadlineRisk;
  daysUntilDeadline:     number | null;
  completedCount:        number;
  totalCount:            number;
  recommendation:        string;
}

export interface ProjectRisk {
  id:             string;   // projectId + riskType for deduplication
  projectId:      string;
  projectName:    string;
  riskLevel:      RiskLevel;
  reason:         string;
  actionRequired: string;
  milestoneId?:   string;
}

// ─── Per-project computation ───────────────────────────────────────────────────

export function computeProjectIntelligence(
  project:      Project,
  milestones:   Milestone[],
  focusSessions: FocusSession[],
  memories:     MemoryEntry[],
  goals:        Goal[],
  today:        string,
): ProjectIntelligence {
  const todayMs  = new Date(today + 'T23:59:59').getTime();
  const ms       = milestones.filter((m) => m.projectId === project.id);
  const total    = ms.length;
  const done     = ms.filter((m) => m.status === 'completed');
  const blocked  = ms.filter((m) => m.status === 'blocked');
  const overdue  = ms.filter((m) =>
    m.status !== 'completed' && m.dueDate && m.dueDate < today,
  );

  // ── Activity: last milestone completion ───────────────────────────────────
  const lastCompletedMs = done
    .filter((m) => m.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];

  const lastMilestoneMs = lastCompletedMs?.completedAt
    ? new Date(lastCompletedMs.completedAt).getTime()
    : 0;

  // ── Activity: last linked memory ──────────────────────────────────────────
  const projectMemories = memories.filter((m) => m.linkedProjectId === project.id);
  const lastMemoryMs = projectMemories.length
    ? Math.max(...projectMemories.map((m) => new Date(m.updatedAt).getTime()))
    : 0;

  // ── Activity: linked goal focus sessions ──────────────────────────────────
  const linkedGoal = goals.find((g) => g.id === project.goalId);
  const goalFocusSessions = linkedGoal
    ? focusSessions.filter((s) => s.goalId === linkedGoal.id && s.end)
    : [];
  const lastFocusMs = goalFocusSessions.length
    ? Math.max(...goalFocusSessions.map((s) => new Date(s.end!).getTime()))
    : 0;

  // project.createdAt is the minimum baseline — a brand-new project is not stagnant
  const projectCreatedMs  = new Date(project.createdAt).getTime();
  const lastActivityMs    = Math.max(lastMilestoneMs, lastMemoryMs, lastFocusMs, projectCreatedMs);
  const daysSinceActivity = Math.floor((todayMs - lastActivityMs) / 86_400_000);

  // ── Velocity: milestones completed per week (last 30 days) ───────────────
  const thirtyDaysAgo  = new Date(todayMs - 30 * 86_400_000).toISOString();
  const recentCompleted = done.filter(
    (m) => m.completedAt && m.completedAt >= thirtyDaysAgo,
  ).length;
  const velocity = +(recentCompleted / 4.3).toFixed(2); // per week

  // ── Deadline proximity ────────────────────────────────────────────────────
  const daysUntilDeadline = project.deadline
    ? Math.ceil((new Date(project.deadline + 'T00:00:00').getTime() - todayMs) / 86_400_000)
    : null;

  const deadlineRisk: DeadlineRisk =
    daysUntilDeadline === null          ? 'none' :
    daysUntilDeadline <= 3             ? 'critical' :
    daysUntilDeadline <= 7             ? 'high' :
    daysUntilDeadline <= 14            ? 'low' :
    'none';

  // ── Health score ──────────────────────────────────────────────────────────
  let score = 50;

  // Completion progress (up to +30)
  if (total > 0) score += 30 * (done.length / total);

  // Blocked milestones (−12 each, cap −30)
  score -= Math.min(blocked.length * 12, 30);

  // Overdue milestones (−10 each, cap −20)
  score -= Math.min(overdue.length * 10, 20);

  // Stagnation
  if (daysSinceActivity > 14)     score -= 20;
  else if (daysSinceActivity > 7) score -= 10;

  // Recent activity bonus
  if (daysSinceActivity <= 2)      score += 10;
  else if (daysSinceActivity <= 5) score += 5;

  // Project memories (shows builder is documenting)
  if (projectMemories.length > 0) score += 5;

  // Deadline proximity penalty
  if (deadlineRisk === 'critical') score -= 15;
  else if (deadlineRisk === 'high') score -= 8;

  // Paused projects cap at 40
  if (project.status === 'paused') score = Math.min(score, 40);

  score = Math.max(0, Math.min(100, Math.round(score)));

  const healthLabel: HealthLabel =
    score >= 75 ? 'healthy' :
    score >= 50 ? 'building' :
    score >= 25 ? 'at-risk'  :
    'critical';

  // ── Completion probability ────────────────────────────────────────────────
  let prob = 50;
  if (total > 0) prob = Math.round(40 * (done.length / total) + 30);
  if (velocity > 0.5) prob = Math.min(100, prob + 15);
  if (daysSinceActivity > 14) prob = Math.max(0, prob - 25);
  if (deadlineRisk === 'critical') prob = Math.max(0, prob - 20);
  if (deadlineRisk === 'high')     prob = Math.max(0, prob - 10);
  if (blocked.length > 0)          prob = Math.max(0, prob - 10 * blocked.length);
  prob = Math.max(0, Math.min(100, prob));

  // ── Recommendation ────────────────────────────────────────────────────────
  let recommendation: string;
  if (blocked.length > 0) {
    recommendation = `Unblock ${blocked[0].title} — it's holding up the project.`;
  } else if (overdue.length > 0) {
    recommendation = `${overdue.length} overdue milestone${overdue.length > 1 ? 's' : ''} — address them today.`;
  } else if (daysSinceActivity > 7) {
    recommendation = `No activity in ${daysSinceActivity} days. Pick one milestone and start a focus session.`;
  } else if (deadlineRisk === 'critical' || deadlineRisk === 'high') {
    recommendation = `Deadline approaching. Focus exclusively on the highest-priority remaining milestone.`;
  } else if (total === 0) {
    recommendation = `Break this project into milestones so LifeOS can track your progress.`;
  } else {
    recommendation = `Velocity: ${velocity.toFixed(1)} milestone${velocity !== 1 ? 's' : ''}/week. Keep the current pace.`;
  }

  return {
    projectId:             project.id,
    projectName:           project.title,
    healthScore:           score,
    healthLabel,
    completionProbability: prob,
    velocity,
    blockedCount:          blocked.length,
    overdueCount:          overdue.length,
    daysSinceActivity,
    deadlineRisk,
    daysUntilDeadline,
    completedCount:        done.length,
    totalCount:            total,
    recommendation,
  };
}

// ─── Batch computation ────────────────────────────────────────────────────────

export function computeAllProjectIntelligence(
  projects:      Project[],
  milestones:    Milestone[],
  focusSessions: FocusSession[],
  memories:      MemoryEntry[],
  goals:         Goal[],
  today:         string,
): Record<string, ProjectIntelligence> {
  const result: Record<string, ProjectIntelligence> = {};
  for (const p of projects.filter((p) => p.status !== 'cancelled')) {
    result[p.id] = computeProjectIntelligence(p, milestones, focusSessions, memories, goals, today);
  }
  return result;
}

// ─── Risk detection ───────────────────────────────────────────────────────────

export function detectProjectRisks(
  intelligence: Record<string, ProjectIntelligence>,
  milestones:   Milestone[],
  today:        string,
): ProjectRisk[] {
  const risks: ProjectRisk[] = [];

  for (const pi of Object.values(intelligence)) {
    // Critical health
    if (pi.healthLabel === 'critical') {
      risks.push({
        id: `${pi.projectId}:health`,
        projectId: pi.projectId,
        projectName: pi.projectName,
        riskLevel: 'critical',
        reason: `${pi.projectName} health is critical (${pi.healthScore}%)`,
        actionRequired: pi.recommendation,
      });
    }

    // Blocked milestones
    const blocked = milestones.filter(
      (m) => m.projectId === pi.projectId && m.status === 'blocked',
    );
    for (const b of blocked.slice(0, 2)) {
      risks.push({
        id: `${pi.projectId}:blocked:${b.id}`,
        projectId: pi.projectId,
        projectName: pi.projectName,
        riskLevel: 'high',
        reason: `"${b.title}" is blocked`,
        actionRequired: 'Identify and resolve the blocker before it delays the entire project.',
        milestoneId: b.id,
      });
    }

    // Deadline risk without enough completion
    if ((pi.deadlineRisk === 'critical' || pi.deadlineRisk === 'high') && pi.totalCount > 0) {
      const remainingPct = 1 - (pi.completedCount / pi.totalCount);
      if (remainingPct > 0.3) {
        risks.push({
          id: `${pi.projectId}:deadline`,
          projectId: pi.projectId,
          projectName: pi.projectName,
          riskLevel: pi.deadlineRisk === 'critical' ? 'critical' : 'high',
          reason: `Deadline in ${pi.daysUntilDeadline}d with ${Math.round(remainingPct * 100)}% of milestones remaining`,
          actionRequired: `Cut scope or increase velocity — complete the highest-priority milestones first.`,
        });
      }
    }

    // Stagnation (but not already critical)
    if (pi.daysSinceActivity > 14 && pi.healthLabel !== 'critical') {
      risks.push({
        id: `${pi.projectId}:stagnation`,
        projectId: pi.projectId,
        projectName: pi.projectName,
        riskLevel: 'high',
        reason: `${pi.projectName} has had no activity for ${pi.daysSinceActivity} days`,
        actionRequired: 'Schedule a 30-minute session to review and restart momentum.',
      });
    } else if (pi.daysSinceActivity > 7 && pi.healthLabel === 'at-risk') {
      risks.push({
        id: `${pi.projectId}:slow`,
        projectId: pi.projectId,
        projectName: pi.projectName,
        riskLevel: 'medium',
        reason: `Low activity on ${pi.projectName} — ${pi.daysSinceActivity} days since last update`,
        actionRequired: 'Add a study session or milestone update to maintain momentum.',
      });
    }

    // At-risk health (not already covered)
    if (pi.healthLabel === 'at-risk' && !risks.find((r) => r.projectId === pi.projectId && r.riskLevel !== 'medium')) {
      risks.push({
        id: `${pi.projectId}:at-risk`,
        projectId: pi.projectId,
        projectName: pi.projectName,
        riskLevel: 'medium',
        reason: `${pi.projectName} health is at risk (${pi.healthScore}%)`,
        actionRequired: pi.recommendation,
      });
    }
  }

  // Deduplicate by id, sort by severity
  const seen = new Set<string>();
  const order: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2 };
  return risks
    .filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .sort((a, b) => order[a.riskLevel] - order[b.riskLevel]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function healthLabelColor(label: HealthLabel): string {
  switch (label) {
    case 'healthy':  return '#4ADE80';
    case 'building': return '#C9A84C';
    case 'at-risk':  return '#FB923C';
    case 'critical': return '#F87171';
  }
}

export function highestProjectRisk(risks: ProjectRisk[]): RiskLevel | null {
  if (risks.some((r) => r.riskLevel === 'critical')) return 'critical';
  if (risks.some((r) => r.riskLevel === 'high'))     return 'high';
  if (risks.some((r) => r.riskLevel === 'medium'))   return 'medium';
  return null;
}

export function overallProjectScore(intelligence: Record<string, ProjectIntelligence>): number {
  const vals = Object.values(intelligence).filter((pi) => pi.totalCount > 0);
  if (!vals.length) return 0;
  return Math.round(vals.reduce((s, pi) => s + pi.healthScore, 0) / vals.length);
}
