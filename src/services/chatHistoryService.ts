/**
 * chatHistoryService — Batch 5: persist AI chat history to Supabase.
 *
 * Table: ai_chat_history
 *   id           text        primary key
 *   user_id      uuid        references auth.users not null
 *   role         text        'user' | 'assistant'
 *   content      text
 *   created_at   timestamptz
 *   credit_cost  int         nullable
 *   request_mode text        nullable ('text' | 'voice' | 'image')
 *
 * All functions fail gracefully — if the table doesn't exist or the network
 * is down, the chat still works; persistence is best-effort.
 *
 * We keep only the last MAX_STORED messages per user to avoid unbounded growth.
 */

import { supabase } from '../lib/supabase';
import type { ChatMessage } from '../types';

const TABLE          = 'ai_chat_history';
const MAX_STORED     = 100; // rows kept per user
const DEFAULT_LIMIT  = 30;  // messages loaded on screen open

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveChatMessage(
  userId: string,
  msg: ChatMessage,
): Promise<void> {
  try {
    const { error } = await (supabase as any).from(TABLE).upsert(
      {
        id:           msg.id,
        user_id:      userId,
        role:         msg.role,
        content:      msg.content,
        created_at:   msg.createdAt,
        credit_cost:  msg.creditCost  ?? null,
        request_mode: msg.requestMode ?? null,
      },
      { onConflict: 'id' },
    );
    if (error) console.warn('[chatHistoryService] saveChatMessage:', error.message);
  } catch (e: any) {
    console.warn('[chatHistoryService] saveChatMessage threw:', e?.message);
  }
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadChatHistory(
  userId: string,
  limit = DEFAULT_LIMIT,
): Promise<ChatMessage[]> {
  try {
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .select('id, role, content, created_at, credit_cost, request_mode')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[chatHistoryService] loadChatHistory:', error.message);
      return [];
    }

    return ((data ?? []) as any[])
      .reverse() // ascending order for rendering
      .map((row) => ({
        id:          row.id,
        role:        row.role,
        content:     row.content,
        createdAt:   row.created_at,
        creditCost:  row.credit_cost   ?? undefined,
        requestMode: row.request_mode  ?? undefined,
      }));
  } catch (e: any) {
    console.warn('[chatHistoryService] loadChatHistory threw:', e?.message);
    return [];
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

export async function clearChatHistory(userId: string): Promise<void> {
  try {
    const { error } = await (supabase as any)
      .from(TABLE)
      .delete()
      .eq('user_id', userId);
    if (error) console.warn('[chatHistoryService] clearChatHistory:', error.message);
  } catch (e: any) {
    console.warn('[chatHistoryService] clearChatHistory threw:', e?.message);
  }
}

// ─── Prune ────────────────────────────────────────────────────────────────────

/**
 * Keep only the most recent MAX_STORED messages for a user.
 * Called after each save to prevent unbounded growth.
 * Fails silently — pruning is best-effort.
 */
export async function pruneChatHistory(userId: string): Promise<void> {
  try {
    // Fetch IDs of the oldest rows beyond our limit
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(MAX_STORED);

    if (error || !data) return;

    // If we have fewer rows than the limit, nothing to prune
    if ((data as any[]).length < MAX_STORED) return;

    // Delete everything older than the Nth row
    const oldestKeptId = (data as any[])[0]?.id;
    if (!oldestKeptId) return;

    await (supabase as any)
      .from(TABLE)
      .delete()
      .eq('user_id', userId)
      .lt('created_at', (data as any[])[0].created_at);
  } catch {
    // Silent — pruning is maintenance only
  }
}
