import { supabase } from '../lib/supabase';
import type { DistractionLog } from '../types';

const table = () => supabase.from('distraction_logs') as any;

export async function insertDistractionLog(
  userId: string,
  log: DistractionLog,
): Promise<void> {
  const { error } = await table().insert({
    id: log.id,
    user_id: userId,
    timestamp: log.timestamp,
    note: log.note ?? null,
  });
  if (error) console.warn('[distractionService] insertDistractionLog:', error.message);
}

export async function getDistractionLogs(
  userId: string,
  since?: string,
): Promise<DistractionLog[]> {
  let q = table().select('*').eq('user_id', userId);
  if (since) q = q.gte('timestamp', since);
  const { data, error } = await q.order('timestamp', { ascending: false });
  if (error) { console.warn('[distractionService] getDistractionLogs:', error.message); return []; }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    timestamp: row.timestamp,
    note: row.note ?? undefined,
  }));
}
