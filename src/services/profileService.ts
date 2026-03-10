import { supabase } from '../lib/supabase';
import type { DbProfile, DbProfileInsert, DbProfileUpdate } from '../lib/supabaseTypes';

// Supabase JS v2's typed builder chain narrows to `never` when hand-written
// Insert/Update types don't exactly match the generated format (generated files
// mark defaulted columns as optional). Type safety is enforced at the function
// signature boundary; we cast the builder internally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => supabase.from('profiles') as any;

export async function getProfile(userId: string): Promise<DbProfile | null> {
  const { data, error } = await table()
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    // PGRST116 = row not found — not a real error in this context
    if (error.code !== 'PGRST116') {
      console.warn('[profileService] getProfile error:', error.message);
    }
    return null;
  }
  return data as DbProfile;
}

export async function upsertProfile(profile: DbProfileInsert): Promise<DbProfile | null> {
  const { data, error } = await table()
    .upsert({ ...profile, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) {
    console.warn('[profileService] upsertProfile error:', error.message);
    throw error;
  }
  return data as DbProfile;
}

export async function updateProfile(userId: string, patch: DbProfileUpdate): Promise<void> {
  const { error } = await table()
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    console.warn('[profileService] updateProfile error:', error.message);
    throw error;
  }
}
