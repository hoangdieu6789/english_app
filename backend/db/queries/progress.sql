-- Progress page (Phase 4). Every query reads pronunciation_attempts; days and weeks use the
-- learner's time zone (sqlc.arg(tz), an IANA name checked by the handler).
-- Bands only count IELTS attempts graded with rubric v2 (0–9); v1 attempts used 0–100.

-- name: ProgressTotals :one
SELECT
  count(*)::int AS attempts,
  count(*) FILTER (WHERE (a.created_at AT TIME ZONE sqlc.arg(tz)::text)::date = (now() AT TIME ZONE sqlc.arg(tz)::text)::date)::int AS attempts_today,
  COALESCE(avg(a.overall_score) FILTER (WHERE a.created_at > now() - interval '30 days'), 0)::real AS accuracy_30d,
  COALESCE(avg(a.fluency_score) FILTER (WHERE a.created_at > now() - interval '30 days'), 0)::real AS fluency_30d,
  count(*) FILTER (WHERE a.created_at > now() - interval '30 days')::int AS attempts_30d,
  COALESCE(avg(a.rubric_score) FILTER (
    WHERE a.created_at > now() - interval '30 days' AND a.task_type <> 'shadowing'
      AND a.rubric_version LIKE '2.%' AND a.rubric_score > 0), 0)::real AS band_30d,
  count(*) FILTER (
    WHERE a.created_at > now() - interval '30 days' AND a.task_type <> 'shadowing'
      AND a.rubric_version LIKE '2.%' AND a.rubric_score > 0)::int AS banded_30d
FROM pronunciation_attempts a
WHERE a.user_id = sqlc.arg(user_id);

-- name: ProgressActiveDays :many
-- Days with at least one attempt, newest first (for the streak).
SELECT DISTINCT (a.created_at AT TIME ZONE sqlc.arg(tz)::text)::date AS day
FROM pronunciation_attempts a
WHERE a.user_id = sqlc.arg(user_id)
ORDER BY day DESC
LIMIT 400;

-- name: ProgressWeekly :many
-- Monday-based weeks since sqlc.arg(since) (a local date).
SELECT
  date_trunc('week', a.created_at AT TIME ZONE sqlc.arg(tz)::text)::date AS week,
  count(*)::int AS attempts,
  avg(a.overall_score)::real AS accuracy,
  avg(a.fluency_score)::real AS fluency,
  COALESCE(avg(a.rubric_score) FILTER (
    WHERE a.task_type <> 'shadowing' AND a.rubric_version LIKE '2.%' AND a.rubric_score > 0), 0)::real AS band
FROM pronunciation_attempts a
WHERE a.user_id = sqlc.arg(user_id)
  AND (a.created_at AT TIME ZONE sqlc.arg(tz)::text)::date >= sqlc.arg(since)::date
GROUP BY 1
ORDER BY 1;

-- name: ProgressDaily :many
-- Local days since sqlc.arg(since) (a local date), for learners who started recently.
SELECT
  (a.created_at AT TIME ZONE sqlc.arg(tz)::text)::date AS day,
  count(*)::int AS attempts,
  avg(a.overall_score)::real AS accuracy,
  avg(a.fluency_score)::real AS fluency,
  COALESCE(avg(a.rubric_score) FILTER (
    WHERE a.task_type <> 'shadowing' AND a.rubric_version LIKE '2.%' AND a.rubric_score > 0), 0)::real AS band
FROM pronunciation_attempts a
WHERE a.user_id = sqlc.arg(user_id)
  AND (a.created_at AT TIME ZONE sqlc.arg(tz)::text)::date >= sqlc.arg(since)::date
GROUP BY 1
ORDER BY 1;

-- name: ProgressHardPhonemes :many
-- Lowest average Azure phoneme scores over the last 90 days (phonemes heard at least 3 times).
SELECT (p->>'phoneme')::text AS phoneme, avg((p->>'score')::real)::real AS score, count(*)::int AS samples
FROM pronunciation_attempts a, jsonb_array_elements(a.phoneme_scores) p
WHERE a.user_id = sqlc.arg(user_id) AND a.created_at > now() - interval '90 days'
  AND p ? 'phoneme' AND p ? 'score'
GROUP BY 1
HAVING count(*) >= 3
ORDER BY 2
LIMIT sqlc.arg(max_rows);

-- name: ProgressCriteria :many
-- Average band per IELTS criterion over the last 90 days (rubric v2). The LLM criteria are
-- in rubric.criteria; Pronunciation is in rubric.pronunciation.
SELECT c.id::text AS criterion, avg(c.band)::real AS band, count(*)::int AS samples
FROM pronunciation_attempts a,
LATERAL (
  SELECT x->>'id' AS id, (x->>'band')::real AS band FROM jsonb_array_elements(a.rubric->'criteria') x
  UNION ALL
  SELECT 'pronunciation', (a.rubric->'pronunciation'->>'band')::real
) c
WHERE a.user_id = sqlc.arg(user_id) AND a.created_at > now() - interval '90 days'
  AND a.rubric_version LIKE '2.%' AND c.band > 0
GROUP BY 1
ORDER BY 1;

-- name: ProgressByTask :many
SELECT a.task_type::text AS task_type, count(*)::int AS attempts,
  COALESCE(avg(a.rubric_score) FILTER (WHERE a.rubric_version LIKE '2.%' AND a.rubric_score > 0), 0)::real AS avg_band,
  COALESCE(max(a.rubric_score) FILTER (WHERE a.rubric_version LIKE '2.%'), 0)::real AS best_band
FROM pronunciation_attempts a
WHERE a.user_id = sqlc.arg(user_id)
GROUP BY 1
ORDER BY 1;

-- name: ProgressGraders :many
-- Which LLM scored the learner's IELTS attempts (models read the rubric a little differently).
SELECT COALESCE(a.grader_provider, '')::text AS provider, COALESCE(a.grader_model, '')::text AS model, count(*)::int AS attempts
FROM pronunciation_attempts a
WHERE a.user_id = sqlc.arg(user_id) AND a.task_type <> 'shadowing'
GROUP BY 1, 2
ORDER BY 3 DESC;

-- name: ProgressSpeakingSecondsToday :one
-- Speaking time today: for each attempt, the end of the last word Azure heard.
SELECT (COALESCE(sum(s.ms), 0) / 1000)::int AS seconds
FROM pronunciation_attempts a,
LATERAL (
  SELECT max((w->>'offsetMs')::bigint + (w->>'durationMs')::bigint) AS ms
  FROM jsonb_array_elements(a.word_scores) w
  WHERE w ? 'offsetMs' AND w ? 'durationMs'
) s
WHERE a.user_id = sqlc.arg(user_id)
  AND (a.created_at AT TIME ZONE sqlc.arg(tz)::text)::date = (now() AT TIME ZONE sqlc.arg(tz)::text)::date;

-- name: ProgressWeakWords :many
-- Words the learner said wrongly in the last 30 days (Azure marked them mispronounced or
-- scored them under 60), most frequent first.
SELECT lower(w->>'word')::text AS word, avg((w->>'accuracyScore')::real)::real AS score, count(*)::int AS times
FROM pronunciation_attempts a, jsonb_array_elements(a.word_scores) w
WHERE a.user_id = sqlc.arg(user_id) AND a.created_at > now() - interval '30 days'
  AND w->>'errorType' IN ('none', 'mispronunciation')
  AND (w->>'errorType' = 'mispronunciation' OR (w->>'accuracyScore')::real < 60)
GROUP BY 1
ORDER BY 3 DESC, 2
LIMIT sqlc.arg(max_rows);
