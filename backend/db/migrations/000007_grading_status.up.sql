-- IELTS attempts are returned as soon as Azure and the Pronunciation band are ready; the LLM
-- scores FC/LR/GRA in the background. pending = LLM step running, done = final result,
-- failed = the LLM step never finished (the Pronunciation result is kept).
ALTER TABLE pronunciation_attempts
  ADD COLUMN grading_status TEXT NOT NULL DEFAULT 'done'
  CHECK (grading_status IN ('pending', 'done', 'failed'));

CREATE INDEX idx_pronunciation_attempts_pending ON pronunciation_attempts(created_at)
  WHERE grading_status = 'pending';
