package service

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBridgeCompleterSendsProviderAndToken(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/complete" || r.Header.Get("Authorization") != "Bearer secret-token-123456" {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"bad token"}`))
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{"text":"{\"ok\":true}","provider":"claude","took_ms":900}`))
	}))
	defer srv.Close()

	b := NewBridgeCompleter(srv.URL, "secret-token-123456", "claude", "sonnet", 120*time.Second)
	text, err := b.Complete(context.Background(), "sys", "user prompt")
	if err != nil {
		t.Fatal(err)
	}
	if text != `{"ok":true}` {
		t.Fatalf("text = %q", text)
	}
	if got["provider"] != "claude" || got["model"] != "sonnet" || got["system"] != "sys" || got["user"] != "user prompt" || got["timeout_s"] != float64(120) {
		t.Fatalf("request = %v", got)
	}

	bad := NewBridgeCompleter(srv.URL, "wrong", "claude", "", time.Second)
	if _, err := bad.Complete(context.Background(), "", "x"); err == nil || !strings.Contains(err.Error(), "401") {
		t.Fatalf("wrong token: err = %v", err)
	}
}

func TestBridgeCompleterReportsBridgeErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":"claude: usage limit reached"}`))
	}))
	defer srv.Close()
	_, err := NewBridgeCompleter(srv.URL, "t", "claude", "", time.Second).Complete(context.Background(), "", "x")
	if err == nil || !strings.Contains(err.Error(), "usage limit") {
		t.Fatalf("err = %v", err)
	}
}

type stubLLM struct {
	text  string
	err   error
	calls int
}

func (s *stubLLM) Complete(context.Context, string, string) (string, error) {
	s.calls++
	return s.text, s.err
}

func TestChainCompleterFallsBackInOrder(t *testing.T) {
	claude := &stubLLM{err: errors.New("usage limit")}
	gemini := &stubLLM{text: "from gemini"}
	openrouter := &stubLLM{text: "from openrouter"}
	chain := NewChainCompleter()
	chain.Add("claude", claude)
	chain.Add("gemini", gemini)
	chain.Add("skipped", nil)
	chain.Add("openrouter", openrouter)
	if chain.Len() != 3 {
		t.Fatalf("len = %d, want 3 (nil skipped)", chain.Len())
	}

	text, err := chain.Complete(context.Background(), "", "x")
	if err != nil || text != "from gemini" {
		t.Fatalf("text=%q err=%v", text, err)
	}
	if claude.calls != 1 || gemini.calls != 1 || openrouter.calls != 0 {
		t.Fatalf("calls claude=%d gemini=%d openrouter=%d", claude.calls, gemini.calls, openrouter.calls)
	}

	gemini.err = errors.New("quota")
	openrouter.err = errors.New("429")
	_, err = chain.Complete(context.Background(), "", "x")
	if err == nil || !strings.Contains(err.Error(), "claude: usage limit") || !strings.Contains(err.Error(), "openrouter: 429") {
		t.Fatalf("all failed: err = %v", err)
	}

	if _, err := NewChainCompleter().Complete(context.Background(), "", "x"); err == nil {
		t.Fatal("empty chain must fail")
	}
}
