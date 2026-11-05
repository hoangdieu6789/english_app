# LISTEN-001 Listening, dictation and the word notebook

Status: phase 1 in progress (branch `feat/listening-notebook`).

## Goal

Add listening to the app and keep the good words and phrases from it:

- **Passive listening:** podcasts, conversations and stories, with a transcript.
- **Active listening:** dictation. The learner hears a line and types it, then sees which words
  were right, wrong or missing.
- **Word notebook:** the learner saves a word or phrase from a lesson, or types it in. A card
  has the meaning, IPA, a pronunciation button and an example. The learner writes their own
  sentence with the word, and the LLM grades it. A sentence that passes replaces the example on
  the card. The learner can then read it aloud, and Azure scores the pronunciation.

## Sources (one tab each)

| Tab | Audio | Transcript | Licence |
|---|---|---|---|
| **AI** | Azure neural TTS. Each speaker has a different voice. | Written by the LLM (exact). | Ours. |
| **VOA** | The MP3 link of a VOA Learning English story. | Pasted by the learner. | Public domain (text and audio made by VOA only, not AP/Reuters). Credit "VOA Learning English". |
| **Mine** | An uploaded file, an audio link or a YouTube link (embedded player). | Pasted, optional. | The learner's own use; the app only plays from the source. |

- **AI lessons** come from a form: kind (podcast, conversation or story), topic and band
  (default: the learner's band).
  - The LLM writes a script for spoken English at that band, about 250-450 words.
  - Azure reads each line, using `audio-24khz-48kbitrate-mono-mp3`, and the line files are
    joined into one MP3.
  - The format has a constant bit rate, so the start and end time of each line come from its
    byte length. No extra timing service is needed.
  - Lessons are shared, so every learner can use the library.
  - Azure F0 allows 0.5M characters a month, which is about 200 lessons.
- **VOA and Mine** keep the transcript as lines with no timing. Dictation reads each line with
  Azure TTS (one cached MP3 per line).
- **VOA auto-import is not in phase 1.** On the dev machine the network resets TLS to
  `*.voanews.com`, so the importer cannot be tested.

## Data (migration 17)

- **`lessons`:**
  - `owner_id`: NULL for shared lessons.
  - `source`: ai, voa or mine.
  - `kind`, `title`, `topic`, `band`.
  - `segments` (jsonb): `{speaker, text, start, end}` per line.
  - `speakers`, `audio_path`, `audio_url`, `video_url`, `duration_sec`, `source_url`,
    `credit`, `status` (pending, ready or failed), `error`.
- **`lesson_progress`:** per learner and lesson: last listened time, position, best dictation
  accuracy, lines done.
- **`dictation_attempts`:** one row per line typed (`typed`, `accuracy`).
- **`review_words`** gets a third kind, `saved`, for a word or phrase the learner saved.
  - Its details are on the card: `meaning`, `ipa`, `pos`, `example_en`, `example_mine`,
    `example_score`, `context` (the line it came from), `lesson_id`, `note`.
  - The other kinds keep using `vocab_words`.
- **`notebook_sentences`:** the learner's sentences for a card: `text`, `score`, `verdict`
  (jsonb), `accepted`, `pron_score`.

## API

- `GET /api/lessons?source=ai|voa|mine`: the library and the learner's progress.
- `POST /api/lessons/generate`: an AI lesson, created as pending and made in the background.
  `GET /api/lessons/:id` then polls the status.
- `POST /api/lessons`: a VOA or Mine lesson. JSON, or multipart with an audio file.
- `DELETE /api/lessons/:id`: the learner's own lessons only.
- `POST /api/lessons/:id/progress` and `POST /api/lessons/:id/dictation`.
- `GET /api/tts?text=...`: Azure TTS, cached on disk by a hash of voice and text, up to 300
  characters. Used for words, examples and dictation lines.
- `GET /api/notebook`, `POST /api/notebook`, `DELETE /api/notebook/:id`.
  - `POST /api/notebook` takes `{text, context, lessonId}`. The LLM looks up the meaning in the
    learner's language, the IPA, the part of speech and a simple example.
- `POST /api/notebook/:id/sentences`: the LLM grades the learner's sentence (0-10).
  - It checks that the sentence uses the target with the right meaning, that the grammar is
    right and that it sounds natural.
  - It gives a correction and feedback in the learner's language.
  - A score of 7 or more replaces the example on the card.
- `POST /api/notebook/sentences/:id/speak` (WAV): Azure scores the learner reading their
  sentence.

## Review and games

- Saved cards are scheduled like vocab cards. The learner rates how well they remembered.
- **Review page:**
  - The **Review** nav item becomes **Notebook** (`/review`).
  - Tabs: *Due today* (the SRS queue, unchanged) and *All words* (with a filter by source).
- **Games:** the *My words* deck also takes saved cards that have a meaning.

## Frontend

- **`/listen`:**
  - Tabs AI, VOA and Mine, with lesson cards (title, kind, band, length, progress).
  - The AI tab has the "New lesson" form. The VOA and Mine tabs have the "Add a lesson" form.
- **`/listen/[id]`:**
  - *Listen:* player with speed 0.75, 1 or 1.25, and a transcript that can be hidden.
    - The current line is lit. Tap a line to jump to it.
    - Select words to "Save to notebook", with the line as context.
  - *Dictation:* play the line (replay, slow), type it, check it, and see the word diff and
    accuracy. A summary comes at the end.
- **Word diff** (`lib/dictation.ts`): compares words with LCS, ignoring case and punctuation.
  Unit tests cover it.

## Phases

1. **This branch:**
   - AI lessons, the player and transcript, dictation, VOA and Mine lessons by paste, upload or
     link, the notebook with sentence grading and read-aloud, and saved cards in review and
     games.
2. **Later:**
   - VOA import from a story URL (title, transcript and MP3).
   - Whisper timings for imported audio, so dictation can use the real voice.
   - Listening questions (comprehension).
   - Shadowing.
