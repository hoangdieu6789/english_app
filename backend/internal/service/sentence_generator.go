package service

import "context"

type GeneratedSentence struct {
	Text     string
	Phonetic string
	Gloss    string
}

// SentenceGenerator abstracts the LLM provider used to generate practice
// sentences, so swapping OpenRouter for another provider later only means
// writing a new implementation of this interface.
type SentenceGenerator interface {
	Generate(ctx context.Context, avoidRecent []string) (*GeneratedSentence, error)
}
