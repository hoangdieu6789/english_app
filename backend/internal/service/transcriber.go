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
	"regexp"
	"strings"
	"time"
)

// Transcript sources stored on an attempt.
const (
	TranscriptAzure   = "azure"   // Azure's own recognition (no reference text)
	TranscriptWhisper = "whisper" // whisper.cpp on the host, then Azure scored against it
)

// Transcriber writes down free speech before Azure scores it. Azure's recognition of free
// speech has no context and often guesses other words for unclear ones ("avid photographer"
// -> "event for the Graford"), then scores them as said well. With a better transcript as
// the reference text, Azure scores the words actually said and flags the unclear ones.
type Transcriber interface {
	Transcribe(ctx context.Context, audioWAV []byte) (string, error)
}

// BridgeTranscriber calls whisper.cpp through the host LLM bridge (POST /v1/transcribe); it
// runs on the Mac's GPU, which the API container cannot use.
type BridgeTranscriber struct {
	url    string
	token  string
	client *http.Client
}

// whisper medium.en took ~1.1–1.5 s for 10–25 s answers on an M5 Pro; the first call after a
// bridge start also loads the model (~5 s).
const transcribeTimeout = 20 * time.Second

func NewBridgeTranscriber(baseURL, token string) *BridgeTranscriber {
	return &BridgeTranscriber{url: baseURL + "/v1/transcribe", token: token, client: &http.Client{Timeout: transcribeTimeout}}
}

var _ Transcriber = (*BridgeTranscriber)(nil)

func (b *BridgeTranscriber) Transcribe(ctx context.Context, audioWAV []byte) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.url, bytes.NewReader(audioWAV))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "audio/wav")
	req.Header.Set("Authorization", "Bearer "+b.token)

	started := time.Now()
	resp, err := b.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("whisper bridge: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("whisper bridge: read body: %w", err)
	}
	var out struct {
		Text  string `json:"text"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("whisper bridge: status %d: invalid JSON", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("whisper bridge: status %d: %s", resp.StatusCode, out.Error)
	}
	text := cleanTranscript(out.Text)
	if text == "" {
		return "", errors.New("whisper bridge: empty transcript")
	}
	log.Printf("transcriber: whisper took=%s chars=%d", time.Since(started).Round(100*time.Millisecond), len(text))
	return text, nil
}

// whisper marks non-speech as "[BLANK_AUDIO]", "(music)", "[inaudible]"...
var nonSpeech = regexp.MustCompile(`\[[^\]]*\]|\([^)]*\)`)

func cleanTranscript(s string) string {
	return strings.Join(strings.Fields(nonSpeech.ReplaceAllString(s, " ")), " ")
}
