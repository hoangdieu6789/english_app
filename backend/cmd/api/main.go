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
	var mailer service.Mailer = service.LogMailer{}
	if cfg.SMTPHost != "" {
		from := cfg.SMTPFrom
		if from == "" {
			from = cfg.SMTPUsername
		}
		mailer = service.NewSMTPMailer(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword, from)
		log.Printf("mail: SMTP %s:%d", cfg.SMTPHost, cfg.SMTPPort)
	} else {
		log.Printf("mail: SMTP_HOST not set; password reset links are written to this log")
	}
	authService.EnablePasswordReset(repository.NewPasswordResetRepository(pool), mailer)
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
	// Every LLM user (grader, sentence and question generators) gets the same provider chain,
	// tried in order (LLM_PROVIDERS): Claude Code through the host LLM bridge (your own
	// subscription), the Gemini API (free tier key), free OpenRouter models. A failing
	// provider falls back to the next.
	fallbacks := service.ParseModelList(cfg.OpenRouterFallbackModels)
	newLLM := func(openRouterModel string, temperature float64, timeout time.Duration) *service.ChainCompleter {
		chain := service.NewChainCompleter()
		for _, p := range service.ParseModelList(cfg.LLMProviders) {
			switch p {
			case "claude":
				if cfg.LLMBridgeToken == "" {
					log.Fatalf("LLM_PROVIDERS has claude but LLM_BRIDGE_TOKEN is empty (see tools/llm-bridge)")
				}
				chain.Add(p, service.NewBridgeCompleter(cfg.LLMBridgeURL, cfg.LLMBridgeToken, p, cfg.ClaudeModel, timeout))
			case "gemini":
				if cfg.GeminiAPIKey == "" {
					log.Printf("llm providers: skipping gemini, GEMINI_API_KEY is empty")
					continue
				}
				chain.Add(p, service.NewGeminiCompleter(cfg.GeminiAPIKey, cfg.GeminiModel, temperature, timeout))
			case "openrouter":
				if cfg.OpenRouterAPIKey == "" {
					continue
				}
				c, err := service.NewOpenRouterCompleter(cfg.OpenRouterAPIKey, append([]string{openRouterModel}, fallbacks...), temperature, cfg.AllowPaidModels, timeout)
				if err != nil {
					log.Fatalf("openrouter: %v", err)
				}
				chain.Add(p, c)
			default:
				log.Fatalf("unknown LLM provider %q in LLM_PROVIDERS (use claude, gemini, openrouter)", p)
			}
		}
		return chain
	}
	var graderLLM service.LLMCompleter
	graderModel := cfg.GraderModel
	if graderModel == "" {
		graderModel = cfg.OpenRouterModel
	}
	// temperature 0: grading should be as repeatable as possible. Free models answered the
	// rubric prompt in 13–50 s in testing, so allow up to 120 s.
	if chain := newLLM(graderModel, 0, 120*time.Second); chain.Len() > 0 {
		graderLLM = chain
		log.Printf("llm providers: %v", chain.Names())
	} else {
		log.Printf("llm providers: none; IELTS transcript criteria will not be assessed")
	}
	var pitchAnalyzer service.PitchAnalyzer
	if cfg.PitchPython != "" {
		pitchAnalyzer = service.NewScriptPitchAnalyzer(cfg.PitchPython, cfg.PitchScript, rubricCfg.Pronunciation)
	}
	speakingGrader := service.NewSpeakingGrader(rubricCfg, graderLLM, pitchAnalyzer)
	pronunciationRepo := repository.NewPronunciationRepository(pool)
	pronunciationService := service.NewPronunciationService(pronunciationScorer, speakingGrader, audioStorage, pronunciationRepo)
	switch {
	case cfg.Transcriber == "whisper" && cfg.LLMBridgeToken != "":
		pronunciationService.SetTranscriber(service.NewBridgeTranscriber(cfg.LLMBridgeURL, cfg.LLMBridgeToken))
		log.Printf("transcriber: whisper through the LLM bridge (falls back to Azure recognition)")
	case cfg.Transcriber == "whisper":
		log.Printf("transcriber: azure (TRANSCRIBER=whisper needs LLM_BRIDGE_TOKEN, see tools/llm-bridge)")
	default:
		log.Printf("transcriber: azure")
	}
	// IELTS question sets: seed bank on start, new sets written by the free LLM when a
	// learner is close to the end of the bank.
	questionSetRepo := repository.NewQuestionSetRepository(pool)
	var questionGen service.QuestionSetGenerator
	if graderLLM != nil {
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
	progressHandler := handler.NewProgressHandler(service.NewProgressService(repository.NewProgressRepository(pool)))
	pronunciationHandler := handler.NewPronunciationHandler(pronunciationService, ieltsQuestionService)
	// Finish the background LLM step of attempts left pending by a restart.
	if n, err := pronunciationService.ResumePending(context.Background()); err != nil {
		log.Printf("speaking rubric: resume pending grading: %v", err)
	} else if n > 0 {
		log.Printf("speaking rubric: resumed grading of %d attempts", n)
	}

	sentenceGenerator := service.NewLLMSentenceGenerator(newLLM(cfg.OpenRouterModel, 0.9, 90*time.Second))
	practiceSentenceRepo := repository.NewPracticeSentenceRepository(pool)
	// Generated sentences have at least as many words as the Pronunciation criterion needs.
	practiceSentenceService := service.NewPracticeSentenceService(sentenceGenerator, practiceSentenceRepo, rubricCfg.Pronunciation.Thresholds.MinWords)
	practiceHandler := handler.NewPracticeHandler(practiceSentenceService)

	// Spaced-repetition review of the words said wrongly in attempts.
	reviewService := service.NewReviewService(repository.NewReviewRepository(pool), pronunciationScorer)
	pronunciationService.SetReviews(reviewService)
	reviewHandler := handler.NewReviewHandler(reviewService)

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
	handler.RegisterProgressRoutes(api, progressHandler, jwtAuth)
	handler.RegisterReviewRoutes(api, reviewHandler, jwtAuth)

	e.GET("/healthz", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	log.Fatal(e.Start(":" + cfg.Port))
}
