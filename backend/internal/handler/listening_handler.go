package handler

import (
	"errors"
	"io"
	"log"
	"net/http"
	"path"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/i18n"
	"englishapp/backend/internal/middleware"
	"englishapp/backend/internal/repository"
	"englishapp/backend/internal/service"
)

// Listening lessons, dictation, text to speech and the word notebook (LISTEN-001).
type ListeningHandler struct {
	lessons     *service.LessonService
	notebook    *service.NotebookService
	tts         *service.TTSCache // nil: no text to speech
	audioPrefix string            // public URL prefix of the audio storage
}

func NewListeningHandler(lessons *service.LessonService, notebook *service.NotebookService, tts *service.TTSCache, audioPrefix string) *ListeningHandler {
	return &ListeningHandler{lessons: lessons, notebook: notebook, tts: tts, audioPrefix: strings.TrimRight(audioPrefix, "/")}
}

func RegisterListeningRoutes(api *echo.Group, h *ListeningHandler, jwtAuth *middleware.JWTAuth) {
	l := api.Group("/lessons", jwtAuth.RequireAuth)
	l.GET("", h.List)
	l.POST("", h.Import, echomw.BodyLimit("32M"))
	l.POST("/generate", h.Generate)
	l.GET("/:id", h.Get)
	l.DELETE("/:id", h.Delete)
	l.POST("/:id/progress", h.Progress)
	l.POST("/:id/dictation", h.Dictation)
	api.GET("/tts", h.TTS, jwtAuth.RequireAuth)
	n := api.Group("/notebook", jwtAuth.RequireAuth)
	n.GET("", h.Notebook)
	n.POST("", h.Save)
	n.GET("/:id/sentences", h.Sentences)
	n.POST("/:id/sentences", h.Grade)
	n.POST("/sentences/:id/speak", h.Speak)
}

func (h *ListeningHandler) audioURL(rel string) string {
	if rel == "" {
		return ""
	}
	return h.audioPrefix + "/" + filepath.ToSlash(rel)
}

func progressJSON(p *domain.LessonProgress) any {
	if p == nil {
		return nil
	}
	return map[string]any{"positionSec": p.PositionSec, "listenedAt": p.ListenedAt, "dictationBest": p.DictationBest, "linesDone": p.LinesDone}
}

func (h *ListeningHandler) lessonJSON(l *domain.Lesson, full bool, uid uuid.UUID) map[string]any {
	out := map[string]any{
		"id": l.ID, "source": l.Source, "kind": l.Kind, "title": l.Title, "topic": l.Topic, "band": l.Band,
		"durationSec": l.DurationSec, "status": l.Status, "error": l.Error, "credit": l.Credit,
		"lines": l.Lines, "createdAt": l.CreatedAt, "progress": progressJSON(l.Progress),
		"mine":      (l.OwnerID != nil && *l.OwnerID == uid) || (l.CreatedBy != nil && *l.CreatedBy == uid && l.Status == domain.LessonFailed),
		"canDelete": (l.OwnerID != nil && *l.OwnerID == uid) || (l.CreatedBy != nil && *l.CreatedBy == uid && l.Status == domain.LessonFailed),
	}
	if full {
		segs := l.Segments
		if segs == nil {
			segs = []domain.Segment{}
		}
		phrases := l.Phrases
		if phrases == nil {
			phrases = []string{}
		}
		out["segments"] = segs
		out["speakers"] = l.Speakers
		out["phrases"] = phrases
		out["audioUrl"] = h.audioURL(l.AudioPath)
		if l.AudioPath == "" {
			out["audioUrl"] = l.AudioURL
		}
		out["videoId"] = service.YouTubeID(l.VideoURL)
		out["sourceUrl"] = l.SourceURL
		out["timed"] = len(l.Segments) > 0 && l.Segments[0].Start != nil
	}
	return out
}

func (h *ListeningHandler) lessonErr(c echo.Context, err error, what string) error {
	lang := i18n.FromRequest(c)
	switch {
	case errors.Is(err, repository.ErrNotFound):
		return echo.NewHTTPError(http.StatusNotFound, "lesson not found")
	case errors.Is(err, service.ErrLessonInput):
		return echo.NewHTTPError(http.StatusBadRequest, i18n.T(lang, i18n.MsgLessonInvalid))
	case errors.Is(err, service.ErrLessonBusy):
		return echo.NewHTTPError(http.StatusConflict, i18n.T(lang, i18n.MsgLessonBusy))
	case errors.Is(err, service.ErrLessonNoMaker):
		return echo.NewHTTPError(http.StatusServiceUnavailable, i18n.T(lang, i18n.MsgLessonOff))
	}
	log.Printf("lessons: %s: %v", what, err)
	return echo.NewHTTPError(http.StatusInternalServerError, "failed to "+what)
}

func idParam(c echo.Context) (uuid.UUID, uuid.UUID, error) {
	uid, err := requireUserID(c)
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return uuid.Nil, uuid.Nil, echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	return uid, id, nil
}

// List returns the lessons of one source (?source=ai|voa|mine).
func (h *ListeningHandler) List(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	ls, err := h.lessons.List(c.Request().Context(), uid, c.QueryParam("source"))
	if err != nil {
		return h.lessonErr(c, err, "load lessons")
	}
	out := make([]map[string]any, 0, len(ls))
	for _, l := range ls {
		out = append(out, h.lessonJSON(l, false, uid))
	}
	return c.JSON(http.StatusOK, map[string]any{"lessons": out, "canGenerate": h.lessons.CanGenerate()})
}

func (h *ListeningHandler) Get(c echo.Context) error {
	uid, id, err := idParam(c)
	if err != nil {
		return err
	}
	l, err := h.lessons.Get(c.Request().Context(), uid, id)
	if err != nil {
		return h.lessonErr(c, err, "load the lesson")
	}
	return c.JSON(http.StatusOK, h.lessonJSON(l, true, uid))
}

type generateRequest struct {
	Kind  string  `json:"kind"`
	Topic string  `json:"topic"`
	Band  float32 `json:"band"`
}

func (h *ListeningHandler) Generate(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	var req generateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	l, err := h.lessons.Generate(c.Request().Context(), uid, service.GenerateInput{Kind: req.Kind, Topic: req.Topic, Band: req.Band})
	if err != nil {
		return h.lessonErr(c, err, "make the lesson")
	}
	return c.JSON(http.StatusAccepted, h.lessonJSON(l, false, uid))
}

// Import adds a VOA or own lesson: JSON, or multipart with an "audio" file.
func (h *ListeningHandler) Import(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	in := service.ImportInput{
		Source: c.FormValue("source"), Kind: c.FormValue("kind"), Title: c.FormValue("title"),
		Transcript: c.FormValue("transcript"), AudioURL: c.FormValue("audioUrl"), VideoURL: c.FormValue("videoUrl"),
		SourceURL: c.FormValue("sourceUrl"),
	}
	if strings.HasPrefix(c.Request().Header.Get(echo.HeaderContentType), echo.MIMEApplicationJSON) {
		var req struct {
			Source, Kind, Title, Transcript, AudioURL, VideoURL, SourceURL string
		}
		if err := c.Bind(&req); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
		}
		in = service.ImportInput{Source: req.Source, Kind: req.Kind, Title: req.Title, Transcript: req.Transcript, AudioURL: req.AudioURL, VideoURL: req.VideoURL, SourceURL: req.SourceURL}
	} else if fh, err := c.FormFile("audio"); err == nil {
		f, err := fh.Open()
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "cannot read audio file")
		}
		defer f.Close()
		if in.Audio, err = io.ReadAll(io.LimitReader(f, 30<<20+1)); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "cannot read audio file")
		}
		in.AudioExt = strings.ToLower(path.Ext(fh.Filename))
	}
	l, err := h.lessons.Import(c.Request().Context(), uid, in)
	if err != nil {
		return h.lessonErr(c, err, "add the lesson")
	}
	return c.JSON(http.StatusCreated, h.lessonJSON(l, true, uid))
}

func (h *ListeningHandler) Delete(c echo.Context) error {
	uid, id, err := idParam(c)
	if err != nil {
		return err
	}
	if err := h.lessons.Delete(c.Request().Context(), uid, id); err != nil {
		return h.lessonErr(c, err, "delete the lesson")
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *ListeningHandler) Progress(c echo.Context) error {
	uid, id, err := idParam(c)
	if err != nil {
		return err
	}
	var req struct {
		PositionSec float32 `json:"positionSec"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if err := h.lessons.SaveProgress(c.Request().Context(), uid, id, req.PositionSec); err != nil {
		return h.lessonErr(c, err, "save progress")
	}
	return c.NoContent(http.StatusNoContent)
}

type dictationRequest struct {
	Segment     int     `json:"segment"`
	Typed       string  `json:"typed"`
	Accuracy    float32 `json:"accuracy"`
	Done        bool    `json:"done"`
	RunAccuracy float32 `json:"runAccuracy"`
	Lines       int     `json:"lines"`
}

func (h *ListeningHandler) Dictation(c echo.Context) error {
	uid, id, err := idParam(c)
	if err != nil {
		return err
	}
	var req dictationRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if err := h.lessons.Dictation(c.Request().Context(), uid, id, req.Segment, req.Typed, req.Accuracy, req.Done, req.RunAccuracy, req.Lines); err != nil {
		return h.lessonErr(c, err, "save the dictation")
	}
	return c.NoContent(http.StatusNoContent)
}

var ttsVoices = func() map[string]bool {
	m := map[string]bool{}
	for _, v := range append(append([]string{}, service.TTSVoicesFemale...), service.TTSVoicesMale...) {
		m[v] = true
	}
	return m
}()

// TTS returns an MP3 of ?text= (?slow=1 at 75 % speed, ?voice= one of the lesson voices).
func (h *ListeningHandler) TTS(c echo.Context) error {
	if h.tts == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, i18n.T(i18n.FromRequest(c), i18n.MsgLessonOff))
	}
	voice := c.QueryParam("voice")
	if voice != "" && !ttsVoices[voice] {
		return echo.NewHTTPError(http.StatusBadRequest, "unknown voice")
	}
	rel, err := h.tts.Path(c.Request().Context(), c.QueryParam("text"), voice, c.QueryParam("slow") == "1")
	if err != nil {
		if strings.Contains(err.Error(), "characters") {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		log.Printf("tts: %v", err)
		return echo.NewHTTPError(http.StatusBadGateway, "text to speech failed")
	}
	c.Response().Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	return c.File(h.tts.Full(rel))
}

// ---------- notebook ----------

func notebookCardJSON(n *domain.NotebookCard) map[string]any {
	return map[string]any{
		"id": n.ID, "word": n.Word, "kind": n.Kind, "pos": n.POS, "ipa": n.IPA, "meaning": n.Meaning,
		"exampleEn": n.ExampleEN, "exampleMine": n.ExampleMine, "exampleScore": n.ExampleScore,
		"context": n.Context, "lessonId": n.LessonID, "lessonTitle": n.LessonTitle, "band": n.Band,
		"misses": n.Misses, "lastScore": n.LastScore, "intervalDays": n.IntervalDays, "reps": n.Reps,
		"dueAt": n.DueAt, "createdAt": n.CreatedAt,
	}
}

func sentenceJSON(s *domain.NotebookSentence) map[string]any {
	return map[string]any{
		"id": s.ID, "cardId": s.ReviewWordID, "text": s.Text, "score": s.Score, "verdict": s.Verdict,
		"accepted": s.Accepted, "pronScore": s.PronScore, "createdAt": s.CreatedAt,
	}
}

func (h *ListeningHandler) notebookErr(c echo.Context, err error, what string) error {
	lang := i18n.FromRequest(c)
	switch {
	case errors.Is(err, repository.ErrNotFound):
		return echo.NewHTTPError(http.StatusNotFound, "not found")
	case errors.Is(err, service.ErrNotebookInput):
		if strings.Contains(err.Error(), "sentence") {
			return echo.NewHTTPError(http.StatusBadRequest, i18n.T(lang, i18n.MsgSentenceInvalid))
		}
		return echo.NewHTTPError(http.StatusBadRequest, i18n.T(lang, i18n.MsgSavedInvalid))
	case errors.Is(err, service.ErrLessonNoMaker):
		return echo.NewHTTPError(http.StatusServiceUnavailable, i18n.T(lang, i18n.MsgLessonOff))
	}
	var noSpeech *service.NoSpeechError
	if errors.As(err, &noSpeech) {
		return echo.NewHTTPError(http.StatusUnprocessableEntity, i18n.T(lang, i18n.MsgNoSpeech))
	}
	log.Printf("notebook: %s: %v", what, err)
	if strings.Contains(err.Error(), "grade sentence") {
		return echo.NewHTTPError(http.StatusBadGateway, i18n.T(lang, i18n.MsgLLMFailed))
	}
	return echo.NewHTTPError(http.StatusInternalServerError, "failed to "+what)
}

func (h *ListeningHandler) Notebook(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	cards, err := h.notebook.List(c.Request().Context(), uid, i18n.FromRequest(c))
	if err != nil {
		return h.notebookErr(c, err, "load the notebook")
	}
	out := make([]map[string]any, 0, len(cards))
	for _, n := range cards {
		out = append(out, notebookCardJSON(n))
	}
	return c.JSON(http.StatusOK, map[string]any{"cards": out, "passScore": service.SentencePassScore})
}

type saveRequest struct {
	Text     string     `json:"text"`
	Context  string     `json:"context"`
	LessonID *uuid.UUID `json:"lessonId"`
}

func (h *ListeningHandler) Save(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	var req saveRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	card, lookedUp, err := h.notebook.Save(c.Request().Context(), uid, i18n.FromRequest(c), service.SaveInput{Text: req.Text, Context: req.Context, LessonID: req.LessonID})
	if err != nil {
		return h.notebookErr(c, err, "save the word")
	}
	return c.JSON(http.StatusOK, map[string]any{"card": notebookCardJSON(card), "lookedUp": lookedUp})
}

func (h *ListeningHandler) Sentences(c echo.Context) error {
	uid, id, err := idParam(c)
	if err != nil {
		return err
	}
	ss, err := h.notebook.Sentences(c.Request().Context(), uid, id)
	if err != nil {
		return h.notebookErr(c, err, "load sentences")
	}
	out := make([]map[string]any, 0, len(ss))
	for _, s := range ss {
		out = append(out, sentenceJSON(s))
	}
	return c.JSON(http.StatusOK, map[string]any{"sentences": out})
}

func (h *ListeningHandler) Grade(c echo.Context) error {
	uid, id, err := idParam(c)
	if err != nil {
		return err
	}
	var req struct {
		Text string `json:"text"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	s, err := h.notebook.GradeSentence(c.Request().Context(), uid, id, i18n.FromRequest(c), req.Text)
	if err != nil {
		return h.notebookErr(c, err, "grade the sentence")
	}
	return c.JSON(http.StatusOK, sentenceJSON(s))
}

func (h *ListeningHandler) Speak(c echo.Context) error {
	uid, id, err := idParam(c)
	if err != nil {
		return err
	}
	fh, err := c.FormFile("audio")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "missing audio file")
	}
	if fh.Size > maxAudioUploadBytes {
		return echo.NewHTTPError(http.StatusRequestEntityTooLarge, "audio file too large")
	}
	f, err := fh.Open()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "cannot read audio file")
	}
	defer f.Close()
	wav, err := io.ReadAll(f)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "cannot read audio file")
	}
	res, err := h.notebook.Speak(c.Request().Context(), uid, id, wav)
	if err != nil {
		return h.notebookErr(c, err, "score the sentence")
	}
	return c.JSON(http.StatusOK, map[string]any{
		"sentence": sentenceJSON(res.Sentence), "score": res.Score, "accuracy": res.Accuracy,
		"fluency": res.Fluency, "words": res.Words, "heard": res.Heard,
	})
}
