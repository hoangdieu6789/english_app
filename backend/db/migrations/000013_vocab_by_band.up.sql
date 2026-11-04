-- Learner goals: an estimate of the current band (used until IELTS attempts give a measured
-- one) and the target band. New review words are picked between the two.
ALTER TABLE users
  ADD COLUMN self_band REAL CHECK (self_band BETWEEN 0 AND 9),
  ADD COLUMN target_band REAL CHECK (target_band BETWEEN 0 AND 9);

-- NGSL / NAWL headwords with a band estimate (backend/internal/vocab, seeded on start).
-- Meaning, IPA and examples are written once by the LLM and shared by all learners.
CREATE TABLE vocab_words (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word        TEXT NOT NULL UNIQUE,
  source      TEXT NOT NULL CHECK (source IN ('ngsl', 'nawl')),
  rank        INT NOT NULL,
  band        REAL NOT NULL,
  pos         TEXT,
  ipa         TEXT,
  meaning_vi  TEXT,
  example_en  TEXT,
  example_vi  TEXT,
  enriched_at TIMESTAMPTZ
);

CREATE INDEX idx_vocab_words_band ON vocab_words(band, rank);

-- Two kinds of review cards: pronunciation (a word said wrongly) and vocab (a new word for
-- the learner's band). A pronunciation word is only reviewed once it was said wrongly in at
-- least 2 attempts or scored under 40 (one low score is often a recognition slip).
ALTER TABLE review_words
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'pronunciation' CHECK (kind IN ('pronunciation', 'vocab')),
  ADD COLUMN vocab_word_id UUID REFERENCES vocab_words(id) ON DELETE CASCADE,
  ADD COLUMN misses INT NOT NULL DEFAULT 1,
  ADD COLUMN min_score REAL NOT NULL DEFAULT 100;

ALTER TABLE review_words DROP CONSTRAINT review_words_user_id_word_key;
ALTER TABLE review_words ADD CONSTRAINT review_words_user_kind_word_key UNIQUE (user_id, kind, word);

-- Misses and lowest score of the existing (backfilled) pronunciation words.
UPDATE review_words r
SET misses = s.n, min_score = s.m
FROM (
  SELECT a.user_id,
         lower(regexp_replace(w->>'word', '[^A-Za-z'']', '', 'g')) AS word,
         count(DISTINCT a.id)::int AS n,
         min((w->>'accuracyScore')::real) AS m
  FROM pronunciation_attempts a, jsonb_array_elements(a.word_scores) w
  WHERE w->>'errorType' IN ('none', 'mispronunciation')
    AND (w->>'errorType' = 'mispronunciation' OR (w->>'accuracyScore')::real < 60)
  GROUP BY 1, 2
) s
WHERE r.user_id = s.user_id AND r.word = s.word AND r.kind = 'pronunciation';
UPDATE review_words SET min_score = last_score WHERE min_score > last_score;
