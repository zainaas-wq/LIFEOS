import { supabase } from '../lib/supabase';
import type { DailyReflection } from '../types';

const table = () => supabase.from('reflections') as any;

export async function getReflections(userId: string): Promise<DailyReflection[]> {
  const { data, error } = await table()
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(30);
  if (error) { console.warn('[reflectionService] getReflections:', error.message); return []; }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    date: row.date,
    text: row.text,
    createdAt: row.created_at,
  }));
}

export async function upsertReflection(
  userId: string,
  r: DailyReflection,
): Promise<void> {
  const { error } = await table().upsert(
    {
      id: r.id,
      user_id: userId,
      date: r.date,
      text: r.text,
      created_at: r.createdAt,
    },
    { onConflict: 'user_id,date' },
  );
  if (error) console.warn('[reflectionService] upsertReflection:', error.message);
}
