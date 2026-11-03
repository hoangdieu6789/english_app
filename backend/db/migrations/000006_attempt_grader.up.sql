-- Which LLM provider and model scored the transcript criteria (FC, LR, GRA) of an attempt.
-- Models read the same rubric a little differently, so this is needed to compare attempts
-- and to calibrate later. NULL when no LLM was used (shadowing, LLM failure, old attempts).
ALTER TABLE pronunciation_attempts
  ADD COLUMN grader_provider TEXT,
  ADD COLUMN grader_model TEXT;
