DROP INDEX IF EXISTS idx_pronunciation_attempts_pending;
ALTER TABLE pronunciation_attempts DROP COLUMN IF EXISTS grading_status;
