import { supabase } from '../lib/supabase';
import type { Goal } from '../types';

const table = () => supabase.from('goals') as any;

function toDb(userId: string, g: Goal) {
  return {
    id: g.id,
    user_id: userId,
    title: g.title,
    category: g.category,
    priority: g.priority,
    weekly_hours_target: g.weeklyHoursTarget,
    deadline: g.deadline ?? null,
    linked_skill_plan_id: g.linkedSkillPlanId ?? null,
    created_at: g.createdAt,
  };
}

function fromDb(row: any): Goal {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    weeklyHoursTarget: Number(row.weekly_hours_target),
    deadline: row.deadline ?? undefined,
    linkedSkillPlanId: row.linked_skill_plan_id ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getGoals(userId: string): Promise<Goal[]> {
  const { data, error } = await table()
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('[goalsService] getGoals:', error.message); return []; }
  return (data ?? []).map(fromDb);
}

export async function upsertGoal(userId: string, g: Goal): Promise<void> {
  const { error } = await table().upsert(toDb(userId, g), { onConflict: 'id' });
  if (error) console.warn('[goalsService] upsertGoal:', error.message);
}

export async function deleteGoal(userId: string, goalId: string): Promise<void> {
  const { error } = await table().delete().eq('id', goalId).eq('user_id', userId);
  if (error) console.warn('[goalsService] deleteGoal:', error.message);
}
