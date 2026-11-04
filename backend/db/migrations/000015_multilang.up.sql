-- One language setting for the whole app (UI, AI feedback, tips, model answers, vocabulary
-- meanings). Languages are checked in code (internal/i18n), so adding one needs no
-- migration: the vi/en CHECK constraints are dropped.
ALTER TABLE users RENAME COLUMN feedback_lang TO lang;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_feedback_lang_check;
ALTER TABLE pronunciation_attempts DROP CONSTRAINT IF EXISTS pronunciation_attempts_feedback_lang_check;
ALTER TABLE sample_answers DROP CONSTRAINT IF EXISTS sample_answers_lang_check;

-- Vocabulary meanings per language (the word's POS, IPA and English example stay in
-- vocab_words, shared by every language). For English the meaning is a simple English
-- definition and there is no example translation.
CREATE TABLE vocab_translations (
  vocab_word_id       UUID NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
  lang                TEXT NOT NULL,
  meaning             TEXT NOT NULL,
  example_translation TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (vocab_word_id, lang)
);
INSERT INTO vocab_translations (vocab_word_id, lang, meaning, example_translation)
SELECT id, 'vi', meaning_vi, COALESCE(example_vi, '') FROM vocab_words WHERE meaning_vi IS NOT NULL;
ALTER TABLE vocab_words DROP COLUMN meaning_vi, DROP COLUMN example_vi;

-- Language of a practice sentence's translation ('' gloss for English learners).
ALTER TABLE practice_sentences ADD COLUMN gloss_lang TEXT NOT NULL DEFAULT 'vi';
