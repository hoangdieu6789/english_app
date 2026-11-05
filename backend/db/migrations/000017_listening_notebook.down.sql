DROP TABLE IF EXISTS notebook_sentences;
DROP TABLE IF EXISTS notebook_entries;
DELETE FROM review_words WHERE kind = 'saved';
ALTER TABLE review_words DROP CONSTRAINT IF EXISTS review_words_kind_check;
ALTER TABLE review_words ADD CONSTRAINT review_words_kind_check CHECK (kind IN ('pronunciation', 'vocab'));
DROP TABLE IF EXISTS dictation_attempts;
DROP TABLE IF EXISTS lesson_progress;
DROP TABLE IF EXISTS lessons;
