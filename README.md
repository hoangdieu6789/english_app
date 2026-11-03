# English Learning App — Giai đoạn 1

Web app học tiếng Anh nghe-nói (Comprehensible Input + Shadowing). Backend Go tách hoàn toàn khỏi frontend Next.js để port mobile dễ sau này (mobile gọi thẳng cùng REST API).

## Cấu trúc

```
backend/    Go (Echo + sqlc + pgx + golang-migrate), Clean Architecture
frontend/   Next.js App Router + TypeScript + Tailwind + React Query + Zustand
```

## Quyết định kiến trúc — Giai đoạn 1

### Refresh token: DB-backed + rotation
Lưu trong bảng `refresh_tokens` (hash SHA-256, không lưu raw token) thay vì stateless JWT, để có thể revoke trước hạn (logout, đổi mật khẩu, phát hiện xâm nhập). Mỗi lần gọi `/api/auth/refresh`, token cũ bị revoke ngay và token mới được cấp (rotation) — chặn replay attack nếu refresh token bị đánh cắp nhưng đã dùng qua 1 lần.

- Access token: JWT HS256, 15 phút, verify signing method tường minh (chống algorithm-confusion attack).
- Refresh token: random 256-bit hex, 30 ngày.

### Cookie transport (không phải localStorage)
Access + refresh token set qua **httpOnly, SameSite=Lax cookie** — access token path `/`, refresh token giới hạn path `/api/auth` để giảm bề mặt lộ. Tránh XSS đọc token qua JS. CORS bật `AllowCredentials: true` với `AllowOrigins` là domain frontend cụ thể (không dùng `*`, bắt buộc khi dùng credentialed cookie).

Middleware `internal/middleware/jwt_auth.go` đọc token theo thứ tự: `Authorization: Bearer` header trước (dành cho mobile app sau này), fallback cookie (web). Nhờ vậy cùng 1 API phục vụ cả web và mobile mà không đổi backend.

### sqlc: query tổ chức theo domain
`db/queries/{auth,pronunciation,vocab,progress}.sql` — mỗi domain 1 file, dễ maintain khi tính năng tăng (đặc biệt các query tính toán spaced repetition, progress snapshot ở giai đoạn sau). sqlc dùng driver `pgx/v5` (không phải `database/sql`) để khớp trực tiếp với `pgxpool.Pool` — cột `TIMESTAMPTZ`/`TEXT` nullable sinh ra kiểu `pgtype.Timestamptz`/`pgtype.Text`, được convert sang `*time.Time`/`*string` thuần ở lớp repository trước khi trả `internal/domain` structs — service/handler layer không phụ thuộc pgtype.

### Clean Architecture
`domain` (structs thuần) ← `repository` (interface + sqlc impl) ← `service` (business logic, không import Echo) ← `handler` (Echo, chỉ parse request/response). Cho phép mock repository khi viết unit test service, và tái sử dụng service layer nếu sau này thêm gRPC/CLI.

## Chạy local

### Backend
```bash
cd backend
cp env.example .env   # điền JWT_ACCESS_SECRET, JWT_REFRESH_PEPPER
docker compose up -d
migrate -database "$DATABASE_URL" -path db/migrations up
go run cmd/api/main.go
```

### Frontend
```bash
cd frontend
cp env.local.example .env.local
npm run dev
```

### Full stack qua Docker Compose (khuyến nghị để demo/test nhanh)
```bash
docker compose up -d --build
```
Chạy: Postgres (5432) → `migrate` job (áp schema, tự exit) → backend (8080) → frontend (3000). Set `JWT_ACCESS_SECRET`/`JWT_REFRESH_PEPPER` qua env trước khi chạy nếu không dùng giá trị dev mặc định. `backend/docker-compose.yml` (chỉ Postgres) vẫn giữ lại cho workflow `go run` local không cần build image.

## Chấm điểm nói (speaking rubric)

Bộ tiêu chí nằm ở `backend/internal/rubric/` (theo *IELTS Speaking Band Descriptors*: 4 tiêu chí, band 0–9). Bản gốc ở `Document_english/speaking-rubric`; khi đổi tiêu chí, chép lại nguyên thư mục. Đọc `backend/internal/rubric/README.md` để biết chi tiết.

Mỗi lần gửi `POST /api/pronunciation/attempts`:

1. Azure Pronunciation Assessment (REST, `en-US`, **bật prosody**) chấm phát âm như trước: điểm chính xác, trôi chảy, đầy đủ, từng từ, từng âm.
2. `SpeakingGrader` (`internal/service/speaking_grader.go`) áp bộ tiêu chí:
   - **Pronunciation** tính bằng code từ JSON Azure (không gọi LLM). Cần ít nhất 10 từ; câu ngắn hơn sẽ ghi `insufficient_speech`.
   - **shadowing** (đọc theo câu mẫu, không phải một Part của IELTS) chỉ chấm Pronunciation. 3 tiêu chí còn lại ghi `not_in_task`, band tổng là tạm tính (`provisional`).
   - **IELTS Part** (`taskType` = `part1`, `part2`, `part3`, `full_test`, không cần `referenceText`) gọi thêm LLM qua OpenRouter để chấm Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy từ transcript và `speech_hints` (tốc độ nói, chỗ ngừng, từ đệm).
   - Band tổng (làm tròn .0/.5) và CEFR ước lượng do code tính.
3. Kết quả lưu ở `pronunciation_attempts.rubric` (JSON), kèm JSON gốc của Azure ở `azure_result` để chấm lại khi đổi ngưỡng. `rubric_score` là band tổng 0–9 (migration `000003`).

Form fields: `audio`, `referenceText`, `taskType` (mặc định `shadowing`), `taskPrompt` (câu hỏi hoặc cue card).

Lỗi ở bước rubric (LLM lỗi, thiếu dữ liệu) không làm mất lượt nói: lượt vẫn được lưu, tiêu chí không chấm được nằm trong `not_assessed`.

Biến môi trường (xem `backend/env.example`): `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODELS`, `ALLOW_PAID_MODELS`, `AZURE_SPEECH_CONCURRENCY`, `GRADER_MODEL`, `PITCH_PYTHON`, `PITCH_SCRIPT`.

Chi phí: mặc định app chỉ dùng model `:free` của OpenRouter và không khởi động nếu có model trả phí (trừ khi `ALLOW_PAID_MODELS=true`). Gói free có 50 request/ngày, nên câu shadowing được sinh theo lô 10 câu/1 request (migration `000004`). Azure F0 chỉ cho 1 request cùng lúc, nên các lượt nói xếp hàng. Chi tiết và số đo: `docs/speaking-rubric-plan.md`, mục 3.

Phân tích cao độ (P-04) **mặc định tắt**: image Docker không có Python, vì `praat-parselmouth` không có bản cài sẵn (wheel) cho Linux ARM64, nên trên Mac Apple Silicon phải biên dịch Praat từ mã nguồn. Muốn bật khi chạy `go run`: tạo venv, `pip install praat-parselmouth numpy`, rồi đặt `PITCH_PYTHON=<venv>/bin/python`. Test thật: `PITCH_PYTHON=<venv>/bin/python go test ./internal/service/ -run Pitch`.

Test: `cd backend && go test ./...`

Các phần còn thiếu và thứ tự làm: `docs/speaking-rubric-plan.md`.

## Giai đoạn tiếp theo
- Giai đoạn 2: Pronunciation scoring (Azure Pronunciation Assessment qua REST, `PronunciationScorer` interface, audio storage S3/Supabase).
- Giai đoạn 3: Vocabulary gap detection + spaced repetition (SM-2).
- Giai đoạn 4: Progress tracking dashboard (recharts).
