ALTER TABLE practice_sentences DROP COLUMN IF EXISTS gloss_lang;

ALTER TABLE vocab_words ADD COLUMN meaning_vi TEXT, ADD COLUMN example_vi TEXT;
UPDATE vocab_words v SET meaning_vi = t.meaning, example_vi = t.example_translation
FROM vocab_translations t WHERE t.vocab_word_id = v.id AND t.lang = 'vi';
DROP TABLE IF EXISTS vocab_translations;

DELETE FROM sample_answers WHERE lang NOT IN ('vi', 'en');
UPDATE pronunciation_attempts SET feedback_lang = NULL WHERE feedback_lang NOT IN ('vi', 'en');
UPDATE users SET lang = 'vi' WHERE lang NOT IN ('vi', 'en');
ALTER TABLE sample_answers ADD CONSTRAINT sample_answers_lang_check CHECK (lang IN ('vi', 'en'));
ALTER TABLE pronunciation_attempts ADD CONSTRAINT pronunciation_attempts_feedback_lang_check CHECK (feedback_lang IN ('vi', 'en'));
ALTER TABLE users RENAME COLUMN lang TO feedback_lang;
ALTER TABLE users ADD CONSTRAINT users_feedback_lang_check CHECK (feedback_lang IN ('vi', 'en'));
