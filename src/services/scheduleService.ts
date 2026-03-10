import { supabase } from '../lib/supabase';
import type { ScheduleEvent } from '../types';

// DB columns: start_time / end_time  (local type: start / end)
const table = () => supabase.from('schedule_events') as any;

function toDb(userId: string, e: ScheduleEvent) {
  return {
    id: e.id,
    user_id: userId,
    title: e.title,
    start_time: e.start,
    end_time: e.end,
    category: e.category,
    location: e.location ?? null,
    notes: e.notes ?? null,
    recurring: e.recurring,
    days_of_week: e.daysOfWeek,
    created_at: e.createdAt,
  };
}

function fromDb(row: any): ScheduleEvent {
  return {
    id: row.id,
    title: row.title,
    start: row.start_time,
    end: row.end_time,
    category: row.category,
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    recurring: row.recurring,
    daysOfWeek: row.days_of_week ?? [],
    createdAt: row.created_at,
  };
}

export async function getScheduleEvents(userId: string): Promise<ScheduleEvent[]> {
  const { data, error } = await table()
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('[scheduleService] getScheduleEvents:', error.message); return []; }
  return (data ?? []).map(fromDb);
}

export async function upsertScheduleEvent(userId: string, e: ScheduleEvent): Promise<void> {
  const { error } = await table().upsert(toDb(userId, e), { onConflict: 'id' });
  if (error) console.warn('[scheduleService] upsertScheduleEvent:', error.message);
}

export async function deleteScheduleEvent(userId: string, eventId: string): Promise<void> {
  const { error } = await table().delete().eq('id', eventId).eq('user_id', userId);
  if (error) console.warn('[scheduleService] deleteScheduleEvent:', error.message);
}
