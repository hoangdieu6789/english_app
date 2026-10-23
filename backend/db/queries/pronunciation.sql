-- name: CreatePronunciationAttempt :one
INSERT INTO pronunciation_attempts (
  user_id, audio_url, reference_text, recognized_text,
  overall_score, fluency_score, word_scores, phoneme_scores
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;
