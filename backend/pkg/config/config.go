package config

import (
	"os"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                 string
	DatabaseURL          string
	JWTAccessSecret      string
	JWTRefreshPepper     string
	AccessTokenTTL       time.Duration
	RefreshTokenTTL      time.Duration
	FrontendOrigin       string
	CookieDomain         string
	CookieSecure         bool
	AzureSpeechKey       string
	AzureSpeechRegion    string
	AudioStorageDir      string
	AudioPublicURLPrefix string
	OpenRouterAPIKey     string
	OpenRouterModel      string
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

		AzureSpeechKey:       getEnv("AZURE_SPEECH_KEY", ""),
		AzureSpeechRegion:    getEnv("AZURE_SPEECH_REGION", ""),
		AudioStorageDir:      getEnv("AUDIO_STORAGE_DIR", "./data/audio"),
		AudioPublicURLPrefix: getEnv("AUDIO_PUBLIC_URL_PREFIX", "/uploads"),

		OpenRouterAPIKey: getEnv("OPENROUTER_API_KEY", ""),
		OpenRouterModel:  getEnv("OPENROUTER_MODEL", "anthropic/claude-3.5-haiku"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
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
