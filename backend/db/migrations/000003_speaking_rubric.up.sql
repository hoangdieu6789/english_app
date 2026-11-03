-- Speaking rubric (backend/internal/rubric): extra Azure scores, the raw Azure response
-- (to re-score later) and the rubric result.
ALTER TABLE pronunciation_attempts
  ADD COLUMN task_type TEXT NOT NULL DEFAULT 'shadowing',
  ADD COLUMN completeness_score REAL,
  ADD COLUMN prosody_score REAL,
  ADD COLUMN pron_score REAL,
  ADD COLUMN azure_result JSONB,
  ADD COLUMN rubric JSONB,
  ADD COLUMN rubric_score REAL,
  ADD COLUMN cefr_level TEXT,
  ADD COLUMN rubric_version TEXT;
