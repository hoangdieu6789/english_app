# Speaking Rubric — IELTS Speaking Band Descriptors

A speaking rubric based on the **IELTS Speaking Band Descriptors** (public version on IELTS.org): 4 criteria, bands 0–9, overall band rounded to a half band. Written as markdown + yaml so it can be loaded straight into an LLM prompt; the Go package (`embed`) works as soon as it is copied into the backend.

## Folder layout

```
speaking-rubric/
├── rubric.yaml                          # config: band scale, rounding, pronunciation thresholds
├── rubric.go                            # loads the config, builds the system prompt, computes the overall band
├── pronunciation.go                     # parses Azure JSON, rule-based Pronunciation band, speech hints for FC
├── evaluation.go                        # parses + repairs the LLM output, builds the final result (Assemble)
├── pitch.go                             # runs pitch/pitch_direction.py from Go
├── rubric_test.go, evaluation_test.go
├── pitch/pitch_direction.py             # final pitch direction (Praat/parselmouth) for P-04
├── criteria/
│   ├── 00-overview.md                   # the 4 criteria, official rating rules, the test parts
│   ├── 01-fluency-and-coherence.md      # FC-01…05  — LLM (+ speech hints from Azure)
│   ├── 02-lexical-resource.md           # LR-01…04  — LLM
│   ├── 03-grammatical-range-and-accuracy.md  # GRA-01…05 — LLM
│   ├── 04-pronunciation.md              # P-01…06   — computed in code, not sent to the LLM
│   └── 99-scoring-notes.md              # each error counts in one criterion only; ASR notes
├── prompts/
│   ├── system.md                        # system prompt (independent of the task, so it can be cached)
│   └── output-format.md
├── schema/evaluation.schema.json        # JSON Schema for the LLM output
└── examples/
    ├── sample-evaluation.json
    └── azure/
        ├── rest-sample.json             # sample REST API response (Microsoft)
        └── sample-segments.json         # hand-made Azure JSON for tests
```

## Who scores which criterion

| Criterion | Scored by | Data |
|---|---|---|
| Fluency and Coherence | LLM | transcript + `speech_hints` (WPM, pauses, mid-sentence pauses, fillers, repetitions) computed from Azure |
| Lexical Resource | LLM | transcript |
| Grammatical Range and Accuracy | LLM | transcript |
| Pronunciation | Code (`ScorePronunciation`) | Azure Pronunciation Assessment + pitch from the WAV |

Pronunciation measures **5 of the 6 features** in the descriptor: individual words/phonemes (P-01), chunking (P-02), rhythm (P-03, indirectly through `ProsodyScore`), intonation and stress (P-04), intelligibility (P-06, indirectly through `AccuracyScore`). Connected speech (P-05) is `not_measured`. The result includes `coverage`, the list of mispronounced words and the sentences with a wrong final rise/fall.

## Grading flow

```
mic ─► Azure (unscripted, en-US, prosody) ─► JSON per segment ─┐
  └──► record WAV at the same time ───────────────────────────┐ │
                                                              ▼ ▼
        [Go] ParseAzureSegments ─► PitchItems ─► RunPitchAnalysis (Python)
                  │                                     │
                  ├─► ComputeSpeechHints ─┐             ▼
                  └──────────────► ScorePronunciation(segs, pitch) → band P
                                          ▼
        [LLM] system = BuildSystemPrompt() ; user = task + transcript + speech_hints
              → bands FC, LR, GRA (JSON following the schema)
                                          ▼
        [Go] OverallBand(bands) → overall band (.0/.5) + estimated CEFR + provisional
```

## Using it in a Go backend

```bash
cp -r speaking-rubric internal/rubric
go get gopkg.in/yaml.v3
pip install praat-parselmouth numpy      # for pitch_direction.py
```

```go
cfg, _ := rubric.Load()
pc := cfg.Pronunciation

// 1. Audio
segs, _ := rubric.ParseAzureSegments(azureJSONs, pc.Thresholds.BreakConfidence)
pitch, err := pc.RunPitchAnalysis(ctx, "python3", "internal/rubric/pitch/pitch_direction.py",
	wavPath, rubric.PitchItems(segs, 0.3))
if err != nil { pitch = nil }              // P-04 then uses the monotone signal only
pron := pc.ScorePronunciation(segs, pitch)
hints := rubric.ComputeSpeechHints(segs)

// 2. The LLM scores FC, LR, GRA
system, _ := cfg.BuildSystemPrompt()       // fixed, so prompt caching can be used
schema, _ := rubric.Schema()
user, _ := json.Marshal(map[string]any{
	"task":         map[string]any{"task_type": "part3", "questions": questions},
	"transcript":   transcript,
	"speech_hints": hints,
})
// call the LLM with system + user (structured output following the schema) → reply (string)
ev, err := cfg.ParseEvaluation(reply, "part3") // repairs: drops unknown criteria, bands outside 1–9, bad issue codes
if err != nil { ev = nil }

// 3. Final result: 3 LLM criteria + Pronunciation + overall band
res := cfg.Assemble("part3", ev, &pron, &hints)
// res.Overall = {Band: 6.5, CEFR: "B2", Provisional: false}
```

## Notes

- **Overall band rounding:** IELTS does not publish how the 4 criteria are rounded into the Speaking band. The default is `ielts_half` (like the Overall band: .25 → .5, .75 → next band). Change it to `floor_half` in `rubric.yaml` for stricter scoring.
- **Pronunciation thresholds are only a starting point:** Azure scores are not calibrated to IELTS. A set of answers rated by IELTS teachers is needed to tune `pronunciation.thresholds`. Pronunciation bands 8–9 should be confirmed by a teacher.
- **Azure JSON:** the parser reads both the SDK shape (scores inside `PronunciationAssessment`) and the REST shape (scores flat on `NBest`/`Words`). `Omission` words are skipped; `MissingBreak` counts only when the word follows punctuation. Still save a real SDK response in `examples/azure/` and run `go test`.
- **Record the WAV at the same time** as the Azure stream, starting together so that `Offset` values match. Without the WAV, Pronunciation is still scored; only the rise/fall check is missing.
- Prosody is only available for `en-US`. If Pronunciation is missing, the overall band is computed from the other 3 criteria and marked `provisional`.
- The descriptor text is based on the IELTS document you provided; check IELTS.org for updates.
