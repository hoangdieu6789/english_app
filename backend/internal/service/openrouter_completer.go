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

const openRouterURL = "https://openrouter.ai/api/v1/chat/completions"

// Free defaults (see docs/speaking-rubric-plan.md, section 3 "Cost"). Measured on the rubric prompt:
// nemotron-3.5-super-vl with reasoning off answered in ~13 s with the same bands as with
// reasoning on (~49 s); gemma-4-31b took ~31 s and is the fallback when the first is busy.
const (
	DefaultOpenRouterModel          = "nvidia/nemotron-3.5-super-vl:free"
	DefaultOpenRouterFallbackModels = "google/gemma-4-31b-it:free"
)

// ParseModelList splits a comma-separated model list and drops empty entries.
func ParseModelList(s string) []string {
	var out []string
	for _, m := range strings.Split(s, ",") {
		if m = strings.TrimSpace(m); m != "" {
			out = append(out, m)
		}
	}
	return out
}

// IsFreeModel reports whether an OpenRouter model id is a free variant.
func IsFreeModel(model string) bool { return strings.HasSuffix(model, ":free") }

// OpenRouterCompleter calls OpenRouter chat completions. It is shared by the speaking
// grader and the practice sentence generator.
//
// Cost and speed:
//   - Only ":free" models are accepted unless allowPaid is set, so a typo in .env cannot
//     start billing. OpenRouter bills the model that finally answers, so every fallback
//     model must be free too.
//   - The models after the first are sent as OpenRouter fallbacks ("models"), tried in
//     order inside the same request when a free provider is rate-limited or down.
//   - Reasoning is turned off: it made grading ~3.6x slower without changing the bands.
type OpenRouterCompleter struct {
	apiKey      string
	models      []string
	temperature float64
	httpClient  *http.Client
	endpoint    string
}

func NewOpenRouterCompleter(apiKey string, models []string, temperature float64, allowPaid bool, timeout time.Duration) (*OpenRouterCompleter, error) {
	if len(models) == 0 {
		return nil, fmt.Errorf("openrouter: no model configured")
	}
	seen := map[string]bool{}
	uniq := models[:0:0]
	for _, m := range models {
		if !seen[m] {
			seen[m] = true
			uniq = append(uniq, m)
		}
	}
	models = uniq
	if !allowPaid {
		for _, m := range models {
			if !IsFreeModel(m) {
				return nil, fmt.Errorf("openrouter: model %q is not a free (:free) model; set ALLOW_PAID_MODELS=true to use it", m)
			}
		}
	}
	return &OpenRouterCompleter{
		apiKey:      apiKey,
		models:      models,
		temperature: temperature,
		httpClient:  &http.Client{Timeout: timeout},
		endpoint:    openRouterURL,
	}, nil
}

type openRouterMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openRouterReasoning struct {
	Enabled bool `json:"enabled"`
}

type openRouterRequest struct {
	Model       string              `json:"model"`
	Models      []string            `json:"models,omitempty"`
	Messages    []openRouterMessage `json:"messages"`
	Temperature float64             `json:"temperature"`
	Reasoning   openRouterReasoning `json:"reasoning"`
}

type openRouterChatResponse struct {
	Model   string `json:"model"`
	Choices []struct {
		Message openRouterMessage `json:"message"`
	} `json:"choices"`
	// A provider failure can come back as HTTP 200 with an error object and no choices.
	Error *struct {
		Code    any    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// errRetryable marks failures where another (fallback) model may succeed.
type errRetryable struct{ error }

// Complete sends an optional system prompt and one user prompt and returns the reply text.
// OpenRouter only falls back to the next model on an HTTP error. When the answer is a 200
// with an error body or empty text, Complete retries once with the fallback models only
// (one extra free request, only after a failure).
func (c *OpenRouterCompleter) Complete(ctx context.Context, system, user string) (string, error) {
	out, err := c.complete(ctx, c.models, system, user)
	var re errRetryable
	if err != nil && len(c.models) > 1 && errors.As(err, &re) {
		log.Printf("openrouter: %v; retrying with fallback models %v", err, c.models[1:])
		out, err = c.complete(ctx, c.models[1:], system, user)
	}
	return out, err
}

func (c *OpenRouterCompleter) complete(ctx context.Context, models []string, system, user string) (string, error) {
	body := openRouterRequest{Model: models[0], Temperature: c.temperature}
	if len(models) > 1 {
		body.Models = models
	}
	if system != "" {
		body.Messages = append(body.Messages, openRouterMessage{Role: "system", Content: system})
	}
	body.Messages = append(body.Messages, openRouterMessage{Role: "user", Content: user})

	reqBody, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("marshal openrouter request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return "", fmt.Errorf("build openrouter request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	start := time.Now()
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("call openrouter api: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		err := fmt.Errorf("openrouter api returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
		if resp.StatusCode >= 500 {
			return "", errRetryable{err}
		}
		return "", err // 4xx incl. 429 (quota): another free model would hit the same limit
	}

	var chatResp openRouterChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&chatResp); err != nil {
		return "", errRetryable{fmt.Errorf("decode openrouter response: %w", err)}
	}
	log.Printf("openrouter: model=%s took=%s", chatResp.Model, time.Since(start).Round(100*time.Millisecond))
	if chatResp.Error != nil {
		return "", errRetryable{fmt.Errorf("openrouter error %v: %s", chatResp.Error.Code, chatResp.Error.Message)}
	}
	if len(chatResp.Choices) == 0 || strings.TrimSpace(chatResp.Choices[0].Message.Content) == "" {
		return "", errRetryable{fmt.Errorf("openrouter returned no answer")}
	}
	return chatResp.Choices[0].Message.Content, nil
}
