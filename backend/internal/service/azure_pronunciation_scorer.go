package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"englishapp/backend/internal/domain"
)

// AzurePronunciationScorer calls Azure Cognitive Services Speech's
// Pronunciation Assessment REST API directly (no Go SDK — the official SDK
// has poor Go support/documentation).
type AzurePronunciationScorer struct {
	subscriptionKey string
	region          string
	httpClient      *http.Client
}

func NewAzurePronunciationScorer(subscriptionKey, region string) *AzurePronunciationScorer {
	return &AzurePronunciationScorer{
		subscriptionKey: subscriptionKey,
		region:          region,
		httpClient:      &http.Client{},
	}
}

type azurePronAssessmentConfig struct {
	ReferenceText string `json:"ReferenceText"`
	GradingSystem string `json:"GradingSystem"`
	Granularity   string `json:"Granularity"`
	Dimension     string `json:"Dimension"`
	EnableMiscue  bool   `json:"EnableMiscue"`
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
	AccuracyScore      float32     `json:"AccuracyScore"`
	FluencyScore       float32     `json:"FluencyScore"`
	CompletenessScore  float32     `json:"CompletenessScore"`
	PronScore          float32     `json:"PronScore"`
	Words              []azureWord `json:"Words"`
}

type azureWord struct {
	Word          string         `json:"Word"`
	AccuracyScore float32        `json:"AccuracyScore"`
	ErrorType     string         `json:"ErrorType"`
	Phonemes      []azurePhoneme `json:"Phonemes"`
}

type azurePhoneme struct {
	Phoneme       string  `json:"Phoneme"`
	AccuracyScore float32 `json:"AccuracyScore"`
}

func (s *AzurePronunciationScorer) Score(ctx context.Context, audioWAV []byte, referenceText string) (*ScoreResult, error) {
	cfg := azurePronAssessmentConfig{
		ReferenceText: referenceText,
		GradingSystem: "HundredMark",
		Granularity:   "Phoneme",
		Dimension:     "Comprehensive",
		EnableMiscue:  true,
	}
	cfgJSON, err := json.Marshal(cfg)
	if err != nil {
		return nil, fmt.Errorf("marshal pronunciation assessment config: %w", err)
	}
	cfgHeader := base64.StdEncoding.EncodeToString(cfgJSON)

	url := fmt.Sprintf("https://%s.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed", s.region)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(audioWAV))
	if err != nil {
		return nil, fmt.Errorf("build azure request: %w", err)
	}
	req.Header.Set("Ocp-Apim-Subscription-Key", s.subscriptionKey)
	req.Header.Set("Content-Type", "audio/wav; codecs=audio/pcm; samplerate=16000")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Pronunciation-Assessment", cfgHeader)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call azure speech api: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("azure speech api returned status %d", resp.StatusCode)
	}

	var result azureRecognitionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode azure response: %w", err)
	}

	if result.RecognitionStatus != "Success" || len(result.NBest) == 0 {
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
		})
		for _, p := range w.Phonemes {
			phonemeScores = append(phonemeScores, domain.PhonemeScore{
				Phoneme: p.Phoneme,
				Score:   p.AccuracyScore,
			})
		}
	}

	return &ScoreResult{
		RecognizedText: result.DisplayText,
		OverallScore:   best.AccuracyScore,
		FluencyScore:   best.FluencyScore,
		WordScores:     wordScores,
		PhonemeScores:  phonemeScores,
	}, nil
}

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
