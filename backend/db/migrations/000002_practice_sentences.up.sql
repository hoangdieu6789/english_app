CREATE TABLE practice_sentences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  phonetic TEXT NOT NULL,
  gloss TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_practice_sentences_user_created ON practice_sentences(user_id, created_at DESC);
