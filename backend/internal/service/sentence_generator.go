package service

import "context"

type GeneratedSentence struct {
	Text     string `json:"text"`
	Phonetic string `json:"phonetic"`
	Gloss    string `json:"gloss"`
}

// SentenceGenerator abstracts the LLM provider used to generate practice
// sentences, so swapping OpenRouter for another provider later only means
// writing a new implementation of this interface.
type SentenceGenerator interface {
	// GenerateBatch returns up to n new sentences of at least minWords words each.
	GenerateBatch(ctx context.Context, avoidRecent []string, n, minWords int) ([]GeneratedSentence, error)
}
