-- ============================================================
-- Phase A Sprint 1: Durable Memory System
-- Creates memories, memory_tags, memory_relations tables.
-- Enables pgvector for Sprint 2 semantic search.
-- ============================================================

-- pgvector extension (required for Sprint 2 embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── memories ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memories (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  content          TEXT        NOT NULL DEFAULT '',
  memory_type      TEXT        NOT NULL DEFAULT 'note',   -- MemoryEntrySource value
  source           TEXT        NOT NULL DEFAULT 'note',   -- same field, dual-named for clarity
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  linked_goal_id   UUID,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  -- Sprint 2: embedding fields
  embedding_status TEXT        NOT NULL DEFAULT 'pending', -- 'pending'|'processing'|'done'|'failed'
  embedding        vector(1536),                          -- text-embedding-3-small dimensions
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own memories"
  ON memories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS memories_user_id_idx    ON memories (user_id);
CREATE INDEX IF NOT EXISTS memories_updated_at_idx ON memories (updated_at DESC);
CREATE INDEX IF NOT EXISTS memories_source_idx     ON memories (user_id, source);
-- Embedding index (IVFFlat — tune lists after data volume grows)
CREATE INDEX IF NOT EXISTS memories_embedding_idx
  ON memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

-- ─── memory_tags ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_tags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id   UUID        NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  tag         TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (memory_id, tag)
);

ALTER TABLE memory_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own memory tags"
  ON memory_tags FOR ALL
  USING (
    EXISTS (SELECT 1 FROM memories m WHERE m.id = memory_id AND m.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM memories m WHERE m.id = memory_id AND m.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS memory_tags_memory_id_idx ON memory_tags (memory_id);
CREATE INDEX IF NOT EXISTS memory_tags_tag_idx       ON memory_tags (tag);

-- ─── memory_relations ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_relations (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id          UUID        NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  related_memory_id  UUID        NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  relation_type      TEXT        NOT NULL DEFAULT 'related', -- 'related'|'contradicts'|'extends'|'source'
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (memory_id, related_memory_id)
);

ALTER TABLE memory_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own memory relations"
  ON memory_relations FOR ALL
  USING (
    EXISTS (SELECT 1 FROM memories m WHERE m.id = memory_id AND m.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM memories m WHERE m.id = memory_id AND m.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS memory_relations_memory_id_idx ON memory_relations (memory_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memories_updated_at
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Sprint 2: Semantic search RPC ───────────────────────────────────────────
-- Called by the ai-chat Edge Function to find contextually relevant memories.
-- Returns memories sorted by cosine similarity to the query embedding.

CREATE OR REPLACE FUNCTION search_memories(
  query_embedding  vector(1536),
  user_id_param    UUID,
  match_threshold  FLOAT   DEFAULT 0.65,
  match_count      INT     DEFAULT 8
)
RETURNS TABLE (
  id          UUID,
  title       TEXT,
  content     TEXT,
  source      TEXT,
  tags        TEXT[],
  similarity  FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    id,
    title,
    content,
    source,
    tags,
    1 - (embedding <=> query_embedding) AS similarity
  FROM memories
  WHERE
    user_id = user_id_param
    AND embedding IS NOT NULL
    AND embedding_status = 'done'
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
