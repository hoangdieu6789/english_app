ALTER TABLE pronunciation_attempts
  DROP COLUMN IF EXISTS grader_model,
  DROP COLUMN IF EXISTS grader_provider;
