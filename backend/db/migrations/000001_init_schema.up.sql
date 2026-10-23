CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  level TEXT,
  target_goal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  listening_minutes INT NOT NULL DEFAULT 0,
  speaking_minutes INT NOT NULL DEFAULT 0,
  exercises_completed INT NOT NULL DEFAULT 0
);

CREATE TABLE pronunciation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  audio_url TEXT NOT NULL,
  reference_text TEXT NOT NULL,
  recognized_text TEXT,
  overall_score REAL NOT NULL,
  fluency_score REAL NOT NULL,
  word_scores JSONB NOT NULL,
  phoneme_scores JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vocab_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  word TEXT NOT NULL,
  gap_type TEXT NOT NULL,
  occurrence_count INT NOT NULL DEFAULT 1,
  last_score REAL,
  status TEXT NOT NULL DEFAULT 'new',
  next_review_date TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);

CREATE TABLE progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  week_of TIMESTAMPTZ NOT NULL,
  avg_accuracy REAL NOT NULL,
  avg_fluency REAL NOT NULL,
  vocab_mastered INT NOT NULL,
  streak INT NOT NULL
);
