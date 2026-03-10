import { supabase } from '../lib/supabase';
import type { Rule } from '../types';

// DB has followed_today column — restored on hydration, treated as ephemeral daily state.
const table = () => supabase.from('rules') as any;

function toDb(userId: string, r: Rule) {
  return {
    id: r.id,
    user_id: userId,
    title: r.title,
    enabled: r.enabled,
    type: r.type,
    start_time: r.startTime ?? null,
    end_time: r.endTime ?? null,
    days_of_week: r.daysOfWeek ?? null,
    followed_today: r.followedToday ?? false,
    created_at: r.createdAt,
  };
}

function fromDb(row: any): Rule {
  return {
    id: row.id,
    title: row.title,
    enabled: row.enabled,
    type: row.type,
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
    daysOfWeek: row.days_of_week ?? undefined,
    followedToday: row.followed_today ?? false,
    createdAt: row.created_at,
  };
}

export async function getRules(userId: string): Promise<Rule[]> {
  const { data, error } = await table()
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('[rulesService] getRules:', error.message); return []; }
  return (data ?? []).map(fromDb);
}

export async function upsertRule(userId: string, r: Rule): Promise<void> {
  const { error } = await table().upsert(toDb(userId, r), { onConflict: 'id' });
  if (error) console.warn('[rulesService] upsertRule:', error.message);
}

export async function deleteRule(userId: string, ruleId: string): Promise<void> {
  const { error } = await table().delete().eq('id', ruleId).eq('user_id', userId);
  if (error) console.warn('[rulesService] deleteRule:', error.message);
}
