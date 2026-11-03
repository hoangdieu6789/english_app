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

// DefaultGeminiModel is an alias that always points to the current Flash model, which is
// in the Gemini API free tier.
const DefaultGeminiModel = "gemini-flash-latest"

const geminiAPIBase = "https://generativelanguage.googleapis.com/v1beta/models/"

// GeminiCompleter calls the Gemini API directly with an API key from Google AI Studio.
// Free-tier limits are per project and per model (see aistudio.google.com/rate-limit); a
// Google AI Pro subscription does not raise them.
type GeminiCompleter struct {
	apiKey      string
	model       string
	temperature float64
	baseURL     string // overridable in tests
	client      *http.Client
}

func NewGeminiCompleter(apiKey, model string, temperature float64, timeout time.Duration) *GeminiCompleter {
	if model == "" {
		model = DefaultGeminiModel
	}
	return &GeminiCompleter{
		apiKey:      apiKey,
		model:       model,
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

func (g *GeminiCompleter) Complete(ctx context.Context, system, user string) (string, error) {
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
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.baseURL+g.model+":generateContent", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", g.apiKey) // header, not URL, so the key never shows in logs

	started := time.Now()
	resp, err := g.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("gemini: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", fmt.Errorf("gemini: read response: %w", err)
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
		return "", fmt.Errorf("gemini: status %d: invalid JSON", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		// 429 RESOURCE_EXHAUSTED = free quota used up; the chain moves on to the next provider.
		return "", fmt.Errorf("gemini: status %d %s: %s", resp.StatusCode, out.Error.Status, truncate(out.Error.Message, 300))
	}
	if out.PromptFeedback.BlockReason != "" {
		return "", fmt.Errorf("gemini: prompt blocked: %s", out.PromptFeedback.BlockReason)
	}
	if len(out.Candidates) == 0 {
		return "", errors.New("gemini: no candidates")
	}
	var sb strings.Builder
	for _, p := range out.Candidates[0].Content.Parts {
		if !p.Thought {
			sb.WriteString(p.Text)
		}
	}
	text := sb.String()
	if strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("gemini: empty answer (finish reason %s)", out.Candidates[0].FinishReason)
	}
	log.Printf("gemini: model=%s took=%s", g.model, time.Since(started).Round(time.Millisecond))
	return text, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
