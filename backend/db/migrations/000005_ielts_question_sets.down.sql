DROP INDEX IF EXISTS idx_pronunciation_attempts_question_set;
ALTER TABLE pronunciation_attempts
  DROP COLUMN IF EXISTS task_prompt,
  DROP COLUMN IF EXISTS question_set_id;
DROP TABLE IF EXISTS ielts_question_sets;
