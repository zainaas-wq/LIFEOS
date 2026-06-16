/**
 * memoriesService — CRUD for the Supabase `memories` table.
 *
 * Mirrors the MemoryEntry type used in the store, translating between
 * camelCase (app) and snake_case (DB).
 *
 * All functions are fire-safe: they throw on genuine errors so callers
 * can .catch(console.warn) and continue offline.
 */

import { supabase } from '../lib/supabase';
import type { MemoryEntry, MemoryEntrySource } from '../types';

// ─── DB row shape ─────────────────────────────────────────────────────────────

interface MemoryRow {
  id:               string;
  user_id:          string;
  title:            string;
  content:          string;
  memory_type:      string;
  source:           string;
  tags:             string[];
  linked_goal_id:   string | null;
  metadata:         Record<string, unknown>;
  embedding_status: string;
  created_at:       string;
  updated_at:       string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function rowToEntry(row: MemoryRow): MemoryEntry {
  return {
    id:                  row.id,
    title:               row.title,
    content:             row.content,
    source:              row.source as MemoryEntrySource,
    tags:                row.tags ?? [],
    linkedGoalId:        row.linked_goal_id ?? undefined,
    linkedCourseId:      (row.metadata?.linked_course_id      as string | undefined) ?? undefined,
    linkedTopicId:       (row.metadata?.linked_topic_id       as string | undefined) ?? undefined,
    linkedExamId:        (row.metadata?.linked_exam_id        as string | undefined) ?? undefined,
    linkedAssignmentId:  (row.metadata?.linked_assignment_id  as string | undefined) ?? undefined,
    linkedProjectId:     (row.metadata?.linked_project_id     as string | undefined) ?? undefined,
    linkedMilestoneId:   (row.metadata?.linked_milestone_id   as string | undefined) ?? undefined,
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
  };
}

function entryToRow(userId: string, entry: MemoryEntry): Omit<MemoryRow, 'embedding_status'> {
  const metadata: Record<string, unknown> = {};
  if (entry.linkedCourseId)     metadata.linked_course_id     = entry.linkedCourseId;
  if (entry.linkedTopicId)      metadata.linked_topic_id      = entry.linkedTopicId;
  if (entry.linkedExamId)       metadata.linked_exam_id       = entry.linkedExamId;
  if (entry.linkedAssignmentId) metadata.linked_assignment_id = entry.linkedAssignmentId;
  if (entry.linkedProjectId)    metadata.linked_project_id    = entry.linkedProjectId;
  if (entry.linkedMilestoneId)  metadata.linked_milestone_id  = entry.linkedMilestoneId;
  return {
    id:             entry.id,
    user_id:        userId,
    title:          entry.title,
    content:        entry.content,
    memory_type:    entry.source,
    source:         entry.source,
    tags:           entry.tags,
    linked_goal_id: entry.linkedGoalId ?? null,
    metadata,
    created_at:     entry.createdAt,
    updated_at:     entry.updatedAt,
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getMemories(userId: string): Promise<MemoryEntry[]> {
  const { data, error } = await supabase
    .from('memories')
    .select('id, title, content, source, memory_type, tags, linked_goal_id, created_at, updated_at, embedding_status, metadata')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data as MemoryRow[]).map(rowToEntry);
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function upsertMemory(userId: string, entry: MemoryEntry): Promise<void> {
  const row = entryToRow(userId, entry);
  const { error } = await supabase
    .from('memories')
    .upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
  if (error) throw error;
}

export async function deleteMemory(userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from('memories')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

// ─── Migration helper ─────────────────────────────────────────────────────────
// Push a batch of local memories to Supabase (used on first login after Sprint 1).
// Skips memories already on the server (id conflict → upsert merges).

export async function migrateLocalMemories(
  userId:   string,
  entries:  MemoryEntry[],
): Promise<void> {
  if (!entries.length) return;
  const rows = entries.map((e) => entryToRow(userId, e));
  const { error } = await supabase
    .from('memories')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}
