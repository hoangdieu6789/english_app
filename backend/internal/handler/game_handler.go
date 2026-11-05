package handler

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/i18n"
	"englishapp/backend/internal/middleware"
	"englishapp/backend/internal/service"
)

// GameHandler serves the vocabulary games (/api/games).
type GameHandler struct {
	svc *service.GameService
}

func NewGameHandler(svc *service.GameService) *GameHandler {
	return &GameHandler{svc: svc}
}

func RegisterGameRoutes(api *echo.Group, h *GameHandler, jwtAuth *middleware.JWTAuth) {
	g := api.Group("/games", jwtAuth.RequireAuth)
	g.GET("", h.Summary)
	g.GET("/deck", h.Deck)
	g.GET("/level", h.Level)
	g.POST("/results", h.Save)
}

func gameCardJSON(c *domain.GameCard) map[string]any {
	return map[string]any{
		"id": c.ID, "word": c.Word, "band": c.Band, "pos": c.POS, "ipa": c.IPA, "meaning": c.Meaning,
		"exampleEn": c.ExampleEN, "exampleTranslation": c.ExampleTranslation, "missed": c.Missed,
	}
}

func gameCardsJSON(cs []*domain.GameCard) []map[string]any {
	out := make([]map[string]any, 0, len(cs))
	for _, c := range cs {
		out = append(out, gameCardJSON(c))
	}
	return out
}

func gameDeckJSON(d *service.GameDeck) map[string]any {
	return map[string]any{
		"deck": d.Deck, "cards": gameCardsJSON(d.Cards), "distractors": gameCardsJSON(d.Distractors),
		"level": d.Level, "levelBand": d.LevelBand,
	}
}

func (h *GameHandler) deckError(c echo.Context, err error) error {
	lang := i18n.FromRequest(c)
	switch {
	case errors.Is(err, service.ErrUnknownDeck):
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	case errors.Is(err, service.ErrDeckTooSmall):
		return echo.NewHTTPError(http.StatusConflict, i18n.T(lang, i18n.MsgDeckTooSmall))
	default:
		log.Printf("games deck: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load the words")
	}
}

// Summary: best scores, the vocab level and the size of "My words".
func (h *GameHandler) Summary(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	sum, err := h.svc.Summary(c.Request().Context(), uid, i18n.FromRequest(c))
	if err != nil {
		log.Printf("games summary: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load the games")
	}
	bests := make([]map[string]any, 0, len(sum.Bests))
	for _, b := range sum.Bests {
		bests = append(bests, map[string]any{"game": b.Game, "best": b.Best, "plays": b.Plays, "lastPlayed": b.LastPlayed})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"bests": bests, "level": sum.Level, "levelBand": sum.LevelBand, "levels": service.GameLevels, "myWords": sum.MyWords,
	})
}

// Deck: GET /games/deck?deck=mine|band-4..band-8&n=40
func (h *GameHandler) Deck(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	n, _ := strconv.Atoi(c.QueryParam("n"))
	d, err := h.svc.Deck(c.Request().Context(), uid, i18n.FromRequest(c), c.QueryParam("deck"), n)
	if err != nil {
		return h.deckError(c, err)
	}
	return c.JSON(http.StatusOK, gameDeckJSON(d))
}

// Level: GET /games/level?level=N (no level = the learner's start level; "placed" tells
// whether it was saved before or estimated from their band).
func (h *GameHandler) Level(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	level, _ := strconv.Atoi(c.QueryParam("level"))
	placed := true
	if level == 0 {
		if level, placed, err = h.svc.StartLevel(ctx, uid); err != nil {
			return h.deckError(c, err)
		}
	}
	d, err := h.svc.LevelDeck(ctx, i18n.FromRequest(c), level)
	if err != nil {
		return h.deckError(c, err)
	}
	out := gameDeckJSON(d)
	out["placed"] = placed
	out["levels"] = service.GameLevels
	return c.JSON(http.StatusOK, out)
}

type gameResultRequest struct {
	Game       string `json:"game"`
	Deck       string `json:"deck"`
	Score      int    `json:"score"`
	Correct    int    `json:"correct"`
	Total      int    `json:"total"`
	DurationMS int    `json:"durationMs"`
	Level      int    `json:"level"`
	Answers    []struct {
		WordID  uuid.UUID `json:"wordId"`
		Correct bool      `json:"correct"`
	} `json:"answers"`
}

// Save: POST /games/results; returns the best score of the game.
func (h *GameHandler) Save(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	var req gameResultRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	p := &domain.GamePlay{
		UserID: uid, Game: req.Game, Deck: req.Deck, Score: req.Score, Correct: req.Correct,
		Total: req.Total, DurationMS: req.DurationMS, Level: req.Level,
	}
	for _, a := range req.Answers {
		p.Answers = append(p.Answers, domain.GameAnswer{WordID: a.WordID, Correct: a.Correct})
	}
	best, err := h.svc.Save(c.Request().Context(), p)
	switch {
	case errors.Is(err, service.ErrUnknownGame), errors.Is(err, service.ErrUnknownDeck), errors.Is(err, service.ErrBadPlay):
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	case err != nil:
		log.Printf("games save: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to save the game")
	}
	resp := map[string]any{"best": best, "newBest": best == req.Score && req.Score > 0}
	if req.Level > 0 {
		band, err := h.svc.LevelBandOf(c.Request().Context(), req.Level)
		if err == nil {
			resp["levelBand"] = band
		}
	}
	return c.JSON(http.StatusCreated, resp)
}
