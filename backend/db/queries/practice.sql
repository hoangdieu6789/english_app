-- name: CreatePracticeSentence :one
INSERT INTO practice_sentences (user_id, text, phonetic, gloss)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListRecentPracticeSentenceTexts :many
SELECT text FROM practice_sentences
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT $2;
