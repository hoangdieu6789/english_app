ALTER TABLE pronunciation_attempts
  DROP COLUMN IF EXISTS rubric_version,
  DROP COLUMN IF EXISTS cefr_level,
  DROP COLUMN IF EXISTS rubric_score,
  DROP COLUMN IF EXISTS rubric,
  DROP COLUMN IF EXISTS azure_result,
  DROP COLUMN IF EXISTS pron_score,
  DROP COLUMN IF EXISTS prosody_score,
  DROP COLUMN IF EXISTS completeness_score,
  DROP COLUMN IF EXISTS task_type;
