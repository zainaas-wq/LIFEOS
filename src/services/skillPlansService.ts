import { supabase } from '../lib/supabase';
import type { SkillPlan } from '../types';

const table = () => supabase.from('skill_plans') as any;

function toDb(userId: string, sp: SkillPlan) {
  return {
    id: sp.id,
    user_id: userId,
    title: sp.title,
    level: sp.level,
    weekly_target_hours: sp.weeklyTargetHours,
    goal_id: sp.goalId ?? null,
    steps: sp.steps,
    created_at: sp.createdAt,
  };
}

function fromDb(row: any): SkillPlan {
  return {
    id: row.id,
    title: row.title,
    level: row.level,
    weeklyTargetHours: Number(row.weekly_target_hours),
    steps: row.steps ?? [],
    goalId: row.goal_id ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getSkillPlans(userId: string): Promise<SkillPlan[]> {
  const { data, error } = await table()
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('[skillPlansService] getSkillPlans:', error.message); return []; }
  return (data ?? []).map(fromDb);
}

export async function upsertSkillPlan(userId: string, sp: SkillPlan): Promise<void> {
  const { error } = await table().upsert(toDb(userId, sp), { onConflict: 'id' });
  if (error) console.warn('[skillPlansService] upsertSkillPlan:', error.message);
}

export async function deleteSkillPlan(userId: string, planId: string): Promise<void> {
  const { error } = await table().delete().eq('id', planId).eq('user_id', userId);
  if (error) console.warn('[skillPlansService] deleteSkillPlan:', error.message);
}
