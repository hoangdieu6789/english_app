-- Vocabulary games (internal/service/game_service.go).

-- name: GameDeckMine :many
-- The learner's own words that have a meaning in lang: vocab cards and words said wrongly that
-- are in the word list (by headword). Words answered wrongly in games come first, then the
-- cards due soonest.
SELECT v.id, v.word, v.band, v.rank, v.pos, v.ipa, v.example_en, t.meaning, t.example_translation,
       (s.last_wrong_at IS NOT NULL AND s.last_wrong_at > COALESCE(r.last_reviewed_at, 'epoch'))::bool AS missed
FROM review_words r
JOIN vocab_words v ON v.id = r.vocab_word_id OR (r.vocab_word_id IS NULL AND v.word = r.word)
JOIN vocab_translations t ON t.vocab_word_id = v.id AND t.lang = sqlc.arg(lang)::text
LEFT JOIN game_word_stats s ON s.user_id = r.user_id AND s.vocab_word_id = v.id
WHERE r.user_id = sqlc.arg(user_id) AND v.enriched_at IS NOT NULL
ORDER BY missed DESC, r.due_at
LIMIT sqlc.arg(max_rows);

-- name: GameDeckBand :many
-- Words of a band range with a meaning in lang, in a random order (most frequent half first).
SELECT v.id, v.word, v.band, v.rank, v.pos, v.ipa, v.example_en, t.meaning, t.example_translation
FROM vocab_words v
JOIN vocab_translations t ON t.vocab_word_id = v.id AND t.lang = sqlc.arg(lang)::text
WHERE v.band >= sqlc.arg(band_from)::real AND v.band < sqlc.arg(band_to)::real AND v.enriched_at IS NOT NULL
ORDER BY random()
LIMIT sqlc.arg(max_rows);

-- name: GameUnenrichedInBand :many
-- Words of a band range without details or a meaning in lang (enriched on demand).
SELECT v.* FROM vocab_words v
WHERE v.band >= sqlc.arg(band_from)::real AND v.band < sqlc.arg(band_to)::real
  AND (v.enriched_at IS NULL OR NOT EXISTS (
    SELECT 1 FROM vocab_translations t WHERE t.vocab_word_id = v.id AND t.lang = sqlc.arg(lang)::text))
ORDER BY v.rank
LIMIT sqlc.arg(max_rows);

-- name: GameCountReady :one
-- Words of a band range that are ready for games in lang.
SELECT count(*)::int FROM vocab_words v
JOIN vocab_translations t ON t.vocab_word_id = v.id AND t.lang = sqlc.arg(lang)::text
WHERE v.band >= sqlc.arg(band_from)::real AND v.band < sqlc.arg(band_to)::real AND v.enriched_at IS NOT NULL;

-- name: GameVocabOrder :many
-- Every headword in level order (band, then rank): 60 equal slices are the 60 levels.
SELECT id, band FROM vocab_words ORDER BY band, rank, word;

-- name: GameWordsByID :many
SELECT v.id, v.word, v.band, v.rank, v.pos, v.ipa, v.example_en, t.meaning, t.example_translation
FROM vocab_words v
JOIN vocab_translations t ON t.vocab_word_id = v.id AND t.lang = sqlc.arg(lang)::text
WHERE v.id = ANY(sqlc.arg(ids)::uuid[]) AND v.enriched_at IS NOT NULL;

-- name: GameUnenrichedByID :many
SELECT v.* FROM vocab_words v
WHERE v.id = ANY(sqlc.arg(ids)::uuid[])
  AND (v.enriched_at IS NULL OR NOT EXISTS (
    SELECT 1 FROM vocab_translations t WHERE t.vocab_word_id = v.id AND t.lang = sqlc.arg(lang)::text));

-- name: InsertGamePlay :exec
INSERT INTO game_plays (user_id, game, deck, score, correct, total, duration_ms, level)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: UpsertGameWordStat :exec
INSERT INTO game_word_stats (user_id, vocab_word_id, seen, correct, last_wrong_at, last_seen_at)
VALUES (sqlc.arg(user_id), sqlc.arg(vocab_word_id), 1, sqlc.arg(correct)::int,
        CASE WHEN sqlc.arg(correct)::int = 0 THEN now() END, now())
ON CONFLICT (user_id, vocab_word_id) DO UPDATE
SET seen = game_word_stats.seen + 1,
    correct = game_word_stats.correct + EXCLUDED.correct,
    last_wrong_at = COALESCE(EXCLUDED.last_wrong_at, game_word_stats.last_wrong_at),
    last_seen_at = now();

-- name: MakeReviewCardsDue :exec
-- A review card answered wrongly in a game comes back in the review now.
UPDATE review_words r SET due_at = now()
FROM vocab_words v
WHERE r.user_id = sqlc.arg(user_id) AND v.id = ANY(sqlc.arg(ids)::uuid[])
  AND (r.vocab_word_id = v.id OR (r.vocab_word_id IS NULL AND r.word = v.word))
  AND r.due_at > now();

-- name: GameBests :many
-- Best score and number of plays per game.
SELECT game, max(score)::int AS best, count(*)::int AS plays, max(created_at)::timestamptz AS last_played
FROM game_plays WHERE user_id = $1 GROUP BY game;

-- name: GetVocabLevel :one
SELECT vocab_level FROM users WHERE id = $1;

-- name: SetVocabLevel :exec
UPDATE users SET vocab_level = $2 WHERE id = $1;

-- name: GameLangsInUse :many
-- Languages of the learners, for the background word backfill.
SELECT DISTINCT lang FROM users WHERE lang <> '';

-- name: GameNextUnenriched :many
-- The next words without details or a meaning in lang (background backfill), easy first.
SELECT v.* FROM vocab_words v
WHERE (v.enriched_at IS NULL OR NOT EXISTS (
  SELECT 1 FROM vocab_translations t WHERE t.vocab_word_id = v.id AND t.lang = sqlc.arg(lang)::text))
  AND NOT v.id = ANY(sqlc.arg(skip)::uuid[])
ORDER BY v.band, v.rank
LIMIT sqlc.arg(max_rows);
