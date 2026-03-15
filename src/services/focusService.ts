import { supabase } from '../lib/supabase';
import type { FocusSession } from '../types';

// DB columns: start_at / end_at  (local type: start / end)
const table = () => supabase.from('focus_sessions') as any;

function toDb(userId: string, s: FocusSession) {
  return {
    id: s.id,
    user_id: userId,
    start_at: s.start,
    end_at: s.end ?? null,
    goal_id: s.goalId ?? null,
    skill_plan_id: s.skillPlanId ?? null,
    notes: s.notes ?? null,
    duration_minutes: s.durationMinutes ?? null,
    created_at: s.start,
  };
}

function fromDb(row: any): FocusSession {
  return {
    id: row.id,
    start: row.start_at,
    end: row.end_at ?? undefined,
    goalId: row.goal_id ?? undefined,
    skillPlanId: row.skill_plan_id ?? undefined,
    notes: row.notes ?? undefined,
    durationMinutes: row.duration_minutes ?? undefined,
  };
}

export async function getFocusSessions(userId: string, since?: string): Promise<FocusSession[]> {
  let q = table().select('*').eq('user_id', userId);
  if (since) q = q.gte('start_at', since);
  const { data, error } = await q.order('start_at', { ascending: false });
  if (error) { console.warn('[focusService] getFocusSessions:', error.message); return []; }
  return (data ?? []).map(fromDb);
}

export async function insertFocusSession(userId: string, s: FocusSession): Promise<void> {
  const { error } = await table().upsert(toDb(userId, s), { onConflict: 'id' });
  if (error) console.warn('[focusService] insertFocusSession:', error.message);
}
