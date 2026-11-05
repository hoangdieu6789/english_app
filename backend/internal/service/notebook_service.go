package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"unicode"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/i18n"
	"englishapp/backend/internal/repository"
)

// The word notebook (LISTEN-001): the learner saves a word or phrase (from a lesson or typed
// in), the LLM writes its card (meaning in the learner's language, IPA, part of speech, an
// example), the learner writes their own sentence, the LLM grades it, and a sentence that
// passes becomes the card's example. Saved cards are review cards of kind "saved".

var ErrNotebookInput = errors.New("invalid notebook entry")

const (
	maxSavedWords      = 6
	maxSavedChars      = 60
	maxSentenceChars   = 300
	SentencePassScore  = 7 // a sentence of 7/10 or more replaces the example
	notebookListLimit  = 500
	minSentenceWords   = 3
	maxSentenceWords   = 40
	maxNotebookContext = 400
)

type NotebookService struct {
	repo   repository.NotebookRepository
	llm    LLMCompleter        // nil: cards without details, sentences cannot be graded
	scorer PronunciationScorer // nil: no read-aloud score
}

func NewNotebookService(repo repository.NotebookRepository, llm LLMCompleter, scorer PronunciationScorer) *NotebookService {
	return &NotebookService{repo: repo, llm: llm, scorer: scorer}
}

// NormalizeSaved cleans a word or phrase to save: single spaces, no surrounding punctuation,
// lower case (except "I"); "" when it is not 1-6 words of letters.
func NormalizeSaved(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	s = strings.TrimFunc(s, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) })
	if s == "" || len([]rune(s)) > maxSavedChars || len(strings.Fields(s)) > maxSavedWords {
		return ""
	}
	letters := 0
	for _, r := range s {
		switch {
		case unicode.IsLetter(r):
			letters++
		case unicode.IsDigit(r), r == ' ', r == '\'', r == '’', r == '-', r == ',', r == '.':
		default:
			return ""
		}
	}
	if letters == 0 {
		return ""
	}
	words := strings.Fields(strings.ReplaceAll(strings.ToLower(s), "’", "'"))
	for i, w := range words {
		if w == "i" || strings.HasPrefix(w, "i'") {
			words[i] = "I" + w[1:]
		}
	}
	return strings.Join(words, " ")
}

// SaveInput is a word or phrase to save.
type SaveInput struct {
	Text     string
	Context  string
	LessonID *uuid.UUID
}

// Save adds the word or phrase to the notebook and returns its card. lookedUp is false when
// the LLM could not write the details (the card is saved without them; saving it again
// retries).
func (s *NotebookService) Save(ctx context.Context, userID uuid.UUID, lang string, in SaveInput) (card *domain.NotebookCard, lookedUp bool, err error) {
	word := NormalizeSaved(in.Text)
	if word == "" {
		return nil, false, fmt.Errorf("%w: text", ErrNotebookInput)
	}
	c := &domain.NotebookCard{Word: word, Kind: domain.ReviewSaved, Context: clip(strings.Join(strings.Fields(in.Context), " "), maxNotebookContext), LessonID: in.LessonID}
	if s.llm != nil {
		if reply, err := s.llm.Complete(ctx, "", buildLookupPrompt(word, c.Context, lang)); err == nil {
			if info, err := parseLookup(reply); err == nil {
				c.POS, c.IPA, c.Meaning, c.ExampleEN, c.Band = info.POS, info.IPA, info.Meaning, info.ExampleEN, info.Band
				lookedUp = true
			}
		}
	}
	id, err := s.repo.SaveWord(ctx, userID, lang, c)
	if err != nil {
		return nil, false, err
	}
	c.ID = id
	return c, lookedUp, nil
}

func (s *NotebookService) List(ctx context.Context, userID uuid.UUID, lang string) ([]*domain.NotebookCard, error) {
	return s.repo.List(ctx, userID, lang, notebookListLimit)
}

func (s *NotebookService) Sentences(ctx context.Context, userID, cardID uuid.UUID) ([]*domain.NotebookSentence, error) {
	if _, _, err := s.repo.Entry(ctx, cardID, userID); err != nil {
		return nil, err
	}
	return s.repo.Sentences(ctx, cardID, userID)
}

func buildLookupPrompt(word, context, lang string) string {
	var sb strings.Builder
	english := i18n.IsEnglish(lang)
	sb.WriteString("You write a vocabulary card for an English learner preparing for IELTS.\n")
	fmt.Fprintf(&sb, "Word or phrase: \"%s\"\n", word)
	if context != "" {
		fmt.Fprintf(&sb, "It was heard in this sentence (use the sense it has here): \"%s\"\n", context)
	}
	sb.WriteString("Give: pos (part of speech, or \"phrase\", \"phrasal verb\", \"idiom\", \"collocation\"); ipa (General American IPA between slashes); ")
	if english {
		sb.WriteString("meaning (a short, simple English definition, at most 14 words); ")
	} else {
		fmt.Fprintf(&sb, "meaning (a short %s meaning, at most 10 words); ", i18n.Name(lang))
	}
	sb.WriteString("example_en (one natural sentence, 8-18 words, a candidate could say in IELTS Speaking, using it); band (the IELTS band, 4-9, of a learner who would use it well).\n")
	sb.WriteString("Respond with ONLY a JSON object, no markdown:\n")
	sb.WriteString(`{"pos": "phrasal verb", "ipa": "/tʊrn ˈdaʊn/", "meaning": "...", "example_en": "...", "band": 6}` + "\n")
	return sb.String()
}

type lookupInfo struct {
	POS       string  `json:"pos"`
	IPA       string  `json:"ipa"`
	Meaning   string  `json:"meaning"`
	ExampleEN string  `json:"example_en"`
	Band      float32 `json:"band"`
}

func parseLookup(content string) (*lookupInfo, error) {
	raw, err := jsonObject(content)
	if err != nil {
		return nil, err
	}
	var p lookupInfo
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, fmt.Errorf("parse llm json: %w", err)
	}
	p.POS, p.IPA = clip(strings.TrimSpace(p.POS), 30), clip(strings.TrimSpace(p.IPA), 80)
	p.Meaning, p.ExampleEN = clip(strings.TrimSpace(p.Meaning), 200), clip(strings.TrimSpace(p.ExampleEN), maxSentenceChars)
	if p.Meaning == "" {
		return nil, errors.New("lookup has no meaning")
	}
	if p.Band < 3 || p.Band > 9 {
		p.Band = 0
	}
	return &p, nil
}

// ---------- the learner's sentences ----------

// UsesPhrase reports whether the sentence uses every word of the phrase in order (forms of a
// word count, e.g. "turned it down" for "turn down").
func UsesPhrase(sentence, phrase string) bool {
	toks := strings.Fields(sentence)
	i := 0
	for _, w := range strings.Fields(strings.ToLower(phrase)) {
		k := normWordKey(w)
		if k == "" {
			continue
		}
		found := false
		for ; i < len(toks); i++ {
			if usesWord(toks[i], k) {
				found = true
				i++
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

// GradeSentence grades a sentence of the learner's for a card; a sentence that passes becomes
// the card's example.
func (s *NotebookService) GradeSentence(ctx context.Context, userID, cardID uuid.UUID, lang, text string) (*domain.NotebookSentence, error) {
	text = strings.Join(strings.Fields(text), " ")
	n := len(strings.Fields(text))
	if n < minSentenceWords || n > maxSentenceWords || len([]rune(text)) > maxSentenceChars {
		return nil, fmt.Errorf("%w: sentence", ErrNotebookInput)
	}
	word, meaning, err := s.repo.Entry(ctx, cardID, userID)
	if err != nil {
		return nil, err
	}
	if s.llm == nil {
		return nil, ErrLessonNoMaker
	}
	reply, err := s.llm.Complete(ctx, "", buildGradePrompt(word, meaning, text, lang))
	if err != nil {
		return nil, fmt.Errorf("grade sentence: %w", err)
	}
	v, err := parseVerdict(reply)
	if err != nil {
		return nil, fmt.Errorf("grade sentence: %w", err)
	}
	if !UsesPhrase(text, word) { // the LLM sometimes misses that the word is not there
		v.UsesTarget = false
		v.Score = float32(math.Min(float64(v.Score), 3))
	}
	out := &domain.NotebookSentence{ReviewWordID: cardID, Text: text, Score: v.Score, Verdict: *v}
	out.Accepted = v.Score >= SentencePassScore && v.UsesTarget && v.MeaningOK && v.GrammarOK
	if err := s.repo.AddSentence(ctx, userID, out); err != nil {
		return nil, err
	}
	if out.Accepted {
		if err := s.repo.SetMyExample(ctx, cardID, lang, text, v.Score); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func buildGradePrompt(word, meaning, sentence, lang string) string {
	var sb strings.Builder
	sb.WriteString("You are an IELTS teacher. A learner wrote a sentence to practise a word or phrase.\n")
	fmt.Fprintf(&sb, "Target: \"%s\"", word)
	if meaning != "" {
		fmt.Fprintf(&sb, " (meaning: %s)", meaning)
	}
	fmt.Fprintf(&sb, "\nSentence: \"%s\"\n", sentence)
	sb.WriteString("Check: usesTarget (the sentence uses the target or a form of it); meaningOk (it is used with a correct meaning); grammarOk (no grammar or spelling errors); natural (a fluent speaker would say it). ")
	sb.WriteString("score 0-10: 9-10 natural and correct, 7-8 correct with small awkwardness, 4-6 understandable with errors, 0-3 wrong use or not using the target. ")
	sb.WriteString("corrected: the sentence fixed with as few changes as possible (the same sentence when it is already good). ")
	if i18n.IsEnglish(lang) {
		sb.WriteString("feedback: 1-2 short, kind sentences in simple English about what is good and what to fix.\n")
	} else {
		fmt.Fprintf(&sb, "feedback: 1-2 short, kind sentences in %s about what is good and what to fix.\n", i18n.Name(lang))
	}
	sb.WriteString("Respond with ONLY a JSON object, no markdown:\n")
	sb.WriteString(`{"usesTarget": true, "meaningOk": true, "grammarOk": false, "natural": true, "score": 6, "corrected": "...", "feedback": "..."}` + "\n")
	return sb.String()
}

func parseVerdict(content string) (*domain.SentenceVerdict, error) {
	raw, err := jsonObject(content)
	if err != nil {
		return nil, err
	}
	var v domain.SentenceVerdict
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		return nil, fmt.Errorf("parse llm json: %w", err)
	}
	v.Score = float32(math.Max(0, math.Min(10, math.Round(float64(v.Score)*2)/2)))
	v.Corrected = clip(strings.TrimSpace(v.Corrected), maxSentenceChars)
	v.Feedback = clip(strings.TrimSpace(v.Feedback), 400)
	return &v, nil
}

// SpeakResult is Azure's score of the learner reading their sentence.
type SpeakResult struct {
	Sentence *domain.NotebookSentence
	Score    float32 // pronunciation score 0-100
	Accuracy float32
	Fluency  float32
	Words    []domain.WordScore
	Heard    string
}

// Speak scores the learner reading one of their sentences aloud.
func (s *NotebookService) Speak(ctx context.Context, userID, sentenceID uuid.UUID, wav []byte) (*SpeakResult, error) {
	if s.scorer == nil {
		return nil, ErrLessonNoMaker
	}
	sent, err := s.repo.Sentence(ctx, sentenceID, userID)
	if err != nil {
		return nil, err
	}
	res, err := s.scorer.Score(ctx, TrimSilenceWAV(wav), sent.Text)
	if err != nil {
		return nil, fmt.Errorf("score sentence: %w", err)
	}
	if err := s.repo.SetPronScore(ctx, sent.ID, res.PronScore); err != nil {
		return nil, err
	}
	sent.PronScore = &res.PronScore
	return &SpeakResult{Sentence: sent, Score: res.PronScore, Accuracy: res.OverallScore, Fluency: res.FluencyScore, Words: res.WordScores, Heard: res.RecognizedText}, nil
}
