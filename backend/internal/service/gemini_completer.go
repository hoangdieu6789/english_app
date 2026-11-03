package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// DefaultGeminiModels are tried in order. gemini-flash-latest always points to the current
// Flash model (free tier) but is often overloaded (503); gemini-3-flash-preview answered
// when it was (2026-11-03). The 2.5 models are closed to new users.
const DefaultGeminiModels = "gemini-flash-latest,gemini-3-flash-preview"

const geminiAPIBase = "https://generativelanguage.googleapis.com/v1beta/models/"

// GeminiCompleter calls the Gemini API directly with an API key from Google AI Studio.
// Free-tier limits are per project and per model (see aistudio.google.com/rate-limit); a
// Google AI Pro subscription does not raise them.
type GeminiCompleter struct {
	apiKey      string
	models      []string // tried in order when a model is busy, out of quota or gone
	temperature float64
	baseURL     string // overridable in tests
	client      *http.Client
}

// NewGeminiCompleter takes a comma-separated model list; empty = DefaultGeminiModels.
func NewGeminiCompleter(apiKey, models string, temperature float64, timeout time.Duration) *GeminiCompleter {
	list := ParseModelList(models)
	if len(list) == 0 {
		list = ParseModelList(DefaultGeminiModels)
	}
	return &GeminiCompleter{
		apiKey:      apiKey,
		models:      list,
		temperature: temperature,
		baseURL:     geminiAPIBase,
		client:      &http.Client{Timeout: timeout},
	}
}

var _ LLMCompleter = (*GeminiCompleter)(nil)

type geminiPart struct {
	Text    string `json:"text"`
	Thought bool   `json:"thought,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

// geminiStatusError is a non-200 answer; retryable ones move on to the next model.
type geminiStatusError struct {
	code int
	msg  string
}

func (e *geminiStatusError) Error() string { return e.msg }

func (e *geminiStatusError) retryable() bool {
	// 404: model closed to new users; 429: free quota of this model used up; 5xx: overloaded.
	return e.code == http.StatusNotFound || e.code == http.StatusTooManyRequests || e.code >= 500
}

func (g *GeminiCompleter) Complete(ctx context.Context, system, user string) (string, error) {
	var errs []error
	for _, model := range g.models {
		text, err := g.completeWith(ctx, model, system, user)
		if err == nil {
			return text, nil
		}
		errs = append(errs, err)
		var se *geminiStatusError
		if ctx.Err() != nil || !errors.As(err, &se) || !se.retryable() {
			break
		}
	}
	return "", errors.Join(errs...)
}

func (g *GeminiCompleter) completeWith(ctx context.Context, model, system, user string) (string, error) {
	reqBody := map[string]any{
		"contents":         []geminiContent{{Role: "user", Parts: []geminiPart{{Text: user}}}},
		"generationConfig": map[string]any{"temperature": g.temperature},
	}
	if system != "" {
		reqBody["systemInstruction"] = geminiContent{Parts: []geminiPart{{Text: system}}}
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.baseURL+model+":generateContent", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", g.apiKey) // header, not URL, so the key never shows in logs

	started := time.Now()
	resp, err := g.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("gemini %s: %w", model, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", fmt.Errorf("gemini %s: read response: %w", model, err)
	}

	var out struct {
		Candidates []struct {
			Content      geminiContent `json:"content"`
			FinishReason string        `json:"finishReason"`
		} `json:"candidates"`
		PromptFeedback struct {
			BlockReason string `json:"blockReason"`
		} `json:"promptFeedback"`
		Error struct {
			Code    int    `json:"code"`
			Status  string `json:"status"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("gemini %s: status %d: invalid JSON", model, resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		// 429 RESOURCE_EXHAUSTED = free quota used up; the chain moves on to the next provider.
		return "", &geminiStatusError{code: resp.StatusCode, msg: fmt.Sprintf("gemini %s: status %d %s: %s", model, resp.StatusCode, out.Error.Status, truncate(out.Error.Message, 300))}
	}
	if out.PromptFeedback.BlockReason != "" {
		return "", fmt.Errorf("gemini %s: prompt blocked: %s", model, out.PromptFeedback.BlockReason)
	}
	if len(out.Candidates) == 0 {
		return "", fmt.Errorf("gemini %s: no candidates", model)
	}
	var sb strings.Builder
	for _, p := range out.Candidates[0].Content.Parts {
		if !p.Thought {
			sb.WriteString(p.Text)
		}
	}
	text := sb.String()
	if strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("gemini %s: empty answer (finish reason %s)", model, out.Candidates[0].FinishReason)
	}
	log.Printf("gemini: model=%s took=%s", model, time.Since(started).Round(time.Millisecond))
	return text, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
