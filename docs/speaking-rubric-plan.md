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

### 3. Chi phí và thời gian chấm của LLM

Giới hạn gói free (kiểm tra ngày 2026-11-03):
- OpenRouter `:free`: 20 request/phút, **50 request/ngày** (1000/ngày nếu từng nạp ≥ 10 credit). Xem còn bao nhiêu: `GET https://openrouter.ai/api/v1/key` → `free_model_daily_requests`.
- Azure Speech F0: **1 request cùng lúc**, số giờ âm thanh miễn phí mỗi tháng có hạn (xem bảng giá Azure).

Đo trên prompt chấm thật (bài Part 3, 3 tiêu chí):

| Model | Thời gian | Band FC/LR/GRA |
|---|---|---|
| nemotron-3.5-super-vl:free (reasoning bật) | 48,5 s | 6/5/4 |
| nemotron-3.5-super-vl:free (reasoning tắt) | 13,4 s | 6/5/4 |
| gemma-4-31b-it:free | 31,0 s | 5/5/5 |
| nemotron-3.5-lightning:free | 52,7 s | 8/5/5 |
| gemma-4-26b-a4b-it:free, xing4.0-29b-a4b:free | lỗi 429 (quá tải) | — |

- [x] Tắt reasoning cho mọi request OpenRouter (nhanh hơn ~3,6 lần, band không đổi).
- [x] Model dự phòng `google/gemma-4-31b-it:free` qua tham số `models` của OpenRouter (cùng một request, không tốn thêm lượt khi model đầu chạy được).
- [x] Chặn model trả phí: app không khởi động nếu có model không có đuôi `:free`, trừ khi đặt `ALLOW_PAID_MODELS=true`. Mặc định trong `docker-compose.yml` và `config.go` không còn trỏ tới `claude-3.5-haiku`.
- [x] Câu shadowing sinh theo lô 10 câu/1 request, lưu hàng đợi trong DB (migration `000004`), tự nạp thêm ở nền khi còn < 3 câu. Trước: 1 request/câu.
- [x] Azure: xếp hàng (tối đa `AZURE_SPEECH_CONCURRENCY`, mặc định 1) và thử lại khi gặp 429.
- [x] Azure: mỗi lần gọi tối đa 30 giây; treo quá lâu hoặc lỗi 5xx thì thử lại một lần (đã gặp một lần treo 60 giây).
- [x] OpenRouter trả 200 nhưng body có `error` / không có câu trả lời: thử lại một lần chỉ với model dự phòng. Lỗi 429 (hết lượt) không thử lại.
- [x] Cắt khoảng lặng đầu/cuối bản ghi trước khi gửi Azure (bớt giờ âm thanh, Azure trả nhanh hơn).
- [x] Log thời gian: `azure speech: ... took=`, `openrouter: model=... took=`, `speaking grader: ... took=`.

Kết quả đo thật sau khi tối ưu (2026-11-03):
- Câu shadowing mới: ~7 ms khi lấy từ hàng đợi; ~6 s khi hàng đợi trống (lần đầu). 15 câu = 2 request (trước: 15).
- Cắt khoảng lặng: bản ghi 5,7 s còn 2,9 s; 13,6 s còn 10,7 s. Điểm không đổi.
- Chấm LLM (Part 3): 8–21 s (trước: 48–67 s). Band FC/LR/GRA giữ nguyên 6/5/4.
- Azure F0 dao động mạnh: cùng file 2,9 s mất 1,2–21 s. Đây là độ trễ bên Azure. Có thể thử tạo resource F0 ở vùng `southeastasia` (gần Việt Nam hơn `eastus`) rồi đo lại.
- [ ] Chấm bất đồng bộ: trả kết quả Azure và Phát âm ngay, chấm LLM ở nền, frontend hỏi lại (polling). Làm cùng giao diện Part (mục 2).
- [ ] Hiện số request free còn lại trong ngày (ví dụ ở trang Tiến độ) và báo rõ khi hết lượt (lỗi 429 từ OpenRouter).
- [ ] Prompt caching: bỏ qua với model free (nhà cung cấp free không hỗ trợ ổn định). Xem lại nếu chuyển sang model trả phí.

### 4. Shadowing

- [x] Câu dưới 10 từ: Phát âm ra `insufficient_speech` (`min_words: 10`). Đã chọn: chỉ sinh câu shadowing từ 10 từ trở lên (lấy `min_words` từ `rubric.yaml`, lọc câu ngắn hơn), không sửa ngưỡng của bộ tiêu chí.
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
