-- IELTS question sets, shared by all learners. A set is either a Part 1 topic (a few short
-- questions) or a Part 2 cue card with its linked Part 3 questions. Seed sets ship with the
-- app; new sets are written by a free LLM when a learner has done almost every set.
CREATE TABLE ielts_question_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('part1', 'cue_card')),
  topic TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',     -- cue card task ("Describe ..."); empty for part1
  points JSONB NOT NULL DEFAULT '[]',  -- cue card "You should say" points
  questions JSONB NOT NULL,            -- part1 questions, or the Part 3 questions of a cue card
  source TEXT NOT NULL DEFAULT 'seed' CHECK (source IN ('seed', 'generated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ielts_question_sets_topic ON ielts_question_sets(kind, lower(topic));

-- Which set (and which question) an attempt answered, so each learner can see what they
-- have done, redo it, or get a set they have not done yet.
ALTER TABLE pronunciation_attempts
  ADD COLUMN question_set_id UUID REFERENCES ielts_question_sets(id) ON DELETE SET NULL,
  ADD COLUMN task_prompt TEXT;

CREATE INDEX idx_pronunciation_attempts_question_set
  ON pronunciation_attempts(user_id, question_set_id, task_type)
  WHERE question_set_id IS NOT NULL;
