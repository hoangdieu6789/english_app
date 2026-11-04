-- Model answers for IELTS questions at a band, written by the LLM once and shared by every
-- learner (key: hash of task type + question, band, language of the notes).
CREATE TABLE sample_answers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_hash TEXT NOT NULL,
  task_type     TEXT NOT NULL,
  question      TEXT NOT NULL,
  band          REAL NOT NULL,
  lang          TEXT NOT NULL CHECK (lang IN ('vi', 'en')),
  content       JSONB NOT NULL, -- {answer, phrases: [{phrase, meaning}], tips: []}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_hash, band, lang)
);

-- The learner's answer rewritten at a higher band by the LLM (on request), kept with the
-- attempt: {band, lang, improved, changes: [{original, improved, reason}]}.
ALTER TABLE pronunciation_attempts ADD COLUMN improved_answer JSONB;

-- Language of the AI feedback (summary, issue explanations, coach notes): the learner's
-- setting, and the language each attempt was graded in (so a resumed grading keeps it).
ALTER TABLE users ADD COLUMN feedback_lang TEXT NOT NULL DEFAULT 'vi' CHECK (feedback_lang IN ('vi', 'en'));
ALTER TABLE pronunciation_attempts ADD COLUMN feedback_lang TEXT CHECK (feedback_lang IN ('vi', 'en'));
