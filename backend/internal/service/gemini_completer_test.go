package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestGeminiCompleterRequestAndAnswer(t *testing.T) {
	var gotPath, gotKey string
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotKey = r.URL.Path, r.Header.Get("x-goog-api-key")
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{"candidates":[{"content":{"role":"model","parts":[
			{"text":"thinking...","thought":true},{"text":"{\"ok\":"},{"text":"true}"}]},"finishReason":"STOP"}]}`))
	}))
	defer srv.Close()

	g := NewGeminiCompleter("test-key", "", 0, 5*time.Second)
	g.baseURL = srv.URL + "/v1beta/models/"
	text, err := g.Complete(context.Background(), "be strict", "grade this")
	if err != nil {
		t.Fatal(err)
	}
	if text != `{"ok":true}` {
		t.Fatalf("text = %q (thought parts must be dropped)", text)
	}
	if gotPath != "/v1beta/models/"+DefaultGeminiModel+":generateContent" || gotKey != "test-key" {
		t.Fatalf("path=%q key=%q", gotPath, gotKey)
	}
	sys, _ := json.Marshal(got["systemInstruction"])
	if !strings.Contains(string(sys), "be strict") {
		t.Fatalf("system instruction missing: %s", sys)
	}
	contents, _ := json.Marshal(got["contents"])
	if !strings.Contains(string(contents), "grade this") {
		t.Fatalf("user prompt missing: %s", contents)
	}
}

func TestGeminiCompleterErrors(t *testing.T) {
	cases := map[string]struct {
		status int
		body   string
		want   string
	}{
		"quota":   {429, `{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for free tier"}}`, "RESOURCE_EXHAUSTED"},
		"blocked": {200, `{"promptFeedback":{"blockReason":"SAFETY"}}`, "blocked"},
		"empty":   {200, `{"candidates":[{"content":{"parts":[]},"finishReason":"MAX_TOKENS"}]}`, "MAX_TOKENS"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(c.status)
				_, _ = w.Write([]byte(c.body))
			}))
			defer srv.Close()
			g := NewGeminiCompleter("k", "gemini-x", 0, 5*time.Second)
			g.baseURL = srv.URL + "/"
			if _, err := g.Complete(context.Background(), "", "x"); err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("err = %v, want %q", err, c.want)
			}
		})
	}
}
