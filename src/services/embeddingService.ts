/**
 * embeddingService — Sprint 2: Semantic Memory Engine (client-side)
 *
 * Triggers embedding generation for a memory after it's saved to Supabase.
 * Called fire-and-forget — embedding failures never block the user.
 */

import { supabase } from '../lib/supabase';

/**
 * Calls the generate-embedding Edge Function for a given memory.
 * Fire-and-forget — errors are swallowed so the caller is never blocked.
 */
export async function triggerEmbedding(memoryId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const supabaseUrl = (supabase as any).supabaseUrl as string | undefined
      ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return;

    const endpoint = `${supabaseUrl}/functions/v1/generate-embedding`;

    // Fire-and-forget — don't await response
    fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ memory_id: memoryId }),
    }).catch((err) => {
      console.warn('[embeddingService] trigger failed:', err?.message ?? err);
    });
  } catch (err) {
    console.warn('[embeddingService] unexpected error:', err);
  }
}
