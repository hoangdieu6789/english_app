package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"englishapp/backend/internal/domain"
)

// AzurePronunciationScorer calls Azure Cognitive Services Speech's
// Pronunciation Assessment REST API directly (no Go SDK — the official SDK
// has poor Go support/documentation).
//
// Free tier (F0): Azure allows 1 concurrent speech-to-text request, so calls wait for a slot
// (sem) instead of failing, and a 429 is retried a few times with backoff.
type AzurePronunciationScorer struct {
	subscriptionKey string
	region          string
	httpClient      *http.Client
	endpoint        string        // empty = the regional Azure endpoint; tests point it at a fake server
	sem             chan struct{} // limits concurrent Azure calls (AZURE_SPEECH_CONCURRENCY)
	retryWait       time.Duration // first backoff after a 429; doubles each retry
	attemptTimeout  time.Duration // a call that takes longer is cancelled and retried once
}

const azureMaxRetries = 3

// NewAzurePronunciationScorer creates the scorer. concurrency < 1 means 1 (the F0 limit).
func NewAzurePronunciationScorer(subscriptionKey, region string, concurrency int) *AzurePronunciationScorer {
	if concurrency < 1 {
		concurrency = 1
	}
	return &AzurePronunciationScorer{
		subscriptionKey: subscriptionKey,
		region:          region,
		httpClient:      &http.Client{},
		sem:             make(chan struct{}, concurrency),
		retryWait:       time.Second,
		// Seen live: a call hung for 60 s while the next identical one took 5 s. Short audio
		// (<= 60 s) normally comes back in under 10 s.
		attemptTimeout: 30 * time.Second,
	}
}

type azurePronAssessmentConfig struct {
	ReferenceText string `json:"ReferenceText"`
	GradingSystem string `json:"GradingSystem"`
	Granularity   string `json:"Granularity"`
	Dimension     string `json:"Dimension"`
	EnableMiscue  bool   `json:"EnableMiscue"`
	// Prosody (stress, intonation, rhythm) feeds the speaking rubric's Pronunciation criterion
	// (P-02…P-04). Written as the string "True", like the REST docs sample. en-US only.
	EnableProsodyAssessment string `json:"EnableProsodyAssessment"`
}

type azureRecognitionResponse struct {
	RecognitionStatus string             `json:"RecognitionStatus"`
	DisplayText       string             `json:"DisplayText"`
	NBest             []azureNBestResult `json:"NBest"`
}

// Azure returns AccuracyScore/FluencyScore/etc as flat fields directly on
// the NBest/Word/Phoneme objects — NOT nested under a "PronunciationAssessment"
// sub-object, despite that being the name of the request header/config.
type azureNBestResult struct {
	AccuracyScore     float32     `json:"AccuracyScore"`
	FluencyScore      float32     `json:"FluencyScore"`
	CompletenessScore float32     `json:"CompletenessScore"`
	ProsodyScore      *float32    `json:"ProsodyScore"`
	PronScore         float32     `json:"PronScore"`
	Words             []azureWord `json:"Words"`
}

type azureWord struct {
	Word          string         `json:"Word"`
	Offset        int64          `json:"Offset"`   // 100-ns ticks
	Duration      int64          `json:"Duration"` // 100-ns ticks
	AccuracyScore float32        `json:"AccuracyScore"`
	ErrorType     string         `json:"ErrorType"`
	Phonemes      []azurePhoneme `json:"Phonemes"`
}

type azurePhoneme struct {
	Phoneme       string  `json:"Phoneme"`
	AccuracyScore float32 `json:"AccuracyScore"`
}

func (s *AzurePronunciationScorer) Score(ctx context.Context, audioWAV []byte, referenceText string) (*ScoreResult, error) {
	// Miscue (omitted / inserted words) needs a reference text.
	return s.score(ctx, audioWAV, referenceText, referenceText != "")
}

// ScoreTranscribed scores free speech against a transcript of the same audio (from the
// Transcriber). Miscue is off: the transcript is what was said, so Azure only has to align
// it and score each word; with miscue on it reported false insertions.
func (s *AzurePronunciationScorer) ScoreTranscribed(ctx context.Context, audioWAV []byte, transcript string) (*ScoreResult, error) {
	return s.score(ctx, audioWAV, transcript, false)
}

func (s *AzurePronunciationScorer) score(ctx context.Context, audioWAV []byte, referenceText string, miscue bool) (*ScoreResult, error) {
	cfg := azurePronAssessmentConfig{
		ReferenceText:           referenceText,
		GradingSystem:           "HundredMark",
		Granularity:             "Phoneme",
		Dimension:               "Comprehensive",
		EnableMiscue:            miscue,
		EnableProsodyAssessment: "True",
	}
	cfgJSON, err := json.Marshal(cfg)
	if err != nil {
		return nil, fmt.Errorf("marshal pronunciation assessment config: %w", err)
	}
	cfgHeader := base64.StdEncoding.EncodeToString(cfgJSON)

	url := s.endpoint
	if url == "" {
		url = fmt.Sprintf("https://%s.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1", s.region)
	}
	url += "?language=en-US&format=detailed"

	body, err := s.post(ctx, url, cfgHeader, audioWAV)
	if err != nil {
		return nil, err
	}
	var result azureRecognitionResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode azure response: %w", err)
	}

	if result.RecognitionStatus != "Success" || len(result.NBest) == 0 {
		// NoMatch / InitialSilenceTimeout / BabbleTimeout: Azure heard no usable speech
		// (silent or very quiet microphone, only noise). Error: a problem on Azure's side.
		if result.RecognitionStatus != "Error" {
			return nil, &NoSpeechError{Status: result.RecognitionStatus}
		}
		return nil, fmt.Errorf("azure speech recognition failed: status=%s", result.RecognitionStatus)
	}

	best := result.NBest[0]

	wordScores := make([]domain.WordScore, 0, len(best.Words))
	phonemeScores := make([]domain.PhonemeScore, 0)
	for _, w := range best.Words {
		wordScores = append(wordScores, domain.WordScore{
			Word:          w.Word,
			AccuracyScore: w.AccuracyScore,
			ErrorType:     normalizeErrorType(w.ErrorType),
			OffsetMs:      w.Offset / 10_000,
			DurationMs:    w.Duration / 10_000,
		})
		for _, p := range w.Phonemes {
			phonemeScores = append(phonemeScores, domain.PhonemeScore{
				Phoneme: p.Phoneme,
				Score:   p.AccuracyScore,
			})
		}
	}

	return &ScoreResult{
		RecognizedText:    result.DisplayText,
		OverallScore:      best.AccuracyScore,
		FluencyScore:      best.FluencyScore,
		CompletenessScore: best.CompletenessScore,
		ProsodyScore:      best.ProsodyScore,
		PronScore:         best.PronScore,
		WordScores:        wordScores,
		PhonemeScores:     phonemeScores,
		Raw:               body,
	}, nil
}

// post sends the audio to Azure, holding one concurrency slot. A 429 is retried with backoff
// (up to azureMaxRetries); a hung call (attemptTimeout) or a 5xx is retried once.
func (s *AzurePronunciationScorer) post(ctx context.Context, url, cfgHeader string, audioWAV []byte) ([]byte, error) {
	select {
	case s.sem <- struct{}{}:
		defer func() { <-s.sem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	wait := s.retryWait
	start := time.Now()
	throttled, transient := 0, 0
	for {
		body, status, retryAfter, err := s.postOnce(ctx, url, cfgHeader, audioWAV)
		switch {
		case ctx.Err() != nil:
			return nil, ctx.Err()
		case err != nil || status >= 500:
			if transient < 1 {
				transient++
				log.Printf("azure speech: retrying after %v (status %d)", err, status)
				continue
			}
			if err != nil {
				return nil, fmt.Errorf("call azure speech api: %w", err)
			}
			return nil, fmt.Errorf("azure speech api returned status %d", status)
		case status == http.StatusTooManyRequests && throttled < azureMaxRetries:
			throttled++
			if retryAfter > 0 {
				wait = retryAfter
			}
			select {
			case <-time.After(wait):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
			wait *= 2
			continue
		case status != http.StatusOK:
			return nil, fmt.Errorf("azure speech api returned status %d", status)
		}
		log.Printf("azure speech: audio=%.1fs took=%s throttled=%d retried=%d", float64(len(audioWAV))/32000, time.Since(start).Round(100*time.Millisecond), throttled, transient)
		return body, nil
	}
}

func (s *AzurePronunciationScorer) postOnce(ctx context.Context, url, cfgHeader string, audioWAV []byte) (body []byte, status int, retryAfter time.Duration, err error) {
	ctx, cancel := context.WithTimeout(ctx, s.attemptTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(audioWAV))
	if err != nil {
		return nil, 0, 0, err
	}
	req.Header.Set("Ocp-Apim-Subscription-Key", s.subscriptionKey)
	req.Header.Set("Content-Type", "audio/wav; codecs=audio/pcm; samplerate=16000")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Pronunciation-Assessment", cfgHeader)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, 0, 0, err
	}
	defer resp.Body.Close()
	if ra, err := strconv.Atoi(resp.Header.Get("Retry-After")); err == nil && ra > 0 {
		retryAfter = time.Duration(ra) * time.Second
	}
	body, err = io.ReadAll(resp.Body)
	if err != nil && resp.StatusCode == http.StatusOK {
		return nil, 0, 0, fmt.Errorf("read azure response: %w", err)
	}
	return body, resp.StatusCode, retryAfter, nil
}

// normalizeErrorType keeps the segmental error types. Prosody error types that Azure can also
// put here (UnexpectedBreak, MissingBreak, Monotone) are read by the speaking rubric from the
// raw response and shown as flags on the word instead.
func normalizeErrorType(azureErrorType string) string {
	switch strings.ToLower(azureErrorType) {
	case "mispronunciation":
		return "mispronunciation"
	case "omission":
		return "omission"
	case "insertion":
		return "insertion"
	default:
		return "none"
	}
}

// NoSpeechError means Azure returned a result but recognised no speech in the recording.
type NoSpeechError struct {
	Status string // Azure RecognitionStatus, e.g. NoMatch, InitialSilenceTimeout
}

func (e *NoSpeechError) Error() string {
	return "azure speech recognition: no speech recognised (status=" + e.Status + ")"
}
