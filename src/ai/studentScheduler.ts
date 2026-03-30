import type { Goal, PlanItem } from '../types';

function daysUntil(deadline: string, today: string): number {
  return Math.floor(
    (new Date(deadline + 'T00:00:00').getTime() -
     new Date(today   + 'T00:00:00').getTime()) / 86_400_000,
  );
}

const PHASE_MAP: Record<number, string[]> = {
  5: ['Review', 'Practice', 'Deep Work', 'Fix Mistakes', 'Final Prep'],
  4: ['Practice', 'Deep Work', 'Fix Mistakes', 'Final Prep'],
  3: ['Deep Work', 'Fix Mistakes', 'Final Prep'],
  2: ['Intensive Review', 'Final Prep'],
  1: ['Final Prep'],
};

export function getStudentSessions(goal: Goal, today: string): string[] {
  if (!goal.deadline) return [];
  const days = daysUntil(goal.deadline, today);
  if (days <= 0) return ['Recovery Session'];
  const key = Math.min(days, 5) as keyof typeof PHASE_MAP;
  return PHASE_MAP[key] ?? ['Final Prep'];
}

export function enrichPlanItemsWithStudentLabels(
  items: PlanItem[],
  goals: Goal[],
  today: string,
): PlanItem[] {
  const sessionIndex = new Map<string, number>();
  return items.map(item => {
    if ((item.type !== 'goal' && item.type !== 'skill') || !item.goalId) return item;
    const goal = goals.find(g => g.id === item.goalId);
    if (!goal?.deadline) return item;
    const sessions = getStudentSessions(goal, today);
    if (!sessions.length) return item;
    const idx = sessionIndex.get(item.goalId) ?? 0;
    sessionIndex.set(item.goalId, idx + 1);
    // Write to displayLabel, never mutate title — title is the canonical goal name
    return { ...item, displayLabel: `${item.title} — ${sessions[Math.min(idx, sessions.length - 1)]}` };
  });
}
