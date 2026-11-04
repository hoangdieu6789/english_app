ALTER TABLE pronunciation_attempts DROP COLUMN IF EXISTS feedback_lang;
ALTER TABLE users DROP COLUMN IF EXISTS feedback_lang;
ALTER TABLE pronunciation_attempts DROP COLUMN IF EXISTS improved_answer;
DROP TABLE IF EXISTS sample_answers;
