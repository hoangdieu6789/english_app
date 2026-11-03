package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// OpenRouterCompleter is the LLM behind the speaking rubric's transcript criteria.
// It reuses the OpenRouter endpoint and message types of the sentence generator.
type OpenRouterCompleter struct {
	apiKey     string
	model      string
	httpClient *http.Client
	endpoint   string
}

func NewOpenRouterCompleter(apiKey, model string) *OpenRouterCompleter {
	return &OpenRouterCompleter{
		apiKey: apiKey,
		model:  model,
		// Free OpenRouter models answered the ~30k-char rubric prompt in about 55 s in testing.
		httpClient: &http.Client{Timeout: 120 * time.Second},
		endpoint:   openRouterURL,
	}
}

type openRouterGradeRequest struct {
	Model       string              `json:"model"`
	Messages    []openRouterMessage `json:"messages"`
	Temperature float64             `json:"temperature"`
}

func (c *OpenRouterCompleter) Complete(ctx context.Context, system, user string) (string, error) {
	reqBody, err := json.Marshal(openRouterGradeRequest{
		Model: c.model,
		Messages: []openRouterMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		Temperature: 0, // grading should be as repeatable as possible
	})
	if err != nil {
		return "", fmt.Errorf("marshal openrouter request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return "", fmt.Errorf("build openrouter request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("call openrouter api: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("openrouter api returned status %d", resp.StatusCode)
	}

	var chatResp openRouterChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&chatResp); err != nil {
		return "", fmt.Errorf("decode openrouter response: %w", err)
	}
	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("openrouter returned no choices")
	}
	return chatResp.Choices[0].Message.Content, nil
}
