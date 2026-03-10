import { supabase } from '../lib/supabase';
import type { DbProfile, DbProfileInsert, DbProfileUpdate } from '../lib/supabaseTypes';
import type { UserProfile } from '../types';

// ─── Conversion helpers ────────────────────────────────────────────────────────

export function dbProfileToLocal(p: DbProfile): UserProfile {
  return {
    id: p.id,
    name: p.name ?? undefined,
    mainFocus: p.main_focus ?? '',
    biggestDistraction: p.biggest_distraction ?? '',
    habitToRemove: p.habit_to_remove ?? '',
    habitToBuild: p.habit_to_build ?? '',
    seriousnessScore: p.seriousness_score,
    onboardingComplete: p.onboarding_complete,
    isPro: p.is_pro,
    createdAt: p.created_at,
  };
}

export function localProfileToDbInsert(p: UserProfile): DbProfileInsert {
  return {
    id: p.id,
    name: p.name ?? null,
    main_focus: p.mainFocus,
    biggest_distraction: p.biggestDistraction,
    habit_to_remove: p.habitToRemove,
    habit_to_build: p.habitToBuild,
    seriousness_score: p.seriousnessScore,
    onboarding_complete: p.onboardingComplete,
    is_pro: p.isPro,
    wake_time: '06:00',
    sleep_time: '22:30',
    focus_block_mins: 50,
    news_limit_mins: 30,
    mobility_buffer_mins: 10,
  };
}

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

/** Upsert a UserProfile (camelCase) — converts to DB shape internally. */
export async function upsertLocalProfile(profile: UserProfile): Promise<void> {
  const { error } = await table()
    .upsert({ ...localProfileToDbInsert(profile), updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) console.warn('[profileService] upsertLocalProfile:', error.message);
}
