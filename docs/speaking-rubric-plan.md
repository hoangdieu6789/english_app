# Kế hoạch: chấm nói theo IELTS — các phần còn thiếu

Ghi lại những gì chưa xong sau khi chuyển sang bộ tiêu chí IELTS (rubric v2.0.0). Làm xong mục nào thì đánh dấu `[x]` và ghi ngày + commit.

Bản gốc bộ tiêu chí: `~/WorkSpace/Document_english/speaking-rubric`. Bản trong app: `backend/internal/rubric/` (phải giống hệt bản gốc).

## Đã xong (v2.0.0)

- [x] Chép bộ IELTS vào `backend/internal/rubric/` (4 tiêu chí, band 0–9).
- [x] `SpeakingGrader`: LLM chấm FC/LR/GRA, code chấm Pronunciation, band tổng + CEFR do code tính.
- [x] `shadowing` chỉ chấm Pronunciation, 3 tiêu chí còn lại ghi `not_in_task`.
- [x] API nhận `taskType` = `shadowing | part1 | part2 | part3 | full_test`, `taskPrompt`.
- [x] Thẻ "Chấm theo bộ tiêu chí" hiện band /9, 6 đặc điểm phát âm, từ phát âm sai.
- [x] Test Go + thử thật với Azure và OpenRouter (shadowing band 8, Part 3 band 5.5).

## Cần làm

Thứ tự là mức ưu tiên đề xuất.

### 1. Ghi âm dài cho Part 2 và full test — chặn

- [ ] Azure REST (short audio) chỉ nhận tối đa khoảng 60 giây. Part 2 là 1–2 phút, full test còn dài hơn.
  - Hướng làm: chuyển sang Speech SDK / continuous recognition, hoặc cắt WAV thành nhiều đoạn rồi gửi từng đoạn.
  - Grader hiện chỉ chuyền **một** JSON Azure (`[][]byte{in.AzureRaw}`). Cần chuyền nhiều segment, để `speech_hints` (ngừng giữa câu) và P-04 (lên/xuống giọng cuối câu) đúng.
  - Kiểm tra giới hạn thời lượng của `WavRecorder` ở frontend và `maxAudioUploadBytes` ở handler.
  - Xong khi: một bài nói 2 phút được chấm đủ 4 tiêu chí.

### 2. Giao diện cho IELTS Part

- [ ] Trang luyện nói cho chọn loại bài: Shadowing / Part 1 / Part 2 / Part 3.
- [ ] Nguồn câu hỏi: Part 1 (câu hỏi ngắn), Part 2 (cue card), Part 3 (câu hỏi thảo luận). Có thể sinh bằng LLM như câu shadowing (`practice_sentences`), hoặc dùng một bộ câu hỏi cố định.
- [ ] Part 2: 1 phút chuẩn bị + đồng hồ đếm 1–2 phút.
- [ ] Gửi `taskType` và `taskPrompt` từ trang (hàm `submitPronunciationAttempt` đã hỗ trợ).
- [ ] Hiện trạng thái "đang chấm…" vì LLM mất khoảng 50–70 giây.

### 3. Thời gian chấm của LLM

- [ ] Model miễn phí mất khoảng 67 giây cho một bài Part 3. Chọn model nhanh hơn qua `GRADER_MODEL` và đo lại.
- [ ] Cân nhắc chấm bất đồng bộ: trả kết quả Azure và Phát âm ngay, chấm LLM ở nền, frontend hỏi lại (polling) để lấy kết quả.
- [ ] Bật prompt caching cho system prompt (system prompt không phụ thuộc bài, đã cố định).

### 4. Shadowing

- [ ] Câu dưới 10 từ: Phát âm ra `insufficient_speech` (`min_words: 10`). Cần quyết định: hạ ngưỡng riêng cho shadowing (trong `speaking_grader.go`, không sửa bộ gốc), hay chỉ sinh câu shadowing từ 10 từ trở lên.
- [ ] Band tổng và CEFR khi chỉ có một tiêu chí là ước lượng rất thô. Cần quyết định: ẩn CEFR với shadowing, hay giữ nhãn "band tạm tính".

### 5. Độ chính xác của Phát âm

- [ ] Thử với giọng người thật. Giọng TTS (`say`) bị Azure đánh dấu `Monotone` ở mọi từ, nên P-04 = 1/9.
- [ ] Hiệu chỉnh `pronunciation.thresholds` bằng bài nói đã có giáo viên IELTS chấm. Hiện ngưỡng chỉ là điểm xuất phát.
- [ ] Phân tích cao độ (P-04, `pitch_direction.py`) đang tắt trong Docker: `praat-parselmouth` không có wheel Linux ARM64. Hướng làm: image Python riêng build trên amd64, hoặc thêm bước biên dịch Praat vào Dockerfile.
- [ ] P-05 (nối âm) chưa đo được. Giữ `not_measured` cho đến khi có tín hiệu tin cậy.

### 6. Dữ liệu cũ và lịch sử

- [ ] Lượt nói cũ trong DB có rubric v1.0.0 (dạng 7 tiêu chí, thang 0–100). Frontend cần kiểm tra `rubric.version` trước khi hiện, hoặc chấm lại.
- [ ] Script chấm lại từ `azure_result` đã lưu khi đổi ngưỡng hoặc đổi phiên bản rubric.
- [ ] Hiện band IELTS ở trang lịch sử / Tiến độ (dùng `rubric_score`, `cefr_level`).

### 7. Bảo trì

- [ ] Thêm lệnh đồng bộ bộ tiêu chí, ví dụ `make sync-rubric` (`rsync -a --delete` + `diff -rq`), để không sửa tay.
- [ ] Xử lý `off_topic` / `memorised_response` trên giao diện (đã có nhãn, chưa thử thật).
- [ ] Sửa 2 lỗi lint có từ trước: `frontend/app/practice/page.tsx`, `frontend/components/charts/vocab-donut.tsx`.
- [ ] Commit phần rubric hiện tại (chia 3 commit: rubric, backend, frontend).
