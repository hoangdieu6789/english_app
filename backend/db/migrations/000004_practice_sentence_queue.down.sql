DROP INDEX IF EXISTS idx_practice_sentences_queue;
ALTER TABLE practice_sentences DROP COLUMN IF EXISTS served_at;
