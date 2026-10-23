package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

const openRouterURL = "https://openrouter.ai/api/v1/chat/completions"

type OpenRouterSentenceGenerator struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

func NewOpenRouterSentenceGenerator(apiKey, model string) *OpenRouterSentenceGenerator {
	return &OpenRouterSentenceGenerator{
		apiKey:     apiKey,
		model:      model,
		httpClient: &http.Client{},
	}
}

type openRouterChatRequest struct {
	Model    string              `json:"model"`
	Messages []openRouterMessage `json:"messages"`
}

type openRouterMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openRouterChatResponse struct {
	Choices []struct {
		Message openRouterMessage `json:"message"`
	} `json:"choices"`
}

var jsonObjectPattern = regexp.MustCompile(`\{[\s\S]*\}`)

func (g *OpenRouterSentenceGenerator) Generate(ctx context.Context, avoidRecent []string) (*GeneratedSentence, error) {
	prompt := buildSentencePrompt(avoidRecent)

	reqBody, err := json.Marshal(openRouterChatRequest{
		Model: g.model,
		Messages: []openRouterMessage{
			{Role: "user", Content: prompt},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("marshal openrouter request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openRouterURL, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("build openrouter request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+g.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call openrouter api: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openrouter api returned status %d", resp.StatusCode)
	}

	var chatResp openRouterChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&chatResp); err != nil {
		return nil, fmt.Errorf("decode openrouter response: %w", err)
	}
	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("openrouter returned no choices")
	}

	return parseGeneratedSentence(chatResp.Choices[0].Message.Content)
}

func buildSentencePrompt(avoidRecent []string) string {
	var sb strings.Builder
	sb.WriteString("You generate one English practice sentence for a Vietnamese-speaking English learner doing shadowing/pronunciation practice.\n")
	sb.WriteString("Requirements: natural everyday conversational English, 6-14 words, appropriate for intermediate learners.\n")
	sb.WriteString("Respond with ONLY a JSON object, no markdown, no explanation, in this exact shape:\n")
	sb.WriteString(`{"text": "...", "phonetic": "IPA transcription", "gloss": "Vietnamese translation"}` + "\n")
	if len(avoidRecent) > 0 {
		sb.WriteString("Do not repeat or closely resemble any of these previously used sentences:\n")
		for _, s := range avoidRecent {
			sb.WriteString("- " + s + "\n")
		}
	}
	return sb.String()
}

func parseGeneratedSentence(content string) (*GeneratedSentence, error) {
	match := jsonObjectPattern.FindString(content)
	if match == "" {
		return nil, fmt.Errorf("no JSON object found in llm response")
	}

	var parsed struct {
		Text     string `json:"text"`
		Phonetic string `json:"phonetic"`
		Gloss    string `json:"gloss"`
	}
	if err := json.Unmarshal([]byte(match), &parsed); err != nil {
		return nil, fmt.Errorf("parse llm json: %w", err)
	}
	if parsed.Text == "" {
		return nil, fmt.Errorf("llm response missing sentence text")
	}

	return &GeneratedSentence{
		Text:     parsed.Text,
		Phonetic: parsed.Phonetic,
		Gloss:    parsed.Gloss,
	}, nil
}
