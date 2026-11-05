-- Listening lessons, progress and dictation (LISTEN-001).

-- name: CreateLesson :one
INSERT INTO lessons (owner_id, source, kind, title, topic, band, segments, speakers, audio_path,
                     audio_url, video_url, duration_sec, source_url, credit, status, created_by)
VALUES (sqlc.narg(owner_id), sqlc.arg(source), sqlc.arg(kind), sqlc.arg(title), sqlc.arg(topic),
        sqlc.arg(band), sqlc.arg(segments), sqlc.arg(speakers), sqlc.arg(audio_path),
        sqlc.arg(audio_url), sqlc.arg(video_url), sqlc.arg(duration_sec), sqlc.arg(source_url),
        sqlc.arg(credit), sqlc.arg(status), sqlc.narg(created_by))
RETURNING *;

-- name: FinishLesson :exec
-- An AI lesson made in the background: ready with its script and audio, or failed.
UPDATE lessons
SET title = sqlc.arg(title), segments = sqlc.arg(segments), speakers = sqlc.arg(speakers),
    phrases = sqlc.arg(phrases),
    audio_path = sqlc.arg(audio_path), duration_sec = sqlc.arg(duration_sec),
    status = sqlc.arg(status), error = sqlc.arg(error)
WHERE id = sqlc.arg(id);

-- name: GetLesson :one
-- A lesson the learner may open: shared, or their own.
SELECT * FROM lessons
WHERE id = sqlc.arg(id) AND (owner_id IS NULL OR owner_id = sqlc.arg(user_id));

-- name: ListLessons :many
-- The library of one source: shared lessons and the learner's own, newest first; pending and
-- failed AI lessons only for the learner who asked for them.
SELECT l.id, l.owner_id, l.source, l.kind, l.title, l.topic, l.band, l.duration_sec, l.status,
       l.error, l.credit, l.created_by, l.created_at,
       jsonb_array_length(l.segments)::int AS lines,
       p.listened_at, p.dictation_best, p.lines_done
FROM lessons l
LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = sqlc.arg(user_id)
WHERE l.source = sqlc.arg(source)
  AND (l.owner_id IS NULL OR l.owner_id = sqlc.arg(user_id))
  AND (l.status = 'ready' OR l.created_by = sqlc.arg(user_id))
ORDER BY l.created_at DESC
LIMIT sqlc.arg(max_rows);

-- name: DeleteLesson :one
-- Only the learner's own lessons (or a failed AI lesson they asked for).
DELETE FROM lessons
WHERE id = sqlc.arg(id)
  AND (owner_id = sqlc.arg(user_id) OR (created_by = sqlc.arg(user_id) AND status = 'failed'))
RETURNING audio_path;

-- name: PendingLessons :many
-- AI lessons left pending by a restart.
SELECT * FROM lessons WHERE status = 'pending' AND source = 'ai';

-- name: SaveLessonProgress :exec
INSERT INTO lesson_progress (user_id, lesson_id, position_sec, listened_at)
VALUES (sqlc.arg(user_id), sqlc.arg(lesson_id), sqlc.arg(position_sec), now())
ON CONFLICT (user_id, lesson_id) DO UPDATE
SET position_sec = EXCLUDED.position_sec, listened_at = now(), updated_at = now();

-- name: GetLessonProgress :one
SELECT * FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2;

-- name: AddDictationAttempt :exec
INSERT INTO dictation_attempts (user_id, lesson_id, segment, typed, accuracy)
VALUES ($1, $2, $3, $4, $5);

-- name: SaveDictationRun :exec
-- A finished dictation run: lines done and the best accuracy so far.
INSERT INTO lesson_progress (user_id, lesson_id, lines_done, dictation_best)
VALUES (sqlc.arg(user_id), sqlc.arg(lesson_id), sqlc.arg(lines_done), sqlc.arg(accuracy))
ON CONFLICT (user_id, lesson_id) DO UPDATE
SET lines_done = GREATEST(lesson_progress.lines_done, EXCLUDED.lines_done),
    dictation_best = GREATEST(COALESCE(lesson_progress.dictation_best, 0), EXCLUDED.dictation_best),
    updated_at = now();
