package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"unicode"

	"englishapp/backend/internal/i18n"
)

// LLMSentenceGenerator asks an LLM for a batch of practice sentences in one call, so a
// learner gets many sentences per request of the free OpenRouter quota.
type LLMSentenceGenerator struct {
	llm LLMCompleter
}

func NewLLMSentenceGenerator(llm LLMCompleter) *LLMSentenceGenerator {
	return &LLMSentenceGenerator{llm: llm}
}

var _ SentenceGenerator = (*LLMSentenceGenerator)(nil)

func (g *LLMSentenceGenerator) GenerateBatch(ctx context.Context, avoidRecent []string, n, minWords int, lang string) ([]GeneratedSentence, error) {
	reply, err := g.llm.Complete(ctx, "", buildSentencePrompt(avoidRecent, n, minWords, lang))
	if err != nil {
		return nil, err
	}
	out, err := parseGeneratedSentences(reply, avoidRecent, minWords)
	if i18n.IsEnglish(lang) {
		for i := range out {
			out[i].Gloss = "" // English learners need no translation
		}
	}
	return out, err
}

// lengthExample shows the model the target length. Asking for a word count alone gave 7–10
// word sentences (3 of 10 usable); asking for two joined clauses gave 10 of 10.
const lengthExample = "I usually take the bus to work because it is cheaper than driving."

func buildSentencePrompt(avoidRecent []string, n, minWords int, lang string) string {
	var sb strings.Builder
	learner, gloss := i18n.Name(lang)+"-speaking English learner", i18n.Name(lang)+" translation"
	if i18n.IsEnglish(lang) {
		learner, gloss = "English learner", "empty string"
	}
	fmt.Fprintf(&sb, "You generate %d different English practice sentences for a %s doing shadowing/pronunciation practice.\n", n, learner)
	fmt.Fprintf(&sb, "Requirements: natural everyday conversational English for intermediate learners. Every sentence has TWO parts joined by a word like because, but, when, if, so, and, before or after, and is %d to %d words long (sentences under %d words are thrown away).\n", minWords+2, minWords+8, minWords)
	fmt.Fprintf(&sb, "Example of the right length (do not reuse it): %q\n", lengthExample)
	sb.WriteString("Mix statements, wh-questions and yes-no questions, and vary the topics.\n")
	sb.WriteString("Respond with ONLY a JSON object, no markdown, no explanation, in this exact shape:\n")
	sb.WriteString(`{"sentences": [{"text": "...", "phonetic": "IPA transcription", "gloss": "` + gloss + `"}]}` + "\n")
	if len(avoidRecent) > 0 {
		sb.WriteString("Do not repeat or closely resemble any of these previously used sentences:\n")
		for _, s := range avoidRecent {
			sb.WriteString("- " + s + "\n")
		}
	}
	return sb.String()
}

// parseGeneratedSentences keeps valid sentences only: non-empty, at least minWords words
// (the rubric's Pronunciation criterion needs that much speech), and not a repeat.
func parseGeneratedSentences(content string, avoid []string, minWords int) ([]GeneratedSentence, error) {
	start := strings.Index(content, "{")
	if start < 0 {
		return nil, fmt.Errorf("no JSON object found in llm response")
	}
	// Decode only the first JSON value: models sometimes add text or a stray "}" after it.
	var parsed struct {
		Sentences []GeneratedSentence `json:"sentences"`
	}
	if err := json.NewDecoder(strings.NewReader(content[start:])).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("parse llm json: %w", err)
	}

	seen := map[string]bool{normSentence(lengthExample): true}
	for _, s := range avoid {
		seen[normSentence(s)] = true
	}
	var out []GeneratedSentence
	for _, s := range parsed.Sentences {
		s.Text = strings.TrimSpace(s.Text)
		key := normSentence(s.Text)
		if s.Text == "" || seen[key] || len(strings.Fields(s.Text)) < minWords {
			continue
		}
		seen[key] = true
		out = append(out, s)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("llm response has no usable sentence")
	}
	return out, nil
}

// normSentence compares sentences ignoring case, punctuation and spacing.
func normSentence(s string) string {
	clean := strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '\'' {
			return unicode.ToLower(r)
		}
		return ' '
	}, s)
	return strings.Join(strings.Fields(clean), " ")
}
