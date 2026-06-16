-- beta_feedback: permanent storage for closed beta qualitative feedback.
-- Analytics events are for dashboards; this table is for product decisions.

CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  recommendation_score  smallint    NOT NULL CHECK (recommendation_score BETWEEN 1 AND 5),
  felt_personalized     text        NOT NULL CHECK (felt_personalized IN ('yes', 'somewhat', 'no')),
  would_return          text        NOT NULL CHECK (would_return IN ('yes', 'somewhat', 'no')),
  confused              text,
  missing               text,
  impressed             text,
  app_version           text        NOT NULL DEFAULT '1.0.0-beta',
  platform              text        NOT NULL DEFAULT 'unknown',
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the admin review filters
CREATE INDEX IF NOT EXISTS idx_beta_feedback_created_at
  ON public.beta_feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beta_feedback_rec_score
  ON public.beta_feedback (recommendation_score);

CREATE INDEX IF NOT EXISTS idx_beta_feedback_would_return
  ON public.beta_feedback (would_return);

-- RLS
ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback (or anonymous if guest)
CREATE POLICY "Users can insert own feedback"
  ON public.beta_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Any authenticated user can read all feedback (closed beta — all users are trusted)
CREATE POLICY "Authenticated users can read all feedback"
  ON public.beta_feedback
  FOR SELECT
  USING (auth.role() = 'authenticated');
