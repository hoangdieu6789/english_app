-- Vocabulary games (docs/tickets/GAME-001-vocab-games-plan.md).

-- Adaptive vocab level (1-60, Freerice style); NULL until the learner plays Level Climb.
ALTER TABLE users ADD COLUMN vocab_level SMALLINT CHECK (vocab_level BETWEEN 1 AND 60);

-- One row per finished game.
CREATE TABLE game_plays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game        TEXT NOT NULL,          -- word-match | meteor | bubble-pop | level-climb | ...
  deck        TEXT NOT NULL,          -- mine | band-4 ... band-8 | level
  score       INT NOT NULL,
  correct     INT NOT NULL,
  total       INT NOT NULL,
  duration_ms INT NOT NULL,
  level       SMALLINT,               -- Level Climb: the level reached
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_game_plays_user ON game_plays(user_id, game, created_at DESC);

-- How often the learner answered each word in games (wrong answers first in "My words").
CREATE TABLE game_word_stats (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocab_word_id UUID NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
  seen          INT NOT NULL DEFAULT 0,
  correct       INT NOT NULL DEFAULT 0,
  last_wrong_at TIMESTAMPTZ,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, vocab_word_id)
);
