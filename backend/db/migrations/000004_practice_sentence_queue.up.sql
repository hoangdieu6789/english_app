-- Practice sentences are generated in batches (one LLM call per batch, to stay inside the
-- free OpenRouter quota) and queued. served_at is NULL while a sentence waits in the queue.
ALTER TABLE practice_sentences ADD COLUMN served_at TIMESTAMPTZ;

-- Every sentence created before this migration was shown to the learner right away.
UPDATE practice_sentences SET served_at = created_at;

CREATE INDEX idx_practice_sentences_queue ON practice_sentences(user_id, created_at) WHERE served_at IS NULL;
