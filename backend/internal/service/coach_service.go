package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/repository"
)

var (
	ErrCoachUnavailable = errors.New("the AI could not write the answer; try again later")
	ErrNotIELTSTask     = errors.New("model and improved answers are for IELTS Part 1-3 only")
	ErrNoTranscript     = errors.New("the attempt has no transcript to improve")
)

const coachTimeout = 2 * time.Minute

// SampleAnswer is a model answer at a band with useful phrases and short tips.
type SampleAnswer struct {
	Band    float32  `json:"band"`
	Answer  string   `json:"answer"`
	Phrases []Phrase `json:"phrases"`
	Tips    []string `json:"tips"`
}

type Phrase struct {
	Phrase  string `json:"phrase"`
	Meaning string `json:"meaning"`
}

// ImprovedAnswer is the learner's own answer rewritten at a higher band.
type ImprovedAnswer struct {
	Band     float32  `json:"band"`
	Lang     string   `json:"lang"`
	Improved string   `json:"improved"`
	Changes  []Change `json:"changes"`
}

type Change struct {
	Original string `json:"original"`
	Improved string `json:"improved"`
	Reason   string `json:"reason"`
}

// CoachService writes model answers for IELTS questions and rewrites learners' answers at
// their target band (one LLM call each; model answers are cached and shared).
type CoachService struct {
	llm      LLMCompleter // nil = off
	repo     repository.CoachRepository
	attempts repository.PronunciationRepository
	goals    *VocabService
}

func NewCoachService(llm LLMCompleter, repo repository.CoachRepository, attempts repository.PronunciationRepository, goals *VocabService) *CoachService {
	return &CoachService{llm: llm, repo: repo, attempts: attempts, goals: goals}
}

func isIELTSTask(t string) bool { return t == "part1" || t == "part2" || t == "part3" }

func coachLang(lang string) string {
	if lang == "en" {
		return "en"
	}
	return "vi"
}

// targetBand: the learner's target band, else current + 1; in half bands, 5.0-9.0.
func (s *CoachService) targetBand(ctx context.Context, userID uuid.UUID) (float32, error) {
	g, err := s.goals.Goals(ctx, userID)
	if err != nil {
		return 0, err
	}
	b := g.CurrentBand + 1
	if g.TargetBand != nil {
		b = *g.TargetBand
	}
	b = float32(math.Round(float64(b)*2) / 2)
	return float32(math.Max(5, math.Min(9, float64(b)))), nil
}

func questionHash(taskType, question string) string {
	sum := sha256.Sum256([]byte(taskType + "\n" + strings.ToLower(strings.Join(strings.Fields(question), " "))))
	return hex.EncodeToString(sum[:])
}

// Sample returns a model answer to the question at the learner's target band (cached).
func (s *CoachService) Sample(ctx context.Context, userID uuid.UUID, taskType, question, lang string) (*SampleAnswer, error) {
	if !isIELTSTask(taskType) {
		return nil, ErrNotIELTSTask
	}
	question = strings.TrimSpace(question)
	if question == "" || len(question) > 2000 {
		return nil, fmt.Errorf("invalid question")
	}
	lang = coachLang(lang)
	band, err := s.targetBand(ctx, userID)
	if err != nil {
		return nil, err
	}
	key := questionHash(taskType, question)
	if cached, err := s.repo.GetSample(ctx, key, band, lang); err != nil {
		return nil, err
	} else if cached != nil {
		var out SampleAnswer
		if json.Unmarshal(cached, &out) == nil {
			out.Band = band
			return &out, nil
		}
	}
	if s.llm == nil {
		return nil, ErrCoachUnavailable
	}
	ctx2, cancel := context.WithTimeout(ctx, coachTimeout)
	defer cancel()
	reply, err := s.llm.Complete(ctx2, "", buildSamplePrompt(taskType, question, band, lang))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCoachUnavailable, err)
	}
	out, err := parseSample(reply, taskType)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCoachUnavailable, err)
	}
	out.Band = band
	raw, _ := json.Marshal(out)
	if err := s.repo.SaveSample(ctx, key, taskType, question, band, lang, raw); err != nil {
		return nil, err
	}
	return out, nil
}

// Improve rewrites the learner's answer of an attempt at their target band, keeping their
// ideas; the result is saved with the attempt (asking again returns it unless the band or
// language changed).
func (s *CoachService) Improve(ctx context.Context, userID, attemptID uuid.UUID, lang string) (*ImprovedAnswer, error) {
	a, err := s.attempts.Get(ctx, attemptID, userID)
	if err != nil {
		return nil, err
	}
	if a == nil {
		return nil, repository.ErrNotFound
	}
	if !isIELTSTask(a.TaskType) {
		return nil, ErrNotIELTSTask
	}
	transcript := ""
	if a.RecognizedText != nil {
		transcript = strings.TrimSpace(*a.RecognizedText)
	}
	if len(strings.Fields(transcript)) < 3 {
		return nil, ErrNoTranscript
	}
	lang = coachLang(lang)
	band, err := s.targetBand(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(a.ImprovedAnswer) > 0 {
		var cached ImprovedAnswer
		if json.Unmarshal(a.ImprovedAnswer, &cached) == nil && cached.Band == band && cached.Lang == lang {
			return &cached, nil
		}
	}
	if s.llm == nil {
		return nil, ErrCoachUnavailable
	}
	question := ""
	if a.TaskPrompt != nil {
		question = *a.TaskPrompt
	}
	ctx2, cancel := context.WithTimeout(ctx, coachTimeout)
	defer cancel()
	reply, err := s.llm.Complete(ctx2, "", buildImprovePrompt(a.TaskType, question, transcript, band, lang))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCoachUnavailable, err)
	}
	out, err := parseImproved(reply)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCoachUnavailable, err)
	}
	out.Band, out.Lang = band, lang
	raw, _ := json.Marshal(out)
	if err := s.repo.SaveImproved(ctx, attemptID, userID, raw); err != nil {
		return nil, err
	}
	return out, nil
}

var answerLength = map[string]string{
	"part1": "40-70 words (2-4 sentences)",
	"part2": "200-260 words (about 2 minutes of speaking), covering every point of the cue card",
	"part3": "90-140 words: a clear opinion, a reason, an example, and a contrast or consequence",
}

func langName(lang string) string {
	if lang == "en" {
		return "English"
	}
	return "Vietnamese"
}

func buildSamplePrompt(taskType, question string, band float32, lang string) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "You are an IELTS Speaking coach. Write a model answer for IELTS Speaking %s at band %.1f.\n", strings.Replace(taskType, "part", "Part ", 1), band)
	sb.WriteString("Question / task:\n" + question + "\n")
	fmt.Fprintf(&sb, "Length: %s. Natural spoken style (contractions, discourse markers), first person, a believable personal example; no headings, no lists. ", answerLength[taskType])
	fmt.Fprintf(&sb, "Use vocabulary and grammar typical of band %.1f, not higher.\n", band)
	fmt.Fprintf(&sb, "Then list 4-6 useful phrases taken from your answer with their meaning in %s, and 2 short tips in %s on what makes the answer fit band %.1f.\n", langName(lang), langName(lang), band)
	sb.WriteString("Respond with ONLY a JSON object, no markdown, in this exact shape:\n")
	sb.WriteString(`{"answer": "...", "phrases": [{"phrase": "...", "meaning": "..."}], "tips": ["...", "..."]}` + "\n")
	return sb.String()
}

func buildImprovePrompt(taskType, question, transcript string, band float32, lang string) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "You are an IELTS Speaking coach. Below is a learner's answer to IELTS Speaking %s ", strings.Replace(taskType, "part", "Part ", 1))
	sb.WriteString("(a speech-recognition transcript; ignore obvious recognition errors).\n")
	if question != "" {
		sb.WriteString("Question / task:\n" + question + "\n")
	}
	sb.WriteString("Learner's answer:\n" + transcript + "\n")
	fmt.Fprintf(&sb, "Rewrite it as a band %.1f answer: keep the learner's ideas, opinions and personal details; fix grammar; use more precise vocabulary and better linking; keep a natural spoken style; at most 30%% longer. ", band)
	fmt.Fprintf(&sb, "Then list up to 6 of the most useful changes: the original words, your version, and the reason in %s (one short sentence).\n", langName(lang))
	sb.WriteString("Respond with ONLY a JSON object, no markdown, in this exact shape:\n")
	sb.WriteString(`{"improved": "...", "changes": [{"original": "...", "improved": "...", "reason": "..."}]}` + "\n")
	return sb.String()
}

func firstJSON(content string, v any) error {
	start := strings.Index(content, "{")
	if start < 0 {
		return fmt.Errorf("no JSON object found in llm response")
	}
	return json.NewDecoder(strings.NewReader(content[start:])).Decode(v)
}

func parseSample(content, taskType string) (*SampleAnswer, error) {
	var out SampleAnswer
	if err := firstJSON(content, &out); err != nil {
		return nil, fmt.Errorf("parse llm json: %w", err)
	}
	out.Answer = strings.TrimSpace(out.Answer)
	min := map[string]int{"part1": 25, "part2": 120, "part3": 60}[taskType]
	if len(strings.Fields(out.Answer)) < min {
		return nil, fmt.Errorf("model answer too short")
	}
	phrases := out.Phrases[:0]
	for _, p := range out.Phrases {
		if strings.TrimSpace(p.Phrase) != "" && strings.TrimSpace(p.Meaning) != "" {
			phrases = append(phrases, p)
		}
	}
	out.Phrases = phrases
	if out.Phrases == nil {
		out.Phrases = []Phrase{}
	}
	if out.Tips == nil {
		out.Tips = []string{}
	}
	return &out, nil
}

func parseImproved(content string) (*ImprovedAnswer, error) {
	var out ImprovedAnswer
	if err := firstJSON(content, &out); err != nil {
		return nil, fmt.Errorf("parse llm json: %w", err)
	}
	out.Improved = strings.TrimSpace(out.Improved)
	if len(strings.Fields(out.Improved)) < 5 {
		return nil, fmt.Errorf("improved answer missing")
	}
	changes := out.Changes[:0]
	for _, c := range out.Changes {
		if strings.TrimSpace(c.Improved) != "" && strings.TrimSpace(c.Reason) != "" {
			changes = append(changes, c)
		}
	}
	if len(changes) > 6 {
		changes = changes[:6]
	}
	out.Changes = changes
	if out.Changes == nil {
		out.Changes = []Change{}
	}
	return &out, nil
}
