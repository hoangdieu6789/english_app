-- name: CreatePracticeSentence :one
-- Adds a sentence to the user's queue (served_at stays NULL until it is shown).
INSERT INTO practice_sentences (user_id, text, phonetic, gloss)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ClaimNextPracticeSentence :one
-- Takes the oldest queued sentence and marks it as shown. SKIP LOCKED keeps two parallel
-- requests from getting the same sentence.
UPDATE practice_sentences
SET served_at = now()
WHERE id = (
  SELECT q.id FROM practice_sentences q
  WHERE q.user_id = sqlc.arg(user_id) AND q.served_at IS NULL
  ORDER BY q.created_at, q.id
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- name: CountQueuedPracticeSentences :one
SELECT count(*) FROM practice_sentences
WHERE user_id = $1 AND served_at IS NULL;

-- name: ListRecentPracticeSentenceTexts :many
-- Shown and queued sentences, so a new batch does not repeat either.
SELECT text FROM practice_sentences
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT $2;
