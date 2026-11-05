-- LISTEN-001: listening lessons, dictation and the word notebook.

-- A listening lesson: an AI podcast / conversation / story (Azure TTS audio), a VOA Learning
-- English story (public domain) or the learner's own audio. segments holds the transcript as
-- lines {speaker, text, start, end}; start/end are seconds in the audio, or null when unknown
-- (pasted transcripts: dictation then reads the line with TTS).
CREATE TABLE lessons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = shared library
  source       TEXT NOT NULL CHECK (source IN ('ai', 'voa', 'mine')),
  kind         TEXT NOT NULL CHECK (kind IN ('podcast', 'conversation', 'story', 'news', 'other')),
  title        TEXT NOT NULL,
  topic        TEXT NOT NULL DEFAULT '',
  band         REAL NOT NULL DEFAULT 0,
  segments     JSONB NOT NULL DEFAULT '[]',
  speakers     JSONB NOT NULL DEFAULT '[]', -- [{name, voice}]
  phrases      JSONB NOT NULL DEFAULT '[]', -- useful words and phrases of the lesson (AI)
  audio_path   TEXT NOT NULL DEFAULT '',    -- file under the audio storage (AI, uploads)
  audio_url    TEXT NOT NULL DEFAULT '',    -- external audio link (played from the source)
  video_url    TEXT NOT NULL DEFAULT '',    -- YouTube link (embedded player)
  duration_sec REAL NOT NULL DEFAULT 0,
  source_url   TEXT NOT NULL DEFAULT '',
  credit       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'ready', 'failed')),
  error        TEXT NOT NULL DEFAULT '',
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lessons_source ON lessons(source, created_at DESC);
CREATE INDEX idx_lessons_owner ON lessons(owner_id) WHERE owner_id IS NOT NULL;

CREATE TABLE lesson_progress (
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id      UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position_sec   REAL NOT NULL DEFAULT 0,
  listened_at    TIMESTAMPTZ,
  dictation_best REAL,          -- best accuracy of a full dictation run (0-100)
  lines_done     INT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE dictation_attempts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id  UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  segment    INT NOT NULL,
  typed      TEXT NOT NULL,
  accuracy   REAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dictation_user ON dictation_attempts(user_id, created_at DESC);

-- A third kind of review card: a word or phrase the learner saved (from a lesson or typed in).
ALTER TABLE review_words DROP CONSTRAINT IF EXISTS review_words_kind_check;
ALTER TABLE review_words ADD CONSTRAINT review_words_kind_check CHECK (kind IN ('pronunciation', 'vocab', 'saved'));

-- The notebook details of a saved card (the other kinds take them from vocab_words). The
-- meaning is in the learner's language when saved; example_en is the LLM's example until a
-- sentence of the learner's passes the grading (example_mine).
CREATE TABLE notebook_entries (
  review_word_id UUID PRIMARY KEY REFERENCES review_words(id) ON DELETE CASCADE,
  lang           TEXT NOT NULL,
  pos            TEXT NOT NULL DEFAULT '',
  ipa            TEXT NOT NULL DEFAULT '',
  meaning        TEXT NOT NULL DEFAULT '',
  example_en     TEXT NOT NULL DEFAULT '',
  example_mine   BOOLEAN NOT NULL DEFAULT false,
  example_score  REAL,
  context        TEXT NOT NULL DEFAULT '', -- the line it was saved from
  lesson_id      UUID REFERENCES lessons(id) ON DELETE SET NULL,
  band           REAL NOT NULL DEFAULT 0
);

-- The learner's own sentences for a card, graded by the LLM (0-10) and optionally read aloud
-- (Azure pronunciation score 0-100).
CREATE TABLE notebook_sentences (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_word_id UUID NOT NULL REFERENCES review_words(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text           TEXT NOT NULL,
  score          REAL NOT NULL,
  verdict        JSONB NOT NULL DEFAULT '{}',
  accepted       BOOLEAN NOT NULL DEFAULT false,
  pron_score     REAL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notebook_sentences_word ON notebook_sentences(review_word_id, created_at DESC);
