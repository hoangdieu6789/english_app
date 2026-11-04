-- Words the learner said wrongly, reviewed on a spaced-repetition schedule (SM-2): the
-- learner says the word, Azure scores it against the word, and a good score pushes the next
-- review further out. A word comes back (due now) whenever it is said wrongly again.
CREATE TABLE review_words (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word             TEXT NOT NULL,                -- lower case
  last_score       REAL NOT NULL,                -- latest Azure accuracy for the word (0-100)
  ease             REAL NOT NULL DEFAULT 2.5,
  interval_days    INT NOT NULL DEFAULT 0,
  reps             INT NOT NULL DEFAULT 0,       -- successful reviews in a row
  lapses           INT NOT NULL DEFAULT 0,
  due_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);

CREATE INDEX idx_review_words_due ON review_words(user_id, due_at);

-- Start with the weak words of the last 30 days (same rule as the progress page).
INSERT INTO review_words (user_id, word, last_score)
SELECT a.user_id, lower(regexp_replace(w->>'word', '[^A-Za-z'']', '', 'g')), avg((w->>'accuracyScore')::real)
FROM pronunciation_attempts a, jsonb_array_elements(a.word_scores) w
WHERE a.created_at > now() - interval '30 days'
  AND w->>'errorType' IN ('none', 'mispronunciation')
  AND (w->>'errorType' = 'mispronunciation' OR (w->>'accuracyScore')::real < 60)
  AND length(regexp_replace(w->>'word', '[^A-Za-z'']', '', 'g')) >= 3
GROUP BY 1, 2
ON CONFLICT DO NOTHING;
