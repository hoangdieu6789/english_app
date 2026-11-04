-- name: UpsertReviewWord :exec
-- A word said wrongly (again): due now, schedule restarted.
INSERT INTO review_words (user_id, word, last_score)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, word) DO UPDATE
SET last_score = EXCLUDED.last_score,
    interval_days = 0,
    reps = 0,
    lapses = review_words.lapses + CASE WHEN review_words.reps > 0 THEN 1 ELSE 0 END,
    due_at = LEAST(review_words.due_at, now());

-- name: ListDueReviewWords :many
SELECT * FROM review_words
WHERE user_id = $1 AND due_at <= now()
ORDER BY due_at, word
LIMIT $2;

-- name: ListUpcomingReviewWords :many
SELECT * FROM review_words
WHERE user_id = $1 AND due_at > now()
ORDER BY due_at, word
LIMIT $2;

-- name: CountReviewWords :one
SELECT count(*) FILTER (WHERE due_at <= now())::int AS due,
       count(*)::int AS total
FROM review_words
WHERE user_id = $1;

-- name: GetReviewWord :one
SELECT * FROM review_words WHERE id = $1 AND user_id = $2;

-- name: UpdateReviewWordSchedule :exec
UPDATE review_words
SET last_score = $2, ease = $3, interval_days = $4, reps = $5, lapses = $6, due_at = $7,
    last_reviewed_at = now()
WHERE id = $1;

-- name: DeleteReviewWord :execrows
DELETE FROM review_words WHERE id = $1 AND user_id = $2;
