DELETE FROM review_words WHERE kind = 'vocab';
ALTER TABLE review_words DROP CONSTRAINT IF EXISTS review_words_user_kind_word_key;
ALTER TABLE review_words ADD CONSTRAINT review_words_user_id_word_key UNIQUE (user_id, word);
ALTER TABLE review_words DROP COLUMN IF EXISTS min_score, DROP COLUMN IF EXISTS misses,
  DROP COLUMN IF EXISTS vocab_word_id, DROP COLUMN IF EXISTS kind;
DROP TABLE IF EXISTS vocab_words;
ALTER TABLE users DROP COLUMN IF EXISTS target_band, DROP COLUMN IF EXISTS self_band;
