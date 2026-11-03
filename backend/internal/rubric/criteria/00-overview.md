---
id: overview
type: shared
source: "IELTS Speaking Band Descriptors (public version), IELTS.org — Academic and General Training"
---

# IELTS Speaking Assessment — Overview

The learner is rated on **four criteria**, each with equal weight, on a band scale of **0–9** (whole bands only):

| Criterion | id | Code prefix | Scored by |
|---|---|---|---|
| Fluency and Coherence | `fluency_coherence` | FC | LLM, using transcript + timing hints from Azure Speech |
| Lexical Resource | `lexical_resource` | LR | LLM, using transcript |
| Grammatical Range and Accuracy | `grammatical_range_accuracy` | GRA | LLM, using transcript |
| Pronunciation | `pronunciation` | P | Application (rule-based, from Azure Pronunciation Assessment + pitch analysis). Not scored by the LLM. |

## Official rating rules (from the descriptor notes)

1. **A candidate must fully fit the positive features of the descriptor at a particular level.** Give the *highest* band whose positive features are **all** met. If even one key feature of band N is missing, the band is N−1 or lower.
2. **Rate the average performance across all parts** (Part 1, 2, 3), not the best or worst moment.
3. **Band 0**: does not attend / does not complete. **Band 1–2** are used when there is almost no rateable language.
4. Criteria are **independent**: a weakness in one criterion must not lower the others (e.g. many grammar errors do not lower Lexical Resource).

## How to choose a band (procedure for each criterion)

1. Collect evidence: verbatim quotes from the transcript (and the timing hints for FC).
2. Start from the band that seems closest, read its descriptor and the bands immediately above and below.
3. Check every positive feature of the higher band. Move up only if all are met.
4. Record which features were met / not met in `rationale`, with quotes.

## Evidence rules

- Every issue must quote the learner's exact words.
- Group repeated errors into one pattern (up to 2 quotes).
- The transcript comes from speech recognition (ASR); a missing small word may be an ASR error. Mark such issues `confidence: "low"` and do not lower a band on a single low-confidence item.
- Short samples: if the response is too short to show the features of a band (e.g. no chance to show complex structures), say so and do not guess high. If there is no rateable language, use `not_assessed` with `insufficient_speech`.

## Speaking test parts (task types)

| task_type | Description | What to expect |
|---|---|---|
| `part1` | Introduction and interview: short answers on familiar topics | Short turns; judge ability to extend answers |
| `part2` | Long turn: 1–2 minutes on a cue card | Sustained speech, topic development |
| `part3` | Discussion: abstract questions, opinions | Complex ideas, speculation, justification |
| `full_test` | All three parts | Rate the average performance |
