-- name: GetSampleAnswer :one
SELECT content FROM sample_answers WHERE question_hash = $1 AND band = $2 AND lang = $3;

-- name: SaveSampleAnswer :exec
INSERT INTO sample_answers (question_hash, task_type, question, band, lang, content)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (question_hash, band, lang) DO NOTHING;

-- name: SaveImprovedAnswer :exec
UPDATE pronunciation_attempts SET improved_answer = $3 WHERE id = $1 AND user_id = $2;
