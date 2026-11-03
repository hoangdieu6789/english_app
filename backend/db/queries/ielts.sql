-- name: InsertQuestionSet :execrows
-- Adds a set unless one with the same kind and topic exists (seed runs on every start).
INSERT INTO ielts_question_sets (kind, topic, prompt, points, questions, source)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (kind, lower(topic)) DO NOTHING;

-- name: GetQuestionSet :one
SELECT * FROM ielts_question_sets WHERE id = $1;

-- name: PickUnseenQuestionSet :one
-- A random set of this kind that the user has not answered for this task type yet.
SELECT s.* FROM ielts_question_sets s
WHERE s.kind = sqlc.arg(kind)
  AND (sqlc.narg(exclude_id)::uuid IS NULL OR s.id <> sqlc.narg(exclude_id)::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM pronunciation_attempts a
    WHERE a.user_id = sqlc.arg(user_id) AND a.question_set_id = s.id AND a.task_type = sqlc.arg(task_type)
  )
ORDER BY random()
LIMIT 1;

-- name: PickOldestDoneQuestionSet :one
-- When every set is done: the set the user answered longest ago (good for review).
SELECT s.* FROM ielts_question_sets s
JOIN pronunciation_attempts a
  ON a.question_set_id = s.id AND a.user_id = sqlc.arg(user_id) AND a.task_type = sqlc.arg(task_type)
WHERE s.kind = sqlc.arg(kind)
  AND (sqlc.narg(exclude_id)::uuid IS NULL OR s.id <> sqlc.narg(exclude_id)::uuid)
GROUP BY s.id
ORDER BY max(a.created_at)
LIMIT 1;

-- name: CountUnseenQuestionSets :one
SELECT count(*) FROM ielts_question_sets s
WHERE s.kind = sqlc.arg(kind)
  AND NOT EXISTS (
    SELECT 1 FROM pronunciation_attempts a
    WHERE a.user_id = sqlc.arg(user_id) AND a.question_set_id = s.id AND a.task_type = sqlc.arg(task_type)
  );

-- name: ListQuestionSetsWithProgress :many
-- Every set of this kind with the user's progress for this task type: done sets first
-- (most recent first), then the rest by topic.
SELECT s.id, s.kind, s.topic, s.prompt, s.points, s.questions, s.source,
  count(a.id)::int AS attempt_count,
  max(a.created_at)::timestamptz AS last_attempt_at,
  COALESCE(max(a.rubric_score), 0)::real AS best_band  -- 0 = no band yet
FROM ielts_question_sets s
LEFT JOIN pronunciation_attempts a
  ON a.question_set_id = s.id AND a.user_id = sqlc.arg(user_id) AND a.task_type = sqlc.arg(task_type)
WHERE s.kind = sqlc.arg(kind)
GROUP BY s.id
ORDER BY count(a.id) = 0, max(a.created_at) DESC NULLS LAST, s.topic;

-- name: ListQuestionSetTopics :many
SELECT topic FROM ielts_question_sets WHERE kind = $1 ORDER BY created_at;
