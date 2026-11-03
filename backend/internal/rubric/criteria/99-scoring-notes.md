---
id: scoring_notes
type: shared
source: "Application rules on top of the IELTS Speaking Band Descriptors"
---

# Scoring Notes — where each feature is counted

To keep the four criteria independent, every feature is counted in **one** criterion only:

| Feature in the transcript | Counted in | Not counted in |
|---|---|---|
| Pauses, fillers (*um, er*), slow speech | FC | GRA, LR |
| Repetition, false starts, self-correction | FC | GRA (credit the corrected form) |
| Connectives, discourse markers, referencing | FC | LR (unless the word itself is wrong) |
| Wrong word, wrong collocation, wrong register, idioms, paraphrase | LR | GRA |
| Word form when a different word is chosen (*interesting / interested*) | LR | GRA |
| Inflection, tense, agreement, articles, word order, clause structure | GRA | LR |
| Sounds, stress, intonation, rhythm | P (rule-based) | FC, LR, GRA |

## ASR caution

- The transcript is produced by Azure speech recognition. It may drop or add small words (*a, the, -s, -ed*) or "correct" the learner. If a word has low pronunciation accuracy in the hints, treat a related grammar error as `confidence: "low"`.
- Do not penalise punctuation or capitalisation — they are added by ASR.

## Not errors in spoken English

Ellipsis and short answers, contractions, informal standard forms (*Who did you go with?*), sentences starting with *And/But/So*, tag questions, vague language (*and stuff, sort of*) used naturally. Native-like slips are acceptable at band 9.
