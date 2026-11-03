package main

import (
	"context"
	"log"
	"net/http"

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
	pronunciationScorer := service.NewAzurePronunciationScorer(cfg.AzureSpeechKey, cfg.AzureSpeechRegion)
	rubricCfg, err := rubric.Load()
	if err != nil {
		log.Fatalf("load speaking rubric: %v", err)
	}
	var graderLLM service.LLMCompleter
	if cfg.OpenRouterAPIKey != "" {
		model := cfg.GraderModel
		if model == "" {
			model = cfg.OpenRouterModel
		}
		graderLLM = service.NewOpenRouterCompleter(cfg.OpenRouterAPIKey, model)
	}
	var pitchAnalyzer service.PitchAnalyzer
	if cfg.PitchPython != "" {
		pitchAnalyzer = service.NewScriptPitchAnalyzer(cfg.PitchPython, cfg.PitchScript, rubricCfg.Pronunciation)
	}
	speakingGrader := service.NewSpeakingGrader(rubricCfg, graderLLM, pitchAnalyzer)
	pronunciationRepo := repository.NewPronunciationRepository(pool)
	pronunciationService := service.NewPronunciationService(pronunciationScorer, speakingGrader, audioStorage, pronunciationRepo)
	pronunciationHandler := handler.NewPronunciationHandler(pronunciationService)

	sentenceGenerator := service.NewOpenRouterSentenceGenerator(cfg.OpenRouterAPIKey, cfg.OpenRouterModel)
	practiceSentenceRepo := repository.NewPracticeSentenceRepository(pool)
	practiceSentenceService := service.NewPracticeSentenceService(sentenceGenerator, practiceSentenceRepo)
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

	e.GET("/healthz", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	log.Fatal(e.Start(":" + cfg.Port))
}
