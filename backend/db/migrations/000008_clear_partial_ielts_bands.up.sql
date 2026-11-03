-- An IELTS attempt with criteria not assessed (e.g. a too-short answer: only Pronunciation)
-- got a "provisional" overall band averaged over what was left. That is not an IELTS band and
-- it skewed the progress averages, so it is no longer stored (see hasOverallBand). The full
-- result stays in the rubric column.
UPDATE pronunciation_attempts
SET rubric_score = NULL, cefr_level = NULL
WHERE task_type <> 'shadowing'
  AND rubric_version LIKE '2.%'
  AND (rubric->'overall'->>'provisional')::boolean IS TRUE;
