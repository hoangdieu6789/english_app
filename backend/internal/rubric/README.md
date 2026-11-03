# Speaking Rubric — IELTS Speaking Band Descriptors

Bộ tiêu chí chấm nói theo **IELTS Speaking Band Descriptors** (bản công khai trên IELTS.org): 4 tiêu chí, thang band 0–9, điểm tổng làm tròn tới nửa band. Viết dưới dạng markdown + yaml để nạp thẳng vào prompt LLM; package Go (`embed`) copy vào backend là chạy.

## Cấu trúc thư mục

```
speaking-rubric/
├── rubric.yaml                          # config: thang band, cách làm tròn, ngưỡng pronunciation
├── rubric.go                            # load config, build system prompt, tính band tổng
├── pronunciation.go                     # parse JSON Azure, band Pronunciation theo luật, speech hints cho FC
├── evaluation.go                        # parse + sửa output LLM, ghép kết quả cuối (Assemble)
├── pitch.go                             # gọi pitch/pitch_direction.py từ Go
├── rubric_test.go, evaluation_test.go
├── pitch/pitch_direction.py             # hướng cao độ cuối câu (Praat/parselmouth) cho P-04
├── criteria/
│   ├── 00-overview.md                   # 4 tiêu chí, quy tắc chấm chính thức, các Part
│   ├── 01-fluency-and-coherence.md      # FC-01…05  — LLM (+ speech hints từ Azure)
│   ├── 02-lexical-resource.md           # LR-01…04  — LLM
│   ├── 03-grammatical-range-and-accuracy.md  # GRA-01…05 — LLM
│   ├── 04-pronunciation.md              # P-01…06   — tính bằng code, không gửi LLM
│   └── 99-scoring-notes.md              # mỗi lỗi chỉ tính ở 1 tiêu chí, lưu ý ASR
├── prompts/
│   ├── system.md                        # system prompt (không phụ thuộc task → cache được)
│   └── output-format.md
├── schema/evaluation.schema.json        # JSON Schema cho output của LLM
└── examples/
    ├── sample-evaluation.json
    └── azure/
        ├── rest-sample.json             # response mẫu của REST API (Microsoft)
        └── sample-segments.json         # JSON Azure tự tạo để test
```

## Ai chấm tiêu chí nào

| Tiêu chí | Chấm bởi | Dữ liệu |
|---|---|---|
| Fluency and Coherence | LLM | transcript + `speech_hints` (WPM, chỗ ngừng, ngừng giữa câu, từ đệm, lặp từ) tính từ Azure |
| Lexical Resource | LLM | transcript |
| Grammatical Range and Accuracy | LLM | transcript |
| Pronunciation | Code (`ScorePronunciation`) | Azure Pronunciation Assessment + cao độ từ WAV |

Pronunciation đo được **5/6 đặc điểm** trong descriptor: phát âm từ/âm vị (P-01), chunking (P-02), nhịp (P-03, gián tiếp qua `ProsodyScore`), ngữ điệu & trọng âm (P-04), độ dễ hiểu (P-06, gián tiếp qua `AccuracyScore`). Connected speech (P-05) ghi `not_measured`. Kết quả có `coverage`, danh sách từ phát âm sai và câu lên/xuống giọng sai.

## Luồng chấm

```
mic ─► Azure (unscripted, en-US, prosody) ─► JSON từng segment ─┐
  └──► ghi WAV song song ─────────────────────────────────────┐ │
                                                              ▼ ▼
        [Go] ParseAzureSegments ─► PitchItems ─► RunPitchAnalysis (Python)
                  │                                     │
                  ├─► ComputeSpeechHints ─┐             ▼
                  └──────────────► ScorePronunciation(segs, pitch) → band P
                                          ▼
        [LLM] system = BuildSystemPrompt() ; user = task + transcript + speech_hints
              → band FC, LR, GRA (JSON theo schema)
                                          ▼
        [Go] OverallBand(bands) → band tổng (.0/.5) + CEFR ước lượng + provisional
```

## Tích hợp vào Go backend

```bash
cp -r speaking-rubric internal/rubric
go get gopkg.in/yaml.v3
pip install praat-parselmouth numpy      # cho pitch_direction.py
```

```go
cfg, _ := rubric.Load()
pc := cfg.Pronunciation

// 1. Âm thanh
segs, _ := rubric.ParseAzureSegments(azureJSONs, pc.Thresholds.BreakConfidence)
pitch, err := pc.RunPitchAnalysis(ctx, "python3", "internal/rubric/pitch/pitch_direction.py",
	wavPath, rubric.PitchItems(segs, 0.3))
if err != nil { pitch = nil }              // P-04 khi đó chỉ dùng tín hiệu monotone
pron := pc.ScorePronunciation(segs, pitch)
hints := rubric.ComputeSpeechHints(segs)

// 2. LLM chấm FC, LR, GRA
system, _ := cfg.BuildSystemPrompt()       // cố định → bật prompt caching
schema, _ := rubric.Schema()
user, _ := json.Marshal(map[string]any{
	"task":         map[string]any{"task_type": "part3", "questions": questions},
	"transcript":   transcript,
	"speech_hints": hints,
})
// gọi LLM với system + user (structured output theo schema) → reply (string)
ev, err := cfg.ParseEvaluation(reply, "part3") // tự sửa: bỏ tiêu chí lạ, band ngoài 1–9, mã lỗi sai
if err != nil { ev = nil }

// 3. Kết quả cuối: 3 tiêu chí LLM + Pronunciation + band tổng
res := cfg.Assemble("part3", ev, &pron, &hints)
// res.Overall = {Band: 6.5, CEFR: "B2", Provisional: false}
```

## Lưu ý

- **Làm tròn band tổng:** IELTS không công bố cách làm tròn từ 4 tiêu chí ra band Speaking. Mặc định `ielts_half` (giống làm tròn band Overall: .25 → .5, .75 → lên band). Đổi thành `floor_half` trong `rubric.yaml` nếu muốn chấm chặt hơn.
- **Ngưỡng Pronunciation chỉ là điểm xuất phát:** điểm Azure không được hiệu chỉnh theo IELTS. Cần một bộ bài nói đã có giáo viên IELTS chấm để chỉnh `pronunciation.thresholds`. Band 8–9 Pronunciation nên có giáo viên xác nhận.
- **JSON của Azure:** parser đọc được cả dạng SDK (điểm nằm trong `PronunciationAssessment`) lẫn dạng REST (điểm nằm phẳng trên `NBest`/`Words`). Từ `Omission` bị bỏ qua; `MissingBreak` chỉ tính khi trước từ có dấu câu. Vẫn nên lưu một response thật từ SDK vào `examples/azure/` và chạy `go test`.
- **Ghi WAV song song** với luồng Azure, bắt đầu cùng lúc để `Offset` khớp. Không có WAV vẫn chấm được Pronunciation, chỉ thiếu phần kiểm tra lên/xuống giọng.
- Prosody chỉ có với `en-US`. Nếu thiếu Pronunciation, band tổng được tính từ 3 tiêu chí và đánh dấu `provisional`.
- Nội dung descriptor dựa trên tài liệu IELTS bạn cung cấp; kiểm tra IELTS.org khi có bản cập nhật.
