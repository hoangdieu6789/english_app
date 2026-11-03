# English Learning App — Phase 1

A web app for learning English listening and speaking (Comprehensible Input + Shadowing). The Go backend is fully separate from the Next.js frontend, so a mobile app can be added later and call the same REST API.

## Structure

```
backend/    Go (Echo + sqlc + pgx + golang-migrate), Clean Architecture
frontend/   Next.js App Router + TypeScript + Tailwind + React Query + Zustand
docs/       Plans and notes
```

## Architecture decisions — Phase 1

### Refresh token: stored in the database, rotated on use
Refresh tokens are stored in the `refresh_tokens` table (SHA-256 hash, never the raw token) instead of stateless JWTs, so they can be revoked early (logout, password change, suspected break-in). Every call to `/api/auth/refresh` revokes the old token at once and issues a new one (rotation). This blocks replay attacks when a stolen refresh token has already been used once.

- Access token: JWT HS256, 15 minutes, signing method checked explicitly (prevents algorithm-confusion attacks).
- Refresh token: random 256-bit hex, 30 days.

### Cookie transport (not localStorage)
Access and refresh tokens are set as **httpOnly, SameSite=Lax cookies**. The access token uses path `/`; the refresh token is limited to path `/api/auth` to reduce exposure. JavaScript cannot read the tokens, which protects against XSS. CORS uses `AllowCredentials: true` with `AllowOrigins` set to the exact frontend domain (never `*`, which credentialed cookies do not allow).

The middleware `internal/middleware/jwt_auth.go` reads the token in this order: the `Authorization: Bearer` header first (for a future mobile app), then the cookie (web). The same API serves web and mobile without backend changes.

### sqlc: queries grouped by domain
`db/queries/{auth,pronunciation,practice,vocab,progress}.sql`: one file per domain, easy to maintain as features grow (especially the spaced-repetition and progress-snapshot queries of later phases). sqlc uses the `pgx/v5` driver (not `database/sql`) to match `pgxpool.Pool` directly. Nullable `TIMESTAMPTZ`/`TEXT` columns become `pgtype.Timestamptz`/`pgtype.Text`; the repository layer converts them to plain `*time.Time`/`*string` before returning `internal/domain` structs, so the service and handler layers do not depend on pgtype.

### Clean Architecture
`domain` (plain structs) ← `repository` (interface + sqlc implementation) ← `service` (business logic, no Echo import) ← `handler` (Echo, request/response parsing only). Repositories can be mocked in service unit tests, and the service layer can be reused if gRPC or a CLI is added later.

## Run locally

### Backend
```bash
cd backend
cp env.example .env   # fill in JWT_ACCESS_SECRET, JWT_REFRESH_PEPPER
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

### Full stack with Docker Compose (recommended for a quick demo or test)
```bash
docker compose up -d --build
```
Order: Postgres (5432) → `migrate` job (applies the schema, then exits) → backend (8080) → frontend (3000). Set `JWT_ACCESS_SECRET`/`JWT_REFRESH_PEPPER` in the environment first if you do not want the dev defaults. `backend/docker-compose.yml` (Postgres only) is kept for the local `go run` workflow without building images.

## Speaking assessment (speaking rubric)

The rubric lives in `backend/internal/rubric/` (based on the *IELTS Speaking Band Descriptors*: 4 criteria, bands 0–9). The source copy is `Document_english/speaking-rubric`; when the criteria change, copy the whole folder again. See `backend/internal/rubric/README.md` for details.

The practice page (`/practice`) has four modes: **Shadowing** (read a given sentence) and **IELTS Part 1, 2 and 3** (answer a question). Question sets live in the database (`ielts_question_sets`, seeded from `backend/internal/service/ielts_question_seed.json`). Each learner gets sets they have not done first (`GET /api/ielts/next`), can list and redo done sets (`GET /api/ielts/sets`), and when they are close to the end a free LLM writes a batch of new sets in the app's own words, shared by everyone (migration `000005`).

Each `POST /api/pronunciation/attempts`:

1. Trims leading and trailing silence, then sends the audio to Azure Pronunciation Assessment (REST, `en-US`, **prosody on**): accuracy, fluency, completeness, per-word and per-phoneme scores.
2. `SpeakingGrader` (`internal/service/speaking_grader.go`) applies the rubric:
   - **Pronunciation** is computed in code from the Azure JSON (no LLM). It needs at least 10 words; shorter speech is reported as `insufficient_speech`.
   - **shadowing** (reading a given sentence; not an IELTS part) scores Pronunciation only. The other 3 criteria are reported as `not_in_task` and the overall band is `provisional`.
   - **IELTS parts** (`taskType` = `part1`, `part2`, `part3`, `full_test`; no `referenceText`) also call an LLM through OpenRouter to score Fluency and Coherence, Lexical Resource, and Grammatical Range and Accuracy from the transcript and `speech_hints` (speech rate, pauses, fillers).
   - The overall band (rounded to .0/.5) and an estimated CEFR level are computed in code.
3. The result is stored in `pronunciation_attempts.rubric` (JSON), with the raw Azure JSON in `azure_result` so attempts can be re-scored when thresholds change. `rubric_score` is the overall band 0–9 (migration `000003`).

Form fields: `audio`, `referenceText`, `taskType` (default `shadowing`), `taskPrompt` (the question or cue card), `questionSetId` (optional, the IELTS set answered).

A failure in the rubric step (LLM error, too little data) does not lose the attempt: it is still saved, and the criteria that could not be scored are listed in `not_assessed`.

Environment variables (see `backend/env.example`): `LLM_PROVIDERS`, `LLM_BRIDGE_URL`, `LLM_BRIDGE_TOKEN`, `CLAUDE_MODEL`, `GEMINI_MODEL`, `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODELS`, `ALLOW_PAID_MODELS`, `AZURE_SPEECH_CONCURRENCY`, `GRADER_MODEL`, `PITCH_PYTHON`, `PITCH_SCRIPT`.

LLM providers: `LLM_PROVIDERS` lists them in order (`claude`, `gemini`, `openrouter`); a failing provider falls back to the next. `claude` runs the Claude Code CLI logged in on your Mac (your own subscription, for your own local use) through the LLM bridge in `tools/llm-bridge/` (see its README). `gemini` calls the Gemini API with `GEMINI_API_KEY` (free tier key from Google AI Studio; a Google AI Pro subscription does not raise API limits). Default: `openrouter` only.

Cost: by default the app uses only OpenRouter `:free` models and refuses to start if a paid model is configured (unless `ALLOW_PAID_MODELS=true`). The free tier allows 50 requests per day, so shadowing sentences are generated in batches of 10 per request (migration `000004`). Azure F0 allows one request at a time, so attempts wait in line. Details and measurements: `docs/speaking-rubric-plan.md`, section 3.

Pitch analysis (P-04) is **off by default**: the Docker image has no Python, because `praat-parselmouth` has no prebuilt wheel for Linux ARM64, so on Apple Silicon Macs Praat would have to be compiled from source. To turn it on with `go run`: create a venv, `pip install praat-parselmouth numpy`, then set `PITCH_PYTHON=<venv>/bin/python`. Real test: `PITCH_PYTHON=<venv>/bin/python go test ./internal/service/ -run Pitch`.

Tests: `cd backend && go test ./...`

Missing parts and their order: `docs/speaking-rubric-plan.md`.

## Next phases
- Phase 2: Pronunciation scoring (Azure Pronunciation Assessment over REST, `PronunciationScorer` interface, audio storage on S3/Supabase).
- Phase 3: Vocabulary gap detection + spaced repetition (SM-2).
- Phase 4: Progress tracking dashboard (recharts).
