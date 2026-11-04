package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
	"englishapp/backend/internal/vocab"
)

const (
	defaultCurrentBand = 5.0 // no measured band and no self-estimate yet
	maxNewWords        = 20
	enrichTimeout      = 2 * time.Minute
)

var (
	ErrInvalidBand     = errors.New("band must be between 3.0 and 9.0 in steps of 0.5")
	ErrNoWordsLeft     = errors.New("no new words left in the band range")
	ErrVocabUnenriched = errors.New("the AI could not write the word details; try again later")
)

// VocabEnricher writes the learner-facing details of words (meaning in Vietnamese, IPA,
// an example sentence).
type VocabEnricher interface {
	Enrich(ctx context.Context, words []string) (map[string]domain.VocabInfo, error)
}

// Goals is the learner's band range for new words.
type Goals struct {
	MeasuredBand float32  // 90-day IELTS average; 0 when none
	SelfBand     *float32 // the learner's own estimate
	FeedbackLang string   // vi | en: language of the AI feedback
	TargetBand   *float32
	CurrentBand  float32 // measured, else self estimate, else 5.0
	BandFrom     float32 // new words: band in (BandFrom, BandTo]
	BandTo       float32
	Remaining    int // new words left in the range
}

type VocabService struct {
	repo     repository.VocabRepository
	users    repository.UserRepository
	enricher VocabEnricher // nil = new words are off
	wg       sync.WaitGroup
	prefetch sync.Map // userID -> struct{}: one background enrichment per learner
}

func NewVocabService(repo repository.VocabRepository, users repository.UserRepository, enricher VocabEnricher) *VocabService {
	return &VocabService{repo: repo, users: users, enricher: enricher}
}

// Wait blocks until background enrichment has finished (tests).
func (s *VocabService) Wait() { s.wg.Wait() }

// Seed loads the NGSL/NAWL list into the database (start-up; keeps LLM-written details).
func (s *VocabService) Seed(ctx context.Context) error {
	return s.repo.Seed(ctx, vocab.Words())
}

// BandRange returns the band range of new words: above (current - 0.5), up to the target
// (at least current + 0.5).
func BandRange(current float32, target *float32) (from, to float32) {
	from = current - 0.5
	to = current + 0.5
	if target != nil && *target > to {
		to = *target
	}
	return from, to
}

func validBand(b *float32) bool {
	if b == nil {
		return true
	}
	return *b >= 3 && *b <= 9 && math.Mod(float64(*b)*2, 1) == 0
}

// ErrInvalidLang: the feedback language must be vi or en.
var ErrInvalidLang = errors.New("feedback language must be vi or en")

// SetFeedbackLang saves the language of the AI feedback (vi | en).
func (s *VocabService) SetFeedbackLang(ctx context.Context, userID uuid.UUID, lang string) error {
	if lang != "vi" && lang != "en" {
		return ErrInvalidLang
	}
	return s.users.UpdateFeedbackLang(ctx, userID, lang)
}

// SetGoals saves the learner's self-estimated and target bands (nil clears one).
func (s *VocabService) SetGoals(ctx context.Context, userID uuid.UUID, selfBand, targetBand *float32) error {
	if !validBand(selfBand) || !validBand(targetBand) {
		return ErrInvalidBand
	}
	return s.users.UpdateGoals(ctx, userID, selfBand, targetBand)
}

// knownWords: the headwords of words the learner already says well in free speech.
func (s *VocabService) knownWords(ctx context.Context, userID uuid.UUID) ([]string, error) {
	spoken, err := s.repo.SpokenWords(ctx, userID)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var out []string
	for _, w := range spoken {
		k := normWordKey(w)
		if l, ok := vocab.Lemma(k); ok {
			k = l
		}
		if k != "" && !seen[k] {
			seen[k] = true
			out = append(out, k)
		}
	}
	return out, nil
}

// Goals returns the learner's band range and how many new words are left in it.
func (s *VocabService) Goals(ctx context.Context, userID uuid.UUID) (*Goals, error) {
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	measured, err := s.repo.MeasuredBand(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("measured band: %w", err)
	}
	g := &Goals{MeasuredBand: measured, SelfBand: user.SelfBand, TargetBand: user.TargetBand, CurrentBand: defaultCurrentBand, FeedbackLang: user.FeedbackLang}
	switch {
	case measured > 0:
		g.CurrentBand = float32(math.Round(float64(measured)*10) / 10)
	case user.SelfBand != nil:
		g.CurrentBand = *user.SelfBand
	}
	g.BandFrom, g.BandTo = BandRange(g.CurrentBand, g.TargetBand)
	known, err := s.knownWords(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("known words: %w", err)
	}
	if g.Remaining, err = s.repo.CountNew(ctx, userID, g.BandFrom, g.BandTo, known); err != nil {
		return nil, fmt.Errorf("count new words: %w", err)
	}
	return g, nil
}

// AddNewWords adds up to n new words in the learner's band range as vocab cards (due now).
// Words without details are written by the LLM first; the next batch is prepared in the
// background so the following request is instant.
func (s *VocabService) AddNewWords(ctx context.Context, userID uuid.UUID, n int) ([]*domain.VocabWord, error) {
	if s.enricher == nil {
		return nil, ErrVocabUnenriched
	}
	if n < 1 || n > maxNewWords {
		n = 10
	}
	g, err := s.Goals(ctx, userID)
	if err != nil {
		return nil, err
	}
	known, err := s.knownWords(ctx, userID)
	if err != nil {
		return nil, err
	}
	words, err := s.repo.PickNew(ctx, userID, g.BandFrom, g.BandTo, known, n)
	if err != nil {
		return nil, fmt.Errorf("pick new words: %w", err)
	}
	if len(words) == 0 {
		return nil, ErrNoWordsLeft
	}
	if err := s.enrich(ctx, words); err != nil {
		log.Printf("vocab: enrich: %v", err)
	}
	var added []*domain.VocabWord
	for _, w := range words {
		if !w.Enriched {
			continue // no meaning yet: not useful as a card
		}
		if err := s.repo.AddCard(ctx, userID, w); err != nil {
			return nil, fmt.Errorf("add card: %w", err)
		}
		added = append(added, w)
	}
	if len(added) == 0 {
		return nil, ErrVocabUnenriched
	}
	s.prefetchNext(userID, g, known)
	return added, nil
}

// enrich writes the details of the words that have none (one LLM call) and saves them.
func (s *VocabService) enrich(ctx context.Context, words []*domain.VocabWord) error {
	var missing []string
	for _, w := range words {
		if !w.Enriched {
			missing = append(missing, w.Word)
		}
	}
	if len(missing) == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, enrichTimeout)
	defer cancel()
	infos, err := s.enricher.Enrich(ctx, missing)
	if err != nil {
		return err
	}
	for _, w := range words {
		info, ok := infos[w.Word]
		if w.Enriched || !ok {
			continue
		}
		info.Band = w.Band
		w.Info, w.Enriched = info, true
		if err := s.repo.SaveEnrichment(ctx, w); err != nil {
			return fmt.Errorf("save details of %q: %w", w.Word, err)
		}
	}
	return nil
}

func (s *VocabService) prefetchNext(userID uuid.UUID, g *Goals, known []string) {
	if _, busy := s.prefetch.LoadOrStore(userID, struct{}{}); busy {
		return
	}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer s.prefetch.Delete(userID)
		ctx, cancel := context.WithTimeout(context.Background(), enrichTimeout)
		defer cancel()
		next, err := s.repo.PickNew(ctx, userID, g.BandFrom, g.BandTo, known, maxNewWords)
		if err == nil {
			err = s.enrich(ctx, next)
		}
		if err != nil {
			log.Printf("vocab: prefetch: %v", err)
		}
	}()
}

// LLMVocabEnricher asks the LLM for the details of a batch of words in one call.
type LLMVocabEnricher struct {
	llm LLMCompleter
}

func NewLLMVocabEnricher(llm LLMCompleter) *LLMVocabEnricher {
	return &LLMVocabEnricher{llm: llm}
}

func (e *LLMVocabEnricher) Enrich(ctx context.Context, words []string) (map[string]domain.VocabInfo, error) {
	reply, err := e.llm.Complete(ctx, "", buildVocabPrompt(words))
	if err != nil {
		return nil, err
	}
	return parseVocabInfo(reply, words)
}

func buildVocabPrompt(words []string) string {
	var sb strings.Builder
	sb.WriteString("You write vocabulary cards for Vietnamese learners preparing for IELTS Speaking.\n")
	sb.WriteString("For each English word below give: its most useful part of speech; its General American IPA between slashes; ")
	sb.WriteString("a short Vietnamese meaning (at most 8 words, the sense most useful in everyday and IELTS speaking); ")
	sb.WriteString("one natural example sentence (8-18 words) a candidate could say in IELTS Speaking, using the word or one of its forms; ")
	sb.WriteString("and the Vietnamese translation of that sentence. Write the examples yourself.\n")
	sb.WriteString("Respond with ONLY a JSON object, no markdown, in this exact shape:\n")
	sb.WriteString(`{"words": [{"word": "atmosphere", "pos": "noun", "ipa": "/ˈætməsfɪr/", "meaning_vi": "bầu không khí", "example_en": "I love the relaxed atmosphere of small cafés in my hometown.", "example_vi": "Tôi thích bầu không khí thư thái của những quán cà phê nhỏ ở quê tôi."}]}` + "\n")
	sb.WriteString("Words:\n")
	for _, w := range words {
		sb.WriteString("- " + w + "\n")
	}
	return sb.String()
}

// parseVocabInfo keeps the cards that answer a requested word and have every field; the
// example must use the word (or a form of it).
func parseVocabInfo(content string, requested []string) (map[string]domain.VocabInfo, error) {
	start := strings.Index(content, "{")
	if start < 0 {
		return nil, fmt.Errorf("no JSON object found in llm response")
	}
	var parsed struct {
		Words []struct {
			Word      string `json:"word"`
			POS       string `json:"pos"`
			IPA       string `json:"ipa"`
			MeaningVI string `json:"meaning_vi"`
			ExampleEN string `json:"example_en"`
			ExampleVI string `json:"example_vi"`
		} `json:"words"`
	}
	if err := json.NewDecoder(strings.NewReader(content[start:])).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("parse llm json: %w", err)
	}
	want := map[string]bool{}
	for _, w := range requested {
		want[w] = true
	}
	out := map[string]domain.VocabInfo{}
	for _, c := range parsed.Words {
		word := strings.ToLower(strings.TrimSpace(c.Word))
		info := domain.VocabInfo{
			POS:       strings.TrimSpace(c.POS),
			IPA:       strings.TrimSpace(c.IPA),
			MeaningVI: strings.TrimSpace(c.MeaningVI),
			ExampleEN: strings.TrimSpace(c.ExampleEN),
			ExampleVI: strings.TrimSpace(c.ExampleVI),
		}
		if !want[word] || info.POS == "" || info.MeaningVI == "" || info.ExampleVI == "" {
			continue
		}
		if !strings.HasPrefix(info.IPA, "/") || !strings.HasSuffix(info.IPA, "/") || !usesWord(info.ExampleEN, word) {
			continue
		}
		out[word] = info
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("llm returned no usable word cards")
	}
	return out, nil
}

// usesWord reports whether the sentence contains the word or one of its forms.
func usesWord(sentence, word string) bool {
	for _, tok := range strings.Fields(sentence) {
		t := normWordKey(tok)
		if t == word {
			return true
		}
		if l, ok := vocab.Lemma(t); ok && l == word {
			return true
		}
		// Forms not in the list ("studies" for "study"): share the word's stem.
		stem := word
		if len(stem) > 4 {
			stem = stem[:len(stem)-2]
		}
		if len(t) >= len(stem) && strings.HasPrefix(t, stem) {
			return true
		}
	}
	return false
}
