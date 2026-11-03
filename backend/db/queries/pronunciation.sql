-- name: CreatePronunciationAttempt :one
INSERT INTO pronunciation_attempts (
  user_id, audio_url, reference_text, recognized_text,
  overall_score, fluency_score, word_scores, phoneme_scores,
  task_type, completeness_score, prosody_score, pron_score,
  azure_result, rubric, rubric_score, cefr_level, rubric_version,
  question_set_id, task_prompt, grader_provider, grader_model, grading_status, transcript_source
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
RETURNING *;

-- name: GetPronunciationAttempt :one
SELECT * FROM pronunciation_attempts WHERE id = $1 AND user_id = $2;

-- name: UpdateAttemptGrading :exec
-- Final result of the background LLM step.
UPDATE pronunciation_attempts
SET rubric = $2, rubric_score = $3, cefr_level = $4, rubric_version = $5,
    grader_provider = $6, grader_model = $7, grading_status = $8
WHERE id = $1;

-- name: ListPendingGrading :many
-- Attempts whose LLM step did not finish (e.g. the API restarted), oldest first.
SELECT * FROM pronunciation_attempts
WHERE grading_status = 'pending'
ORDER BY created_at
LIMIT $1;

-- name: SetGradingStatus :exec
UPDATE pronunciation_attempts SET grading_status = $2 WHERE id = $1;
