---
id: pronunciation
name: Pronunciation
source: "IELTS Speaking Band Descriptors"
evidence: acoustic (Azure Pronunciation Assessment + pitch analysis of the recorded WAV)
scoring: rule            # computed by pronunciation.go — this file is NOT sent to the LLM
scale: 0-9
---

# Pronunciation (P)

## What it measures

The range and control of phonological features — individual sounds, chunking, rhythm, stress, intonation, connected speech — and how easily the speaker can be understood.

## Band descriptors

| Band | Descriptor |
|---|---|
| 9 | Uses a full range of phonological features to convey precise and/or subtle meaning. Flexible use of features of connected speech is sustained throughout. Can be effortlessly understood throughout. Accent has no effect on intelligibility. |
| 8 | Uses a wide range of phonological features to convey precise and/or subtle meaning. Can sustain appropriate rhythm. Flexible use of stress and intonation across long utterances, despite occasional lapses. Can be easily understood throughout. Accent has minimal effect on intelligibility. |
| 7 | Displays all the positive features of band 6, and some, but not all, of the positive features of band 8. |
| 6 | Uses a range of phonological features, but control is variable. Chunking is generally appropriate, but rhythm may be affected by a lack of stress-timing and/or a rapid speech rate. Some effective use of intonation and stress, but this is not sustained. Individual words or phonemes may be mispronounced, but this causes only occasional lack of clarity. Can generally be understood throughout without much effort. |
| 5 | Displays all the positive features of band 4, and some, but not all, of the positive features of band 6. |
| 4 | Uses some acceptable phonological features, but the range is limited. Produces some acceptable chunking, but there are frequent lapses in overall rhythm. Attempts to use intonation and stress, but control is limited. Individual words or phonemes are frequently mispronounced, causing lack of clarity. Understanding requires some effort and there may be patches of speech that cannot be understood. |
| 3 | Displays some features of band 2, and some, but not all, of the positive features of band 4. |
| 2 | Uses few acceptable phonological features (possibly because the sample is insufficient). Overall problems with delivery impair attempts at connected speech. Individual words and phonemes are mainly mispronounced and little meaning is conveyed. Often unintelligible. |
| 1 | Can produce occasional individual words and phonemes that are recognisable, but no overall meaning is conveyed. Unintelligible. |
| 0 | Does not attend / does not complete. |

## How it is scored (rule-based)

The LLM cannot hear the audio, so the application maps the descriptor features to acoustic signals. Each feature has a `method`: `rule` (measured) or `not_measured` (excluded and shown as a gap, never guessed).

| Code | Descriptor feature | Method | Signal |
|---|---|---|---|
| P-01 | Individual words / phonemes mispronounced, lack of clarity | rule | % of words with `ErrorType = Mispronunciation` (word accuracy < 60) |
| P-02 | Chunking | rule | (`UnexpectedBreak` + `MissingBreak`, confidence ≥ 0.75) per 10 words |
| P-03 | Rhythm, stress-timing, speech rate | rule (proxy) | `ProsodyScore` (Azure combines stress, intonation, speed, rhythm) |
| P-04 | Intonation and stress | rule | share of non-monotone segments + % correct final tone (statements fall, yes-no questions rise) from pitch analysis |
| P-05 | Connected speech (linking, weak forms, elision) | rule (estimate) | % of consonant-to-vowel joins said without a pause (see below) |
| P-06 | Overall intelligibility, effect of accent | rule (proxy) | duration-weighted `AccuracyScore` |

Each measured feature gets a band 1–9 from the thresholds in `rubric.yaml → pronunciation.thresholds`. The criterion band is the weighted mean of measured features, rounded to a whole band. The result always reports `coverage` (e.g. `5/6`).

- If fewer than `min_measured_items` features are measured, the criterion goes to `not_assessed` and the overall band is marked **provisional**.
- Prosody (`ProsodyScore`, breaks, monotone) is only available for `en-US`.

## Known limits

- Azure scores are **not calibrated to IELTS bands**. The thresholds are a starting point; calibrate them with recordings that have been rated by IELTS-trained teachers.
- Accent itself is not penalised by IELTS — only its effect on intelligibility. Azure accuracy is measured against a native (en-US) model, so it may be stricter than IELTS for clear but accented speech.
- P-05 only estimates **linking** (a final consonant sound joined to a starting vowel sound, e.g. "turn_off", "look_at"), from the first/last phoneme of each word and the gap between words. Azure aligns words to 10 ms frames: joined words are 10–30 ms apart, a pause is 90 ms or more, so a join counts as linked when the gap is ≤ `link_gap_seconds` (0.03). Joins after punctuation and around fillers are skipped; fewer than `min_link_pairs` joins → not measured. Weak forms and elision are not measured. Thresholds were checked on 25 real answers (81% of joins linked); calibrate with teacher ratings.
- "Subtle meaning" and the rest of connected speech (bands 8–9) cannot be measured automatically; the rule-based band is therefore capped in practice by the thresholds, and a teacher should confirm bands 8–9.
