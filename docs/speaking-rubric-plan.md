# Plan: IELTS speaking assessment — missing parts

What is still open after the switch to the IELTS rubric (rubric v2.0.0). When an item is done, tick it (`[x]`) and add the date and commit.

Rubric source: `~/WorkSpace/Document_english/speaking-rubric`. Copy in the app: `backend/internal/rubric/` (must be identical to the source).

## Done (v2.0.0)

- [x] Copy the IELTS rubric into `backend/internal/rubric/` (4 criteria, bands 0–9).
- [x] `SpeakingGrader`: the LLM scores FC/LR/GRA, code scores Pronunciation, code computes the overall band and CEFR.
- [x] `shadowing` scores Pronunciation only; the other 3 criteria are reported as `not_in_task`.
- [x] The API accepts `taskType` = `shadowing | part1 | part2 | part3 | full_test` and `taskPrompt`.
- [x] The rubric card shows bands /9, the 6 Pronunciation features and mispronounced words.
- [x] Go tests + live tests with Azure and OpenRouter (shadowing band 8, Part 3 band 5.5).
- [x] Commit the rubric work (rubric, backend, frontend, docs) — 2026-11-03, `ea29296`…`abb90f0`.

## To do

Order = suggested priority.

### 1. Long recordings for Part 2 and the full test — blocking

- [ ] Azure REST (short audio) accepts at most about 60 seconds. Part 2 is 1–2 minutes; the full test is longer.
  - Options: move to the Speech SDK / continuous recognition, or split the WAV into chunks and send each chunk.
  - The grader passes only **one** Azure JSON (`[][]byte{in.AzureRaw}`). It must pass several segments so that `speech_hints` (mid-sentence pauses) and P-04 (final rise/fall) stay correct.
  - Check the `WavRecorder` length limit in the frontend and `maxAudioUploadBytes` in the handler.
  - Done when: a 2-minute answer is scored on all 4 criteria.

### 2. UI for the IELTS parts

- [x] The practice page offers Shadowing / IELTS Part 1 / Part 2 / Part 3 (`frontend/components/ielts-practice.tsx`) — 2026-11-03, `4f963d1`.
- [x] Question source: a bank written for the app (now in the database, see 2b). Picking a question needs no LLM call.
- [x] Part 2: 1-minute preparation (countdown, notes, can start early).
- [x] The page sends `taskType` and `taskPrompt`. Part 2 sends the cue card with its points.
- [x] "Grading… Ns" state (measured: ~15 s for a Part 3 answer through the UI).
- [x] Recording stops at 55 seconds and is sent automatically (Azure REST 60-second limit). Switching tabs while recording releases the microphone.
- [ ] Part 2 for the full 1–2 minutes: waits for item 1.
- [x] A larger question bank: 24 Part 1 topics × 4 questions and 20 cue cards × 3 Part 3 questions (156 questions), written in the app's own words around the topic areas that commonly appear in the test — 2026-11-03.
- [ ] A mock test with all 3 parts in a row (`full_test`).

### 2b. Question sets per learner

- [x] The question bank moved to the database (`ielts_question_sets`, migration `000005`), seeded on start from `backend/internal/service/ielts_question_seed.json`. A set is a Part 1 topic, or a Part 2 cue card with its Part 3 questions.
- [x] Each attempt stores `question_set_id` and `task_prompt`, so progress is tracked per learner and per part.
- [x] `GET /api/ielts/next?part=` gives a set the learner has not done (`exclude` skips the one on screen). When every set is done it returns the set done longest ago as a review (`seen: true`).
- [x] `GET /api/ielts/sets?part=` lists sets with attempt count, best band and last date; the UI shows "Đề đã làm" and lets the learner redo a set.
- [x] New sets: when a learner has fewer than 3 unseen sets, one free-LLM call writes 5 new sets in the app's own words (not copied from websites), shared by every learner. It runs in the background, one batch per kind at a time, with a 10-minute cooldown after a failure.
- [ ] Check the quality of LLM-written sets live. The 2026-11-03 test hit a provider outage (nemotron 504, gemma upstream 429); the flow, fallback to review and cooldown worked, but no generated set was saved yet.
- [ ] Optional: a review step (or a simple admin page) for generated sets before learners see them.

### 3. Cost and LLM grading time

Free-tier limits (checked 2026-11-03):
- OpenRouter `:free`: 20 requests/minute, **50 requests/day** (1000/day after buying at least 10 credits). Remaining quota: `GET https://openrouter.ai/api/v1/key` → `free_model_daily_requests`.
- Azure Speech F0: **1 concurrent request**; the free audio hours per month are limited (see the Azure pricing page).

Measured on the real grading prompt (Part 3 answer, 3 criteria):

| Model | Time | Bands FC/LR/GRA |
|---|---|---|
| nemotron-3.5-super-vl:free (reasoning on) | 48.5 s | 6/5/4 |
| nemotron-3.5-super-vl:free (reasoning off) | 13.4 s | 6/5/4 |
| gemma-4-31b-it:free | 31.0 s | 5/5/5 |
| nemotron-3.5-lightning:free | 52.7 s | 8/5/5 |
| gemma-4-26b-a4b-it:free, xing4.0-29b-a4b:free | 429 (overloaded) | — |

- [x] Reasoning off for every OpenRouter request (~3.6× faster, same bands).
- [x] Fallback model `google/gemma-4-31b-it:free` through OpenRouter's `models` parameter (same request; no extra quota when the first model answers).
- [x] Paid models blocked: the app does not start if a model lacks the `:free` suffix, unless `ALLOW_PAID_MODELS=true`. The defaults in `docker-compose.yml` and `config.go` no longer point to `claude-3.5-haiku`.
- [x] Shadowing sentences are generated in batches of 10 per request, queued in the database (migration `000004`), and refilled in the background when fewer than 3 are left. Before: 1 request per sentence.
- [x] Azure: calls wait in line (at most `AZURE_SPEECH_CONCURRENCY`, default 1) and a 429 is retried.
- [x] Azure: each call is limited to 30 seconds; a hung call or a 5xx is retried once (one 60-second hang was seen).
- [x] OpenRouter returns 200 with an `error` body or no answer: retry once with the fallback models only. A 429 (quota) is not retried.
- [x] Leading and trailing silence is trimmed before Azure (less free audio time, faster answers).
- [x] Timing logs: `azure speech: ... took=`, `openrouter: model=... took=`, `speaking grader: ... took=`.

Measured after the changes (2026-11-03):
- New shadowing sentence: ~7 ms from the queue; ~6 s when the queue is empty (first use). 15 sentences = 2 requests (before: 15).
- Silence trimming: a 5.7 s recording became 2.9 s; 13.6 s became 10.7 s. Scores did not change.
- LLM grading (Part 3): 8–21 s (before: 48–67 s). Bands FC/LR/GRA stayed 6/5/4.
- Azure F0 varies a lot: the same 2.9 s file took 1.2–21 s. This is Azure-side latency. A new F0 resource in `southeastasia` (closer to Vietnam than `eastus`) may help; measure again.

- [x] Claude Code with your own subscription, through a host LLM bridge (`tools/llm-bridge`), tried before OpenRouter (`LLM_PROVIDERS=claude,gemini,openrouter`); any failure falls back to the next provider — 2026-11-03. Measured: grading (Part 3) Claude Sonnet 27.7 s, Haiku 23.8 s (the answer is long, so the model size matters little; the CLI adds ~3–4 s); question batch with Haiku 6 s, 5/5 sets usable.
- [x] Gemini via the Gemini API (`GEMINI_API_KEY`, model `gemini-flash-latest`), not the CLI: since 2026-06-18 the Gemini CLI no longer accepts Google AI Pro logins, and Antigravity CLI (`agy -p`) may not be wrapped in an app under consumer plans. Google AI Pro does not raise Gemini API limits (they apply in the AI Studio web UI only).
- [x] Gemini key live (2026-11-03): `gemini-flash-latest` and `gemini-3.1-flash-lite` answered 503 (high demand), the 2.5 models are closed to new users (404), `gemini-3-flash-preview` works. `GEMINI_MODEL` is now a list tried in order. Fallback test (bridge stopped): claude → gemini-3-flash-preview, Part 3 graded in 18 s, all 4 criteria.
- [ ] Check the free-tier limits of the project at aistudio.google.com/rate-limit.
- [x] Run the LLM bridge at login: launchd agent `com.englishapp.llm-bridge` (`tools/llm-bridge/run.sh`, restarts if it stops) — 2026-11-03.
- [x] Two-step grading (migration `000007`, `grading_status`) — 2026-11-03: `POST /api/pronunciation/attempts` returns as soon as Azure and the Pronunciation band are ready (status `pending`); the LLM grades FC/LR/GRA in the background and updates the attempt; the UI polls `GET /api/pronunciation/attempts/:id` every 2 s and fills the panel in. Pending attempts store no overall band, so progress only counts final results. Attempts left pending by a restart are graded again at start-up from the stored Azure JSON. Measured: first result 4 s after stopping a 10.7 s Part 3 answer (before: ~35–40 s for everything), AI result after ~40 s; 38.6 s Part 2: 14 s (Azure F0 was slow), AI after 51 s.
- [ ] Optional: shorter LLM feedback (fewer tokens) to cut the background step from ~30 s.
- [ ] Show the free requests left today (for example on the Progress page) and say clearly when the quota is used up (OpenRouter 429).
- [ ] Prompt caching: skipped for free models (free providers do not support it reliably). Revisit if a paid model is used.

### 4. Shadowing

- [x] Sentences under 10 words give `insufficient_speech` for Pronunciation (`min_words: 10`). Decision: generate only shadowing sentences of 10 words or more (`min_words` read from `rubric.yaml`, shorter ones are dropped); the rubric thresholds are unchanged.
- [ ] The overall band and CEFR from one criterion are very rough. Decide: hide CEFR for shadowing, or keep the "provisional band" label.

### 5. Pronunciation accuracy

- [ ] Test with real human voices. The TTS voice (`say`) gets `Monotone` on every word from Azure, so P-04 = 1/9.
- [ ] Calibrate `pronunciation.thresholds` with answers rated by IELTS-trained teachers. The thresholds are only a starting point.
- [ ] Pitch analysis (P-04, `pitch_direction.py`) is off in Docker: `praat-parselmouth` has no Linux ARM64 wheel. Options: a separate Python image built for amd64, or compile Praat in the Dockerfile.
- [x] P-05 (connected speech): linking estimated from word timing (rubric v2.1.0, 2026-11-04). On 25 real answers 15 had enough joins; bands 3–9. Weak forms and elision are still not measured.

### 6. Old data and history

- [ ] Old attempts in the database have rubric v1.0.0 (7 criteria, 0–100 scale). The frontend must check `rubric.version` before showing them, or they must be re-scored.
- [ ] A script to re-score from the stored `azure_result` when thresholds or the rubric version change.
- [x] Progress page uses real data (`GET /api/progress/summary?tz=`, `db/queries/progress.sql`) — 2026-11-03: streak in the learner's time zone (also in the header), attempts, 30-day Azure accuracy/fluency, 30-day IELTS band, weekly chart (6 weeks, weeks without practice left empty), band per criterion (90 days), 5 hardest phonemes (Azure symbols shown as IPA), attempts per task type, and which LLM graded. Bands only count rubric v2 attempts; v1 attempts (0–100) are left out.
- [x] Dashboard uses real data — 2026-11-03: greeting by time of day, daily goal ring (attempts today / 10), speaking time today (end of the last word Azure heard, summed), 30-day IELTS band, "words to practise again" (Azure mispronounced or under 60 in the last 30 days, omissions left out), weekly accuracy sparkline with the change from the previous practised week. The mock "listening minutes" card and the "Ôn từ" badge were removed (no listening feature yet).
- [ ] Review page (`lib/mock/practice-data.ts`) still uses mock words; vocabulary needs Phase 3. The weak words above could feed it.
- [ ] Daily goal is fixed at 10 attempts; make it a user setting (users.target_goal) if needed.

### 6b. Grader source

- [x] Each attempt stores `grader_provider` and `grader_model` (migration `000006`): the provider and model that actually answered (e.g. `claude` / `claude-sonnet-5-5`, `gemini` / `gemini-3-flash-preview`). The result card shows it; NULL = no LLM (shadowing, LLM failure). All providers get the same rubric prompt (`BuildSystemPrompt`) and the same parser (`ParseEvaluation`); Pronunciation and the overall band are computed in code.
- [ ] Calibrate the providers: same answers graded by each model differed by 0.5–1 band (2026-11-03: Sonnet 6/5/5, Gemini Flash 5/5/4, Nemotron 6/5/4 for FC/LR/GRA). Collect more pairs before deciding on a correction or a single grader.

### 6c. Silent recordings

- [x] A Part 2 answer (Safari) failed with "failed to score pronunciation": Azure returned `InitialSilenceTimeout`, i.e. the recording was (near) silent — reproduced with an 18 s silent file (same 2.5 s Azure time). Fixes (2026-11-03): the error is logged with audio length, loudest level and a saved copy of the WAV; Azure "no speech" returns 422 with a clear Vietnamese message; the recorder creates its AudioContext inside the click (Safari), shows a live mic level and a warning after 3 s of near-silence, and does not send a silent recording to Azure (saves free quota).
- [ ] If it happens again with the meter showing sound, check the saved WAV named in the API log (`pronunciation: scoring failed ... file=`).

### 6d. Partial IELTS results

- [x] A too-short Part 1 answer: the LLM marked FC/LR/GRA `insufficient_speech`, and the rubric rule "average over the remaining criteria, mark provisional" (rubric.yaml, overall) gave an overall band 8.0 ~C1 from Pronunciation alone. App-side fix (2026-11-04), rubric unchanged: an IELTS attempt stores an overall band and CEFR only when all 4 criteria are assessed (`hasOverallBand`); migration `000008` cleared the bands already stored; the panel shows "not enough data for an overall band" when fewer than 3 criteria are assessed, "provisional, missing X" with one missing, and CEFR only for a complete band.
- [ ] Decide in the source rubric (`Document_english/speaking-rubric`, rubric.yaml `overall`) how many criteria an overall band needs, so the rubric and the app agree.

### 6e. Transcript accuracy (free speech)

- [x] Whisper transcript + scripted Azure (2026-11-04, migration `000009` `transcript_source`). Azure's own recognition of free speech got 35% of words wrong on 6 real readings of one text ("avid photographer" -> "an event for the Graford", "candid" -> "Candace", "unposed shots" -> "and post shows"); it then scored those words as said well, and the LLM graded LR/GRA on the wrong words. Now IELTS answers are written down by whisper.cpp `medium.en` on the host (LLM bridge `POST /v1/transcribe`, ~1.1–1.5 s), then Azure scores the audio with that transcript as `ReferenceText` (miscue off). WER: Azure 35%, small.en 21%, medium.en 17%. Falls back to Azure recognition when the bridge fails. The UI says which one wrote the transcript.
- [x] Silero VAD in whisper.cpp (2026-11-04): WER 17% -> 15% (vs the text the learner read), same speed (~1.2 s); removed an invented ending ("You might forget me.") on one answer. Threshold 0.5 (default) was best; 0.35 and +200 ms padding were not better.
- [ ] Some remaining "errors" may be what the learner really said; check by listening, and consider a "read a given text" mode where the reference is known (like shadowing).
- [ ] Try whisper `--prompt` with the question text (topic words) and measure WER again.

### 6f. App-wide QA fixes (2026-11-04)

- [x] E-mails are case-insensitive (`NormalizeEmail`, migration `000010` unique index on `lower(email)`); before, "Me@x.com" and "me@x.com" were two accounts.
- [x] New learners get 12 fixed starter Shadowing sentences (`practice_sentence_starters.json`), so the first sentence shows at once (was ~17 s waiting for the LLM batch).
- [x] "Remember me" works: unticked = session cookie and a 24 h refresh token, kept across rotation (`refresh_tokens.remember`).
- [x] Registering signs the learner in; the login/register pages send a signed-in learner to the dashboard; auth errors in Vietnamese; Vietnamese 404 page.
- [x] Removed fake UI: notification bell, "Forgot password" link, hotline number, fixed "Intermediate" level (now the real 30-day band), and the mock Review page (now the learner's real weak words; spaced repetition is still phase 3). Deleted unused mock data and `vocab-donut.tsx`; frontend eslint is clean.
- [x] Password reset (migration `000011`): `POST /api/auth/forgot-password` (always 202, at most 3 links per account per hour, link valid 30 min, only the SHA-256 stored) and `POST /api/auth/reset-password` (one use; revokes all sessions). E-mail by SMTP (`SMTP_*`); without `SMTP_HOST` the link is written to the API log. Pages `/forgot-password`, `/reset-password`.
- [x] Spaced-repetition word review (migration `000012`, `review_words`, SM-2): every attempt queues its weak words (mispronounced or < 60, no stopwords / words under 3 letters); the Review page plays the word, records it, Azure scores it against the word (85+ easy, 60+ pass, below = back in 10 min); a word said wrongly again in practice is due again. Backfilled from the last 30 days (22 words for the existing account). Sidebar badge = words due.
- [x] New words by band (migration `000013`, 2026-11-04): NGSL 1.2 + NAWL 1.2 (CC BY-SA 4.0, `backend/internal/vocab`) with the app's own band estimate from frequency rank (NGSL 4.0-6.5, NAWL 7.0-8.0; not an official mapping). The learner sets a self-estimated band (welcome page after registering) and a target band (welcome, Progress, Review pages); the measured 90-day IELTS band replaces the estimate. New words have band in (current - 0.5, target], skip words the learner already says well in free speech, easiest band and most frequent first. The LLM writes POS, IPA, Vietnamese meaning and an IELTS-style example once per word (shared; ~13 s for 10 words with Claude, the next 20 are prepared in the background, then instant). Vocab cards: reveal the meaning, rate Forgot/Hard/Good/Easy (SM-2); saying the word is scored by Azure but does not schedule it.
- [x] Pronunciation cards filtered: shown only when said wrongly in >= 2 attempts or scored < 40, and only real English words (SCOWL dictionary + common prefixes); 5 misrecognised words removed from the existing list.
- [x] Speaking history (2026-11-04): `GET /api/pronunciation/attempts?type=&before=` (20 per page, counts per task type); `/history` lists every attempt, `/history/[id]` shows the recording, transcript, scores, rubric, pronunciation tips and answers again.
- [x] AI feedback language (migration `000014`, now part of the app language, see below): `users.feedback_lang` (vi | en); each attempt stores the language it was graded in so a resumed grading keeps it. `rubric.yaml` stays `vi`; `Config.WithLanguage` changes it per request.
- [x] Model answers and improved answers (migration `000014`): `POST /api/coach/sample` writes a model answer at the learner's target band with phrases and tips (one LLM call, shared cache `sample_answers` by question/band/language; ~8 s, then instant). `POST /api/pronunciation/attempts/:id/improve` rewrites the learner's answer at the target band, keeping their ideas, with up to 6 changes and reasons (saved with the attempt).
- [x] Pronunciation tips: each `WordScore` carries its phonemes (old attempts are filled from the stored Azure JSON); the result lists up to 8 weak words with the weakest sounds, a Vietnamese tip per sound (`frontend/lib/pronunciation-tips.ts`), normal/slow audio and a retry scored by `POST /api/pronunciation/word` (not saved).
- [x] Multiple languages (migration `000015`, see `docs/i18n.md`): one language per learner for the UI, AI feedback, code-written summary, pronunciation tips, model answers, vocabulary meanings (`vocab_translations`) and practice sentence glosses. Vietnamese and English today; a language is added with message files and one registry entry on each side, no migration. Replaces the separate feedback-language switch.
- [ ] The frequency band puts some everyday words at 6.5 (joy, throat, forever): consider a CEFR-tagged open list or letting the LLM flag words below the learner's level.

### 7. Maintenance

- [ ] A command to sync the rubric, for example `make sync-rubric` (`rsync -a --delete` + `diff -rq`), instead of copying by hand.
- [ ] Handle `off_topic` / `memorised_response` in the UI (labels exist, not tested live).
- [ ] Fix 2 pre-existing lint errors: `frontend/app/practice/page.tsx`, `frontend/components/charts/vocab-donut.tsx`.

### Question bank

Policy: do not copy questions from IELTS books or "recent exam questions" websites into the repo (copyright, site terms). Use topic areas only as a guide and write the questions in the app's own words.

- [ ] More cue cards for rarer topic types (advertisements, rules, noise, a waste of time, an invention...).
- [ ] Optional: generate extra questions in batches with a free LLM, review them, then add them to `backend/internal/service/ielts_question_seed.json`.
