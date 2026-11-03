package config

import (
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Port              string
	DatabaseURL       string
	JWTAccessSecret   string
	JWTRefreshPepper  string
	AccessTokenTTL    time.Duration
	RefreshTokenTTL   time.Duration
	FrontendOrigin    string
	CookieDomain      string
	CookieSecure      bool
	AzureSpeechKey    string
	AzureSpeechRegion string
	// Concurrent Azure calls; the Free (F0) tier allows only 1, so 1 is the default.
	AzureSpeechConcurrency int
	AudioStorageDir        string
	AudioPublicURLPrefix   string
	OpenRouterAPIKey       string
	OpenRouterModel        string
	// Comma-separated OpenRouter fallback models, tried in order when the first is busy.
	OpenRouterFallbackModels string
	// false (default): refuse any OpenRouter model without the ":free" suffix.
	AllowPaidModels bool
	// Speaking rubric (internal/rubric)
	GraderModel string // LLM for the transcript criteria; empty = OpenRouterModel

	// LLM providers tried in order: claude, gemini (CLIs through the host LLM bridge, using
	// your own subscription), openrouter (free models). Default: openrouter only.
	LLMProviders   string
	LLMBridgeURL   string
	LLMBridgeToken string
	ClaudeModel    string // Claude Code model alias (sonnet, haiku, opus); empty = CLI default
	GeminiModel    string // Gemini CLI model; empty = CLI default
	PitchPython    string // e.g. "python3"; empty = no pitch analysis (Pronunciation P-04 uses the monotone signal only)
	PitchScript    string // path to internal/rubric/pitch/pitch_direction.py on disk
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		Port:             getEnv("PORT", "8080"),
		DatabaseURL:      getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/english_app?sslmode=disable"),
		JWTAccessSecret:  mustGetEnv("JWT_ACCESS_SECRET"),
		JWTRefreshPepper: mustGetEnv("JWT_REFRESH_PEPPER"),
		AccessTokenTTL:   15 * time.Minute,
		RefreshTokenTTL:  30 * 24 * time.Hour,
		FrontendOrigin:   getEnv("FRONTEND_ORIGIN", "http://localhost:3000"),
		CookieDomain:     getEnv("COOKIE_DOMAIN", ""),
		CookieSecure:     getEnv("COOKIE_SECURE", "false") == "true",

		AzureSpeechKey:         getEnv("AZURE_SPEECH_KEY", ""),
		AzureSpeechRegion:      getEnv("AZURE_SPEECH_REGION", ""),
		AzureSpeechConcurrency: getEnvInt("AZURE_SPEECH_CONCURRENCY", 1),
		AudioStorageDir:        getEnv("AUDIO_STORAGE_DIR", "./data/audio"),
		AudioPublicURLPrefix:   getEnv("AUDIO_PUBLIC_URL_PREFIX", "/uploads"),

		OpenRouterAPIKey: getEnv("OPENROUTER_API_KEY", ""),
		// Free defaults; see service.DefaultOpenRouterModel for why these models.
		OpenRouterModel:          getEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-super-vl:free"),
		OpenRouterFallbackModels: getEnv("OPENROUTER_FALLBACK_MODELS", "google/gemma-4-31b-it:free"),
		AllowPaidModels:          getEnv("ALLOW_PAID_MODELS", "false") == "true",

		GraderModel: getEnv("GRADER_MODEL", ""),

		LLMProviders:   getEnv("LLM_PROVIDERS", "openrouter"),
		LLMBridgeURL:   getEnv("LLM_BRIDGE_URL", "http://host.docker.internal:8765"),
		LLMBridgeToken: getEnv("LLM_BRIDGE_TOKEN", ""),
		ClaudeModel:    getEnv("CLAUDE_MODEL", "sonnet"),
		GeminiModel:    getEnv("GEMINI_MODEL", ""),
		PitchPython:    getEnv("PITCH_PYTHON", ""),
		PitchScript:    getEnv("PITCH_SCRIPT", "internal/rubric/pitch/pitch_direction.py"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if n, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return n
	}
	return fallback
}

func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic("missing required env var: " + key)
	}
	return v
}
