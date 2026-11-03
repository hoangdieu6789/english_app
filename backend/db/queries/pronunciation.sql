-- name: CreatePronunciationAttempt :one
INSERT INTO pronunciation_attempts (
  user_id, audio_url, reference_text, recognized_text,
  overall_score, fluency_score, word_scores, phoneme_scores,
  task_type, completeness_score, prosody_score, pron_score,
  azure_result, rubric, rubric_score, cefr_level, rubric_version,
  question_set_id, task_prompt
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
RETURNING *;
