package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"englishapp/backend/internal/domain"
)

// Shape of every question set; the seed file and the LLM generator must both follow it.
const (
	part1QuestionsPerSet = 4
	cueCardPoints        = 4
	part3QuestionsPerSet = 3
)

// QuestionSetGenerator writes new IELTS-style question sets.
type QuestionSetGenerator interface {
	// GenerateSets returns up to n new sets of the given kind whose topics are not in avoidTopics.
	GenerateSets(ctx context.Context, kind string, avoidTopics []string, n int) ([]domain.QuestionSet, error)
}

// LLMQuestionSetGenerator asks an LLM for a batch of sets in one call (one request of the
// free OpenRouter quota gives several sets, shared by every learner).
type LLMQuestionSetGenerator struct {
	llm LLMCompleter
}

func NewLLMQuestionSetGenerator(llm LLMCompleter) *LLMQuestionSetGenerator {
	return &LLMQuestionSetGenerator{llm: llm}
}

var _ QuestionSetGenerator = (*LLMQuestionSetGenerator)(nil)

func (g *LLMQuestionSetGenerator) GenerateSets(ctx context.Context, kind string, avoidTopics []string, n int) ([]domain.QuestionSet, error) {
	reply, err := g.llm.Complete(ctx, "", buildQuestionSetPrompt(kind, avoidTopics, n))
	if err != nil {
		return nil, err
	}
	return parseQuestionSets(reply, kind, avoidTopics)
}

func buildQuestionSetPrompt(kind string, avoidTopics []string, n int) string {
	var sb strings.Builder
	sb.WriteString("You write practice material for the IELTS Speaking test, for an English-learning app.\n")
	sb.WriteString("Write every question in your own words. Do not copy questions from IELTS books, past papers or exam websites.\n")
	sb.WriteString("Use natural, clear English that a B1-B2 learner can understand. Each topic must be different from the others.\n")
	if kind == domain.QuestionKindPart1 {
		fmt.Fprintf(&sb, "Write %d new Part 1 topics. Each topic has exactly %d short questions about the candidate's own life, habits and opinions, from easy to slightly harder.\n", n, part1QuestionsPerSet)
		sb.WriteString("Respond with ONLY a JSON object, no markdown, in this exact shape:\n")
		sb.WriteString(`{"sets": [{"topic": "Cooking", "questions": ["...?", "...?", "...?", "...?"]}]}` + "\n")
	} else {
		fmt.Fprintf(&sb, "Write %d new Part 2 cue cards. Each card has a task that starts with \"Describe\", exactly %d bullet points (the last one starts with \"and explain\"), and exactly %d Part 3 discussion questions on the same theme that ask about society and general opinions, not the candidate's own life.\n", n, cueCardPoints, part3QuestionsPerSet)
		sb.WriteString("Respond with ONLY a JSON object, no markdown, in this exact shape:\n")
		sb.WriteString(`{"sets": [{"topic": "A useful skill", "prompt": "Describe a skill ...", "points": ["what ...", "when ...", "how ...", "and explain why ..."], "part3": ["...?", "...?", "...?"]}]}` + "\n")
	}
	if len(avoidTopics) > 0 {
		sb.WriteString("These topics already exist; do not repeat them or write a close variant:\n")
		for _, t := range avoidTopics {
			sb.WriteString("- " + t + "\n")
		}
	}
	return sb.String()
}

// rawQuestionSet is the JSON shape of a set in the seed file and in the LLM reply.
type rawQuestionSet struct {
	Topic     string   `json:"topic"`
	Prompt    string   `json:"prompt"`
	Points    []string `json:"points"`
	Questions []string `json:"questions"`
	Part3     []string `json:"part3"`
}

// toQuestionSet checks the shape and returns the set, or false when it is not usable.
func (r rawQuestionSet) toQuestionSet(kind, source string) (domain.QuestionSet, bool) {
	set := domain.QuestionSet{Kind: kind, Topic: strings.TrimSpace(r.Topic), Source: source, Points: []string{}}
	if set.Topic == "" {
		return set, false
	}
	if kind == domain.QuestionKindPart1 {
		set.Questions = trimAll(r.Questions)
		return set, len(set.Questions) == part1QuestionsPerSet && allQuestions(set.Questions)
	}
	set.Prompt = strings.TrimSpace(r.Prompt)
	set.Points = trimAll(r.Points)
	set.Questions = trimAll(r.Part3)
	ok := strings.HasPrefix(set.Prompt, "Describe") &&
		len(set.Points) == cueCardPoints &&
		len(set.Questions) == part3QuestionsPerSet && allQuestions(set.Questions)
	return set, ok
}

// parseQuestionSets keeps only sets with the right shape and a new topic.
func parseQuestionSets(content, kind string, avoidTopics []string) ([]domain.QuestionSet, error) {
	start := strings.Index(content, "{")
	if start < 0 {
		return nil, fmt.Errorf("no JSON object found in llm response")
	}
	var parsed struct {
		Sets []rawQuestionSet `json:"sets"`
	}
	// Decode only the first JSON value: models sometimes add text after it.
	if err := json.NewDecoder(strings.NewReader(content[start:])).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("parse llm json: %w", err)
	}
	seen := map[string]bool{}
	for _, t := range avoidTopics {
		seen[normSentence(t)] = true
	}
	var out []domain.QuestionSet
	for _, raw := range parsed.Sets {
		set, ok := raw.toQuestionSet(kind, "generated")
		key := normSentence(set.Topic)
		if !ok || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, set)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("llm response has no usable question set")
	}
	return out, nil
}

func trimAll(items []string) []string {
	out := make([]string, 0, len(items))
	for _, s := range items {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func allQuestions(items []string) bool {
	for _, s := range items {
		if !strings.HasSuffix(s, "?") {
			return false
		}
	}
	return true
}
