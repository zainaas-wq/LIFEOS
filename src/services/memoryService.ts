/**
 * memoryService — client-side AI memory read/write.
 *
 * Mirrors the type definitions in supabase/functions/_shared/memoryService.ts.
 * Uses the authenticated Supabase anon client — RLS ensures users can only
 * access their own rows.
 *
 * Write contract:
 *   upsertMemory() is idempotent.  The unique constraint on (user_id, memory_key)
 *   means calling it repeatedly with the same key only updates memory_value and
 *   updated_at.  Safe to call from profile updates, onboarding, or any feature
 *   that wants to persist a user preference.
 *
 * Read contract:
 *   fetchMemory() is provided for future inspection UI.  The AI pipeline reads
 *   memory server-side in the ai-chat Edge Function — client-side reads are for
 *   display purposes only, not for building prompts.
 *
 * Scope — Sprint 10 Block A:
 *   Infrastructure only.  No component calls upsertMemory() yet.
 *   Explicit writes from profile/onboarding will land in Block B+.
 */

import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export const MEMORY_TYPES = [
  'profile_preference',
  'productivity_pattern',
  'coaching_preference',
  'goal',
  'habit',
] as const;

export type MemoryType = typeof MEMORY_TYPES[number];

/** Structured memory record as stored in ai_user_memory. */
export interface MemoryRecord {
  id:           string;
  user_id:      string;
  memory_type:  MemoryType;
  memory_key:   string;
  memory_value: Record<string, unknown>;
  created_at:   string;
  updated_at:   string;
}

export interface UpsertMemoryParams {
  /** Category that groups related keys.  Must be a MEMORY_TYPES value. */
  memoryType:  MemoryType;
  /** Unique key within the user's memory (e.g. 'coaching_tone'). */
  memoryKey:   string;
  /** Structured value object.  Follow the canonical key→shape contract. */
  memoryValue: Record<string, unknown>;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Upsert a single memory record for the currently authenticated user.
 *
 * - Idempotent: calling with the same memoryKey updates the existing row.
 * - No-op (silent) when no user session is available.
 * - Does NOT throw — logs a warning on error and returns.
 *
 * Common callers (future):
 *   - Profile screen energy style picker → 'peak_energy_time'
 *   - Onboarding coaching tone selection → 'coaching_tone'
 *   - Recovery flow preference save      → 'recovery_preference'
 */
export async function upsertMemory(params: UpsertMemoryParams): Promise<void> {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) return;

  const { error } = await (supabase as any)
    .from('ai_user_memory')
    .upsert(
      {
        user_id:      user.id,
        memory_type:  params.memoryType,
        memory_key:   params.memoryKey,
        memory_value: params.memoryValue,
      },
      { onConflict: 'user_id,memory_key' },
    );

  if (error) {
    console.warn('[memoryService] upsertMemory failed:', error.message);
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all memory records for the current user, ordered newest-first.
 * Returns [] on any error — callers should handle an empty result gracefully.
 *
 * NOTE: The AI pipeline reads memory server-side in ai-chat.
 * This function is for client-side display (future memory management UI).
 */
export async function fetchMemory(): Promise<MemoryRecord[]> {
  const { data, error } = await (supabase as any)
    .from('ai_user_memory')
    .select('id, user_id, memory_type, memory_key, memory_value, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('[memoryService] fetchMemory failed:', error.message);
    return [];
  }

  return (data as MemoryRecord[]) ?? [];
}

/**
 * Fetch memory records filtered by type.
 * Returns [] on any error.
 */
export async function fetchMemoryByType(memoryType: MemoryType): Promise<MemoryRecord[]> {
  const { data, error } = await (supabase as any)
    .from('ai_user_memory')
    .select('id, user_id, memory_type, memory_key, memory_value, created_at, updated_at')
    .eq('memory_type', memoryType)
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('[memoryService] fetchMemoryByType failed:', error.message);
    return [];
  }

  return (data as MemoryRecord[]) ?? [];
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a specific memory entry by key for the current user.
 * Silent no-op if key doesn't exist or no session.
 */
export async function deleteMemory(memoryKey: string): Promise<void> {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) return;

  const { error } = await (supabase as any)
    .from('ai_user_memory')
    .delete()
    .eq('user_id', user.id)
    .eq('memory_key', memoryKey);

  if (error) {
    console.warn('[memoryService] deleteMemory failed:', error.message);
  }
}
