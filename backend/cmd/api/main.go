package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"

	"englishapp/backend/internal/handler"
	"englishapp/backend/internal/middleware"
	"englishapp/backend/internal/repository"
	"englishapp/backend/internal/rubric"
	"englishapp/backend/internal/service"
	"englishapp/backend/internal/storage"
	"englishapp/backend/pkg/config"
)

func main() {
	cfg := config.Load()

	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	userRepo := repository.NewUserRepository(pool)
	refreshTokenRepo := repository.NewRefreshTokenRepository(pool)
	authService := service.NewAuthService(userRepo, refreshTokenRepo, cfg)
	authHandler := handler.NewAuthHandler(authService, cfg)
	jwtAuth := middleware.NewJWTAuth(cfg)

	audioStorage, err := storage.NewLocalDiskStorage(cfg.AudioStorageDir, cfg.AudioPublicURLPrefix)
	if err != nil {
		log.Fatalf("init audio storage: %v", err)
	}
	pronunciationScorer := service.NewAzurePronunciationScorer(cfg.AzureSpeechKey, cfg.AzureSpeechRegion, cfg.AzureSpeechConcurrency)
	rubricCfg, err := rubric.Load()
	if err != nil {
		log.Fatalf("load speaking rubric: %v", err)
	}
	// Both LLM users share one free-only OpenRouter setup (see service.OpenRouterCompleter).
	fallbacks := service.ParseModelList(cfg.OpenRouterFallbackModels)
	newLLM := func(model string, temperature float64, timeout time.Duration) *service.OpenRouterCompleter {
		c, err := service.NewOpenRouterCompleter(cfg.OpenRouterAPIKey, append([]string{model}, fallbacks...), temperature, cfg.AllowPaidModels, timeout)
		if err != nil {
			log.Fatalf("openrouter: %v", err)
		}
		return c
	}
	var graderLLM service.LLMCompleter
	if cfg.OpenRouterAPIKey != "" {
		model := cfg.GraderModel
		if model == "" {
			model = cfg.OpenRouterModel
		}
		// temperature 0: grading should be as repeatable as possible. Free models answered the
		// rubric prompt in 13–50 s in testing, so allow up to 120 s.
		graderLLM = newLLM(model, 0, 120*time.Second)
	}
	var pitchAnalyzer service.PitchAnalyzer
	if cfg.PitchPython != "" {
		pitchAnalyzer = service.NewScriptPitchAnalyzer(cfg.PitchPython, cfg.PitchScript, rubricCfg.Pronunciation)
	}
	speakingGrader := service.NewSpeakingGrader(rubricCfg, graderLLM, pitchAnalyzer)
	pronunciationRepo := repository.NewPronunciationRepository(pool)
	pronunciationService := service.NewPronunciationService(pronunciationScorer, speakingGrader, audioStorage, pronunciationRepo)
	// IELTS question sets: seed bank on start, new sets written by the free LLM when a
	// learner is close to the end of the bank.
	questionSetRepo := repository.NewQuestionSetRepository(pool)
	var questionGen service.QuestionSetGenerator
	if cfg.OpenRouterAPIKey != "" {
		questionGen = service.NewLLMQuestionSetGenerator(newLLM(cfg.OpenRouterModel, 0.9, 90*time.Second))
	}
	ieltsQuestionService := service.NewIeltsQuestionService(questionSetRepo, questionGen)
	seedCtx, cancelSeed := context.WithTimeout(context.Background(), 30*time.Second)
	if added, err := ieltsQuestionService.Seed(seedCtx); err != nil {
		log.Fatalf("seed ielts questions: %v", err)
	} else if added > 0 {
		log.Printf("ielts questions: seeded %d sets", added)
	}
	cancelSeed()
	ieltsHandler := handler.NewIeltsHandler(ieltsQuestionService)
	pronunciationHandler := handler.NewPronunciationHandler(pronunciationService, ieltsQuestionService)

	sentenceGenerator := service.NewLLMSentenceGenerator(newLLM(cfg.OpenRouterModel, 0.9, 90*time.Second))
	practiceSentenceRepo := repository.NewPracticeSentenceRepository(pool)
	// Generated sentences have at least as many words as the Pronunciation criterion needs.
	practiceSentenceService := service.NewPracticeSentenceService(sentenceGenerator, practiceSentenceRepo, rubricCfg.Pronunciation.Thresholds.MinWords)
	practiceHandler := handler.NewPracticeHandler(practiceSentenceService)

	e := echo.New()
	e.Use(echomw.Logger())
	e.Use(echomw.Recover())
	e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
		AllowOrigins:     []string{cfg.FrontendOrigin},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete},
		AllowCredentials: true,
	}))
	e.Static(cfg.AudioPublicURLPrefix, cfg.AudioStorageDir)

	api := e.Group("/api")
	handler.RegisterAuthRoutes(api, authHandler, jwtAuth)
	handler.RegisterPronunciationRoutes(api, pronunciationHandler, jwtAuth)
	handler.RegisterPracticeRoutes(api, practiceHandler, jwtAuth)
	handler.RegisterIeltsRoutes(api, ieltsHandler, jwtAuth)

	e.GET("/healthz", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	log.Fatal(e.Start(":" + cfg.Port))
}
