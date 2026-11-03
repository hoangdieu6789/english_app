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
	"time"
)

// BridgeCompleter calls a CLI-based LLM (Claude Code or Gemini CLI) through the local LLM
// bridge (tools/llm-bridge). The CLIs use the subscription plan logged in on the host Mac,
// which the API container cannot reach directly (Claude Code keeps its login in the Keychain).
type BridgeCompleter struct {
	url      string
	token    string
	provider string // "claude" or "gemini"
	model    string // empty = the CLI's default model
	timeout  time.Duration
	client   *http.Client
}

func NewBridgeCompleter(baseURL, token, provider, model string, timeout time.Duration) *BridgeCompleter {
	return &BridgeCompleter{
		url:      baseURL + "/v1/complete",
		token:    token,
		provider: provider,
		model:    model,
		timeout:  timeout,
		// A little longer than the CLI timeout sent to the bridge, so the bridge reports it.
		client: &http.Client{Timeout: timeout + 10*time.Second},
	}
}

var _ LLMCompleter = (*BridgeCompleter)(nil)

func (b *BridgeCompleter) Complete(ctx context.Context, system, user string) (string, error) {
	body, err := json.Marshal(map[string]any{
		"provider":  b.provider,
		"model":     b.model,
		"system":    system,
		"user":      user,
		"timeout_s": int(b.timeout.Seconds()),
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+b.token)

	started := time.Now()
	resp, err := b.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("llm bridge (%s): %w", b.provider, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", fmt.Errorf("llm bridge (%s): read response: %w", b.provider, err)
	}
	var out struct {
		Text  string `json:"text"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("llm bridge (%s): status %d: invalid JSON", b.provider, resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("llm bridge (%s): status %d: %s", b.provider, resp.StatusCode, out.Error)
	}
	if out.Text == "" {
		return "", fmt.Errorf("llm bridge (%s): empty answer", b.provider)
	}
	log.Printf("llm bridge: provider=%s model=%s took=%s", b.provider, b.modelName(), time.Since(started).Round(time.Millisecond))
	return out.Text, nil
}

func (b *BridgeCompleter) modelName() string {
	if b.model == "" {
		return "default"
	}
	return b.model
}

// ChainCompleter tries each LLM in order and returns the first answer, so a usage limit or
// an outage on one provider (Claude Code, Gemini CLI, OpenRouter) falls back to the next.
type ChainCompleter struct {
	names []string
	items []LLMCompleter
}

func NewChainCompleter() *ChainCompleter { return &ChainCompleter{} }

// Add appends a provider; nil completers are skipped.
func (c *ChainCompleter) Add(name string, llm LLMCompleter) {
	if llm != nil {
		c.names = append(c.names, name)
		c.items = append(c.items, llm)
	}
}

func (c *ChainCompleter) Len() int { return len(c.items) }

func (c *ChainCompleter) Names() []string { return append([]string(nil), c.names...) }

var _ LLMCompleter = (*ChainCompleter)(nil)

func (c *ChainCompleter) Complete(ctx context.Context, system, user string) (string, error) {
	if len(c.items) == 0 {
		return "", errors.New("no LLM provider configured")
	}
	var errs []error
	for i, llm := range c.items {
		text, err := llm.Complete(ctx, system, user)
		if err == nil {
			return text, nil
		}
		errs = append(errs, fmt.Errorf("%s: %w", c.names[i], err))
		if ctx.Err() != nil {
			break
		}
		if i+1 < len(c.items) {
			log.Printf("llm chain: %s failed (%v); trying %s", c.names[i], err, c.names[i+1])
		}
	}
	return "", errors.Join(errs...)
}
