# Prompt cho Claude Code: Xây dựng Web App học tiếng Anh (Nghe - Nói)

## Bối cảnh & mục tiêu

Xây dựng một web app học tiếng Anh tập trung vào **nghe - nói** theo phương pháp
Comprehensible Input + Shadowing, với 3 vòng lặp cốt lõi:

1. **Chấm phát âm** (Pronunciation Scoring)
2. **Phát hiện & sửa gap từ vựng** (Vocabulary Gap Detection)
3. **Tracking tiến độ học tập** (Progress Tracking)

Web app cần thiết kế để sau này port sang mobile (React Native/Flutter) dễ dàng —
tách rõ backend/API khỏi frontend ngay từ đầu.

---

## Yêu cầu kỹ thuật tổng thể

- **Frontend**: Next.js (App Router) + TypeScript + TailwindCSS — chỉ đảm nhiệm UI, gọi API qua REST
- **Backend**: Go (tách riêng hoàn toàn khỏi frontend, chạy như 1 service độc lập)
  - Router: **Echo** (nhẹ, middleware rõ ràng, dễ đọc)
  - DB access: **sqlc** (viết SQL thuần trong file `.sql`, generate Go code type-safe — kiểm soát tốt các query tính toán như spaced repetition, progress snapshot)
  - Migration: **golang-migrate**
  - Validation: **go-playground/validator**
  - Auth: JWT thuần (access token + refresh token), middleware Echo tự viết
- **Database**: PostgreSQL — schema viết bằng SQL thuần (không qua ORM), hỗ trợ JSONB cho phoneme/word scores
- **Speech scoring**: Gọi Azure Cognitive Services Speech (Pronunciation Assessment) qua **REST API trực tiếp** (không dùng Go SDK vì SDK Azure cho Go ít tài liệu/không chính thức) — tạo interface `PronunciationScorer` trong Go để sau này đổi provider (Whisper, Google) không ảnh hưởng business logic
- **State management (frontend)**: React Query (TanStack Query) cho data fetching, Zustand cho local UI state
- **Kiến trúc backend (Go)**: Clean architecture — tách rõ 3 lớp, mỗi domain (pronunciation, vocab, progress) có đủ 3 lớp riêng:
  - `internal/service/` — business logic thuần (không phụ thuộc HTTP framework)
  - `internal/repository/` — truy cập database qua sqlc (interface + implementation, để dễ mock test)
  - `internal/handler/` — Echo handlers, chỉ gọi service, không chứa logic, chỉ parse request/response
  - `internal/domain/` — struct models dùng chung (Go structs tương ứng bảng DB)
- **Giao tiếp frontend-backend**: REST JSON, CORS mở cho domain frontend, sau này mobile app gọi thẳng cùng 1 API này

---

## Cấu trúc dữ liệu

### SQL schema (Postgres — dùng cho golang-migrate)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  level TEXT, -- beginner | intermediate | advanced
  target_goal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  listening_minutes INT NOT NULL DEFAULT 0,
  speaking_minutes INT NOT NULL DEFAULT 0,
  exercises_completed INT NOT NULL DEFAULT 0
);

CREATE TABLE pronunciation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  audio_url TEXT NOT NULL,
  reference_text TEXT NOT NULL,
  recognized_text TEXT,
  overall_score REAL NOT NULL,
  fluency_score REAL NOT NULL,
  word_scores JSONB NOT NULL,   -- [{ word, accuracyScore, errorType }]
  phoneme_scores JSONB NOT NULL, -- [{ phoneme, score }]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vocab_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  word TEXT NOT NULL,
  gap_type TEXT NOT NULL, -- listening_gap | pronunciation_gap | never_seen
  occurrence_count INT NOT NULL DEFAULT 1,
  last_score REAL,
  status TEXT NOT NULL DEFAULT 'new', -- new | reviewing | mastered
  next_review_date TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);

CREATE TABLE progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  week_of TIMESTAMPTZ NOT NULL,
  avg_accuracy REAL NOT NULL,
  avg_fluency REAL NOT NULL,
  vocab_mastered INT NOT NULL,
  streak INT NOT NULL
);
```

### Go domain structs (`internal/domain/`)

```go
type User struct {
    ID           uuid.UUID
    Email        string
    PasswordHash string
    Level        *string
    TargetGoal   *string
    CreatedAt    time.Time
}

type PronunciationAttempt struct {
    ID             uuid.UUID
    UserID         uuid.UUID
    AudioURL       string
    ReferenceText  string
    RecognizedText *string
    OverallScore   float32
    FluencyScore   float32
    WordScores     []WordScore     // parsed from JSONB
    PhonemeScores  []PhonemeScore  // parsed from JSONB
    CreatedAt      time.Time
}

type WordScore struct {
    Word          string  `json:"word"`
    AccuracyScore float32 `json:"accuracyScore"`
    ErrorType     string  `json:"errorType"` // none | mispronunciation | omission | insertion
}

type PhonemeScore struct {
    Phoneme string  `json:"phoneme"`
    Score   float32 `json:"score"`
}

type VocabGap struct {
    ID               uuid.UUID
    UserID           uuid.UUID
    Word             string
    GapType          string // listening_gap | pronunciation_gap | never_seen
    OccurrenceCount  int
    LastScore        *float32
    Status           string // new | reviewing | mastered
    NextReviewDate   *time.Time
    FirstSeenAt      time.Time
}

type ProgressSnapshot struct {
    ID            uuid.UUID
    UserID        uuid.UUID
    WeekOf        time.Time
    AvgAccuracy   float32
    AvgFluency    float32
    VocabMastered int
    Streak        int
}
```

---

## Roadmap triển khai theo giai đoạn (làm theo thứ tự, đừng nhảy cóc)

### Giai đoạn 1: Setup nền tảng
- **Backend**: khởi tạo Go module, setup Echo, cấu trúc thư mục `internal/{domain,repository,service,handler}`, `cmd/api/main.go`
- Setup PostgreSQL (docker-compose cho local dev) + golang-migrate cho schema ở trên
- Setup sqlc: viết file `.sql` query, generate Go code
- Auth: implement JWT (register/login/refresh token) — endpoint `/api/auth/register`, `/api/auth/login`
- **Frontend**: khởi tạo Next.js project (TypeScript, TailwindCSS), setup React Query, trang đăng ký/đăng nhập gọi API Go
- Setup CORS ở Go backend cho phép frontend gọi
- Tạo layout cơ bản: Dashboard, Practice, Progress (3 trang chính)

### Giai đoạn 2: Module Chấm phát âm
- Backend: endpoint `POST /api/pronunciation/attempts` — nhận audio upload (multipart), lưu vào cloud storage (S3/Supabase Storage), gọi Azure Pronunciation Assessment REST API, lưu kết quả vào `pronunciation_attempts`
- Implement `internal/service/pronunciation_scorer.go` với interface `PronunciationScorer` — cho phép mock trong test và đổi provider sau này
- Frontend: trang `/practice` — hiển thị 1 câu mẫu, nút ghi âm (Web Audio API / MediaRecorder), upload lên backend Go, hiển thị kết quả với từng từ tô màu theo `errorType`

### Giai đoạn 3: Module Phát hiện Gap
- Backend: sau khi lưu `PronunciationAttempt`, chạy logic trong service layer:
  - Từ có `accuracyScore` thấp ≥ 2 lần trong 7 ngày → tạo/update `vocab_gaps` với `gap_type = pronunciation_gap`
  - Endpoint `POST /api/vocab/mark-unknown` — người dùng tap "không hiểu từ này" khi nghe → tạo `vocab_gaps` với `gap_type = listening_gap`
- Implement thuật toán spaced repetition đơn giản (kiểu SM-2) trong `internal/service/spaced_repetition.go` để tính `next_review_date`
- Endpoint `GET /api/vocab/review-today` — trả về danh sách từ cần ôn hôm nay
- Frontend: trang `/review` — mỗi từ có mini bài tập: nghe → chọn nghĩa → nói lại

### Giai đoạn 4: Module Tracking tiến độ
- Backend: viết 1 job chạy định kỳ mỗi tuần (dùng `robfig/cron` trong Go, hoặc scheduled task riêng) — tính `progress_snapshots` từ dữ liệu raw (accuracy trung bình, fluency trung bình, số từ mastered, streak)
- Endpoint `GET /api/progress/dashboard` — trả về dữ liệu tổng hợp cho frontend vẽ biểu đồ
- Frontend: trang `/progress` — dashboard hiển thị:
  - Biểu đồ accuracy/fluency theo thời gian (dùng recharts)
  - Streak hiện tại
  - Top 5 âm khó nhất (từ `phoneme_scores`)
  - Số từ đã master / đang review

### Giai đoạn 5: Polish & chuẩn bị port mobile
- Đảm bảo toàn bộ business logic nằm trong `internal/service/` — không import package HTTP (Echo) trong các file này, để dễ viết unit test và tái sử dụng logic
- Viết test cho service layer bằng `testing` + `testify`, mock repository qua interface
- Viết Swagger/OpenAPI spec cho toàn bộ API (dùng `swaggo/swag`) — giúp mobile app (React Native) sau này biết chính xác API shape mà không cần đọc code Go
- Dockerize backend Go (multi-stage build) để deploy độc lập với frontend

---

## Lưu ý quan trọng khi code

- **Không chấm điểm quá khắt khe ở UI** — ưu tiên khuyến khích người học nói, tránh gây tâm lý sợ nói sai (rất quan trọng về UX)
- **Tách audio storage** — dùng cloud storage (S3/Supabase Storage) cho file audio, không lưu trong Postgres
- **Đừng hardcode Azure API key** — dùng biến môi trường (`.env` + Viper hoặc `os.Getenv`), không commit lên git
- **Go error handling**: dùng pattern trả về `error` rõ ràng ở mọi lớp, wrap error bằng `fmt.Errorf("...: %w", err)` để giữ context, không nuốt lỗi im lặng
- **sqlc query nằm riêng theo domain**: `db/queries/pronunciation.sql`, `db/queries/vocab.sql`, `db/queries/progress.sql` — dễ maintain khi feature tăng lên
- **Ưu tiên MVP chạy được trước khi tối ưu** — làm xong Giai đoạn 1-2 trước, test thực tế, rồi mới làm tiếp

---

## Yêu cầu với Claude Code khi bắt đầu

1. Đọc kỹ toàn bộ prompt này trước khi code
2. Bắt đầu từ Giai đoạn 1 — setup Go backend và Next.js frontend song song, xác nhận với tôi trước khi chuyển giai đoạn tiếp theo
3. Mỗi giai đoạn, tạo README ngắn ghi lại quyết định kiến trúc quan trọng (đặc biệt các quyết định về sqlc query hoặc cấu trúc Echo middleware)
4. Nếu có phần nào chưa rõ (ví dụ cấu trúc JWT refresh token, hoặc cách tổ chức thư mục Go cụ thể), hỏi tôi trước khi tự quyết định
