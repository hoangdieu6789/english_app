-- The word notebook (LISTEN-001): saved words and phrases, with the learner's sentences.

-- name: UpsertSavedWord :one
-- Saves a word or phrase (kind saved). Saving it again keeps the schedule and makes it due.
INSERT INTO review_words (user_id, word, last_score, min_score, kind)
VALUES (sqlc.arg(user_id), sqlc.arg(word), 0, 0, 'saved')
ON CONFLICT (user_id, kind, word) DO UPDATE SET due_at = LEAST(review_words.due_at, now())
RETURNING id;

-- name: UpsertNotebookEntry :exec
INSERT INTO notebook_entries (review_word_id, lang, pos, ipa, meaning, example_en, context, lesson_id, band)
VALUES (sqlc.arg(review_word_id), sqlc.arg(lang), sqlc.arg(pos), sqlc.arg(ipa), sqlc.arg(meaning),
        sqlc.arg(example_en), sqlc.arg(context), sqlc.narg(lesson_id), sqlc.arg(band))
ON CONFLICT (review_word_id) DO UPDATE
SET lang = EXCLUDED.lang, pos = EXCLUDED.pos, ipa = EXCLUDED.ipa, meaning = EXCLUDED.meaning,
    example_en = CASE WHEN notebook_entries.example_mine THEN notebook_entries.example_en ELSE EXCLUDED.example_en END,
    context = CASE WHEN EXCLUDED.context <> '' THEN EXCLUDED.context ELSE notebook_entries.context END,
    lesson_id = COALESCE(EXCLUDED.lesson_id, notebook_entries.lesson_id),
    band = EXCLUDED.band;

-- name: ListNotebook :many
-- Every card of the learner with its details: saved cards from notebook_entries, vocab and
-- pronunciation cards from the word list (meaning in lang).
SELECT r.id, r.word, r.kind, r.misses, r.last_score, r.interval_days, r.reps, r.due_at, r.created_at,
       COALESCE(NULLIF(n.pos, ''), v.pos, '')::text AS pos,
       COALESCE(NULLIF(n.ipa, ''), v.ipa, '')::text AS ipa,
       COALESCE(NULLIF(n.meaning, ''), t.meaning, '')::text AS meaning,
       COALESCE(NULLIF(n.example_en, ''), v.example_en, '')::text AS example_en,
       COALESCE(n.example_mine, false)::bool AS example_mine,
       n.example_score,
       COALESCE(n.context, '')::text AS context,
       n.lesson_id,
       COALESCE(l.title, '')::text AS lesson_title,
       COALESCE(NULLIF(n.band, 0), v.band, 0)::real AS band
FROM review_words r
LEFT JOIN notebook_entries n ON n.review_word_id = r.id
LEFT JOIN vocab_words v ON v.id = r.vocab_word_id OR (r.vocab_word_id IS NULL AND v.word = r.word)
LEFT JOIN vocab_translations t ON t.vocab_word_id = v.id AND t.lang = sqlc.arg(lang)::text
LEFT JOIN lessons l ON l.id = n.lesson_id
WHERE r.user_id = sqlc.arg(user_id)
  AND (r.kind <> 'pronunciation' OR r.misses >= 2 OR r.min_score < 40)
ORDER BY r.created_at DESC
LIMIT sqlc.arg(max_rows);

-- name: GetNotebookEntry :one
SELECT r.id, r.word, r.kind, COALESCE(n.meaning, '')::text AS meaning,
       COALESCE(n.example_en, '')::text AS example_en, COALESCE(n.example_mine, false)::bool AS example_mine,
       COALESCE(n.lang, '')::text AS lang
FROM review_words r LEFT JOIN notebook_entries n ON n.review_word_id = r.id
WHERE r.id = sqlc.arg(id) AND r.user_id = sqlc.arg(user_id);

-- name: SetMyExample :exec
-- A sentence of the learner's passed the grading: it becomes the card's example. Cards of the
-- other kinds get a notebook entry for it.
INSERT INTO notebook_entries (review_word_id, lang, example_en, example_mine, example_score)
VALUES (sqlc.arg(review_word_id), sqlc.arg(lang), sqlc.arg(example_en), true, sqlc.arg(score))
ON CONFLICT (review_word_id) DO UPDATE
SET example_en = EXCLUDED.example_en, example_mine = true, example_score = EXCLUDED.example_score;

-- name: AddNotebookSentence :one
INSERT INTO notebook_sentences (review_word_id, user_id, text, score, verdict, accepted)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListNotebookSentences :many
SELECT * FROM notebook_sentences
WHERE review_word_id = sqlc.arg(review_word_id) AND user_id = sqlc.arg(user_id)
ORDER BY created_at DESC
LIMIT 20;

-- name: GetNotebookSentence :one
SELECT * FROM notebook_sentences WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id);

-- name: SetSentencePronScore :exec
UPDATE notebook_sentences SET pron_score = $2 WHERE id = $1;
