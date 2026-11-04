-- Shown cards: every vocab card; a pronunciation word only once it was said wrongly in at
-- least 2 attempts or scored under 40 (migration 000013).

-- name: UpsertReviewWord :exec
-- A word said wrongly (again): one more miss, due now, schedule restarted.
INSERT INTO review_words (user_id, word, last_score, min_score, kind)
VALUES ($1, $2, $3, $3, 'pronunciation')
ON CONFLICT (user_id, kind, word) DO UPDATE
SET last_score = EXCLUDED.last_score,
    min_score = LEAST(review_words.min_score, EXCLUDED.min_score),
    misses = review_words.misses + 1,
    interval_days = 0,
    reps = 0,
    lapses = review_words.lapses + CASE WHEN review_words.reps > 0 THEN 1 ELSE 0 END,
    due_at = LEAST(review_words.due_at, now());

-- name: ListDueReviewWords :many
SELECT r.*, v.pos, v.ipa, v.meaning_vi, v.example_en, v.example_vi, v.band
FROM review_words r LEFT JOIN vocab_words v ON v.id = r.vocab_word_id
WHERE r.user_id = $1 AND r.due_at <= now()
  AND (r.kind = 'vocab' OR r.misses >= 2 OR r.min_score < 40)
ORDER BY r.due_at, r.word
LIMIT $2;

-- name: ListUpcomingReviewWords :many
SELECT r.*, v.pos, v.ipa, v.meaning_vi, v.example_en, v.example_vi, v.band
FROM review_words r LEFT JOIN vocab_words v ON v.id = r.vocab_word_id
WHERE r.user_id = $1 AND r.due_at > now()
  AND (r.kind = 'vocab' OR r.misses >= 2 OR r.min_score < 40)
ORDER BY r.due_at, r.word
LIMIT $2;

-- name: CountReviewWords :one
SELECT count(*) FILTER (WHERE due_at <= now())::int AS due,
       count(*)::int AS total
FROM review_words
WHERE user_id = $1 AND (kind = 'vocab' OR misses >= 2 OR min_score < 40);

-- name: GetReviewWord :one
SELECT r.*, v.pos, v.ipa, v.meaning_vi, v.example_en, v.example_vi, v.band
FROM review_words r LEFT JOIN vocab_words v ON v.id = r.vocab_word_id
WHERE r.id = $1 AND r.user_id = $2;

-- name: UpdateReviewWordSchedule :exec
UPDATE review_words
SET last_score = $2, ease = $3, interval_days = $4, reps = $5, lapses = $6, due_at = $7,
    last_reviewed_at = now()
WHERE id = $1;

-- name: DeleteReviewWord :execrows
DELETE FROM review_words WHERE id = $1 AND user_id = $2;

-- name: ListPronunciationReviewWords :many
-- All learners' pronunciation words (start-up clean-up of misrecognised words).
SELECT id, word FROM review_words WHERE kind = 'pronunciation';

-- name: DeleteReviewWordsByID :exec
DELETE FROM review_words WHERE id = ANY(sqlc.arg(ids)::uuid[]);

-- name: SeedVocabWords :exec
-- Inserts or updates the NGSL/NAWL list (keeps the LLM-written fields).
INSERT INTO vocab_words (word, source, rank, band)
SELECT unnest(sqlc.arg(words)::text[]), unnest(sqlc.arg(sources)::text[]), unnest(sqlc.arg(ranks)::int[]), unnest(sqlc.arg(bands)::real[])
ON CONFLICT (word) DO UPDATE
SET source = EXCLUDED.source, rank = EXCLUDED.rank, band = EXCLUDED.band
WHERE (vocab_words.source, vocab_words.rank, vocab_words.band) IS DISTINCT FROM (EXCLUDED.source, EXCLUDED.rank, EXCLUDED.band);

-- name: PickNewVocabWords :many
-- The next words for a learner: band in (band_from, band_to], not yet in their review list
-- and not words they already use, easiest band first, most frequent first.
SELECT v.* FROM vocab_words v
WHERE v.band > sqlc.arg(band_from)::real AND v.band <= sqlc.arg(band_to)::real
  AND NOT v.word = ANY(sqlc.arg(known)::text[])
  AND NOT EXISTS (
    SELECT 1 FROM review_words r
    WHERE r.user_id = sqlc.arg(user_id) AND r.kind = 'vocab' AND r.vocab_word_id = v.id)
ORDER BY v.band, v.rank
LIMIT sqlc.arg(max_rows);

-- name: CountNewVocabWords :one
SELECT count(*)::int FROM vocab_words v
WHERE v.band > sqlc.arg(band_from)::real AND v.band <= sqlc.arg(band_to)::real
  AND NOT v.word = ANY(sqlc.arg(known)::text[])
  AND NOT EXISTS (
    SELECT 1 FROM review_words r
    WHERE r.user_id = sqlc.arg(user_id) AND r.kind = 'vocab' AND r.vocab_word_id = v.id);

-- name: UpdateVocabEnrichment :exec
UPDATE vocab_words
SET pos = $2, ipa = $3, meaning_vi = $4, example_en = $5, example_vi = $6, enriched_at = now()
WHERE id = $1;

-- name: AddVocabReviewWord :exec
INSERT INTO review_words (user_id, word, last_score, min_score, kind, vocab_word_id, misses)
VALUES ($1, $2, 0, 100, 'vocab', $3, 0)
ON CONFLICT (user_id, kind, word) DO NOTHING;

-- name: ListUserSpokenWords :many
-- Words the learner said well in their own free speech (IELTS parts): known words.
SELECT DISTINCT lower(w->>'word')::text AS word
FROM pronunciation_attempts a, jsonb_array_elements(a.word_scores) w
WHERE a.user_id = $1 AND a.task_type <> 'shadowing'
  AND w->>'errorType' = 'none' AND (w->>'accuracyScore')::real >= 60;

-- name: MeasuredBand :one
-- Average overall IELTS band of the last 90 days (rubric v2); 0 when none.
SELECT COALESCE(avg(rubric_score), 0)::real FROM pronunciation_attempts
WHERE user_id = $1 AND task_type <> 'shadowing' AND rubric_score IS NOT NULL
  AND rubric_version LIKE '2.%' AND created_at > now() - interval '90 days';

-- name: UpdateUserGoals :exec
UPDATE users SET self_band = $2, target_band = $3 WHERE id = $1;
