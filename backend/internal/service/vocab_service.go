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
	"englishapp/backend/internal/i18n"
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

// VocabEnricher writes the learner-facing details of words: POS, IPA and an English example
// (shared by every language), and the meaning and example translation in lang. examples
// holds the already written example of a word, which the translation must follow.
type VocabEnricher interface {
	Enrich(ctx context.Context, words []string, examples map[string]string, lang string) (map[string]domain.VocabInfo, error)
}

// Goals is the learner's band range for new words.
type Goals struct {
	MeasuredBand float32  // 90-day IELTS average; 0 when none
	SelfBand     *float32 // the learner's own estimate
	Lang         string   // the learner's language (internal/i18n)
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

// ErrInvalidLang: the language is not supported (internal/i18n).
var ErrInvalidLang = errors.New("unsupported language")

// SetLang saves the learner's language and writes the meanings of their vocab cards in it
// in the background.
func (s *VocabService) SetLang(ctx context.Context, userID uuid.UUID, lang string) error {
	if !i18n.Supported(lang) {
		return ErrInvalidLang
	}
	lang = i18n.Normalize(lang)
	if err := s.users.UpdateLang(ctx, userID, lang); err != nil {
		return err
	}
	if s.enricher != nil {
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 2*enrichTimeout)
			defer cancel()
			if err := s.TranslateCards(ctx, userID, lang, maxTranslateCards); err != nil {
				log.Printf("vocab: translate cards: %v", err)
			}
		}()
	}
	return nil
}

// maxTranslateCards: vocab cards translated per call (one LLM call per 20 words).
const maxTranslateCards = 60

// TranslateCards writes the meaning in lang of up to limit of the learner's vocab cards that
// have none (after a language change).
func (s *VocabService) TranslateCards(ctx context.Context, userID uuid.UUID, lang string, limit int) error {
	if s.enricher == nil {
		return nil
	}
	words, err := s.repo.Untranslated(ctx, userID, lang, limit)
	if err != nil || len(words) == 0 {
		return err
	}
	for start := 0; start < len(words); start += maxNewWords {
		end := min(start+maxNewWords, len(words))
		if err := s.enrich(ctx, words[start:end], lang); err != nil {
			return err
		}
	}
	return nil
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
	g := &Goals{MeasuredBand: measured, SelfBand: user.SelfBand, TargetBand: user.TargetBand, CurrentBand: defaultCurrentBand, Lang: i18n.Normalize(user.Lang)}
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
func (s *VocabService) AddNewWords(ctx context.Context, userID uuid.UUID, lang string, n int) ([]*domain.VocabWord, error) {
	lang = i18n.Normalize(lang)
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
	words, err := s.repo.PickNew(ctx, userID, lang, g.BandFrom, g.BandTo, known, n)
	if err != nil {
		return nil, fmt.Errorf("pick new words: %w", err)
	}
	if len(words) == 0 {
		return nil, ErrNoWordsLeft
	}
	if err := s.enrich(ctx, words, lang); err != nil {
		log.Printf("vocab: enrich: %v", err)
	}
	var added []*domain.VocabWord
	for _, w := range words {
		if !w.Enriched || !w.Translated {
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
	s.prefetchNext(userID, lang, g, known)
	return added, nil
}

// enrich writes the details of the words that have none, or no meaning in lang (one LLM
// call), and saves them. A word with a written example keeps it; the translation follows it.
func (s *VocabService) enrich(ctx context.Context, words []*domain.VocabWord, lang string) error {
	var missing []string
	examples := map[string]string{}
	for _, w := range words {
		if !w.Enriched || !w.Translated {
			missing = append(missing, w.Word)
			if w.Enriched {
				examples[w.Word] = w.Info.ExampleEN
			}
		}
	}
	if len(missing) == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, enrichTimeout)
	defer cancel()
	infos, err := s.enricher.Enrich(ctx, missing, examples, lang)
	if err != nil {
		return err
	}
	for _, w := range words {
		info, ok := infos[w.Word]
		if (w.Enriched && w.Translated) || !ok {
			continue
		}
		if w.Enriched { // keep the shared details already written
			info.POS, info.IPA, info.ExampleEN = w.Info.POS, w.Info.IPA, w.Info.ExampleEN
		}
		info.Band = w.Band
		w.Info, w.Enriched, w.Translated = info, true, true
		if err := s.repo.SaveEnrichment(ctx, w, lang); err != nil {
			return fmt.Errorf("save details of %q: %w", w.Word, err)
		}
	}
	return nil
}

func (s *VocabService) prefetchNext(userID uuid.UUID, lang string, g *Goals, known []string) {
	if _, busy := s.prefetch.LoadOrStore(userID, struct{}{}); busy {
		return
	}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer s.prefetch.Delete(userID)
		ctx, cancel := context.WithTimeout(context.Background(), enrichTimeout)
		defer cancel()
		next, err := s.repo.PickNew(ctx, userID, lang, g.BandFrom, g.BandTo, known, maxNewWords)
		if err == nil {
			err = s.enrich(ctx, next, lang)
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

func (e *LLMVocabEnricher) Enrich(ctx context.Context, words []string, examples map[string]string, lang string) (map[string]domain.VocabInfo, error) {
	reply, err := e.llm.Complete(ctx, "", buildVocabPrompt(words, examples, lang))
	if err != nil {
		return nil, err
	}
	return parseVocabInfo(reply, words, i18n.IsEnglish(lang))
}

func buildVocabPrompt(words []string, examples map[string]string, lang string) string {
	var sb strings.Builder
	english := i18n.IsEnglish(lang)
	if english {
		sb.WriteString("You write vocabulary cards for English learners preparing for IELTS Speaking.\n")
	} else {
		fmt.Fprintf(&sb, "You write vocabulary cards for %s-speaking learners preparing for IELTS Speaking.\n", i18n.Name(lang))
	}
	sb.WriteString("For each English word below give: its most useful part of speech; its General American IPA between slashes; ")
	if english {
		sb.WriteString("a short, simple English definition (at most 12 words, the sense most useful in everyday and IELTS speaking); ")
	} else {
		fmt.Fprintf(&sb, "a short %s meaning (at most 8 words, the sense most useful in everyday and IELTS speaking); ", i18n.Name(lang))
	}
	sb.WriteString("one natural example sentence (8-18 words) a candidate could say in IELTS Speaking, using the word or one of its forms")
	if english {
		sb.WriteString(". Write the examples yourself; leave example_translation empty.\n")
	} else {
		fmt.Fprintf(&sb, "; and the %s translation of that sentence. Write the examples yourself.\n", i18n.Name(lang))
	}
	sb.WriteString("When a word below already has an example, return that exact example and translate it.\n")
	sb.WriteString("Respond with ONLY a JSON object, no markdown, in this exact shape:\n")
	sb.WriteString(`{"words": [{"word": "atmosphere", "pos": "noun", "ipa": "/ˈætməsfɪr/", "meaning": "...", "example_en": "I love the relaxed atmosphere of small cafés in my hometown.", "example_translation": "..."}]}` + "\n")
	sb.WriteString("Words:\n")
	for _, w := range words {
		if ex := examples[w]; ex != "" {
			sb.WriteString("- " + w + " (example: " + ex + ")\n")
		} else {
			sb.WriteString("- " + w + "\n")
		}
	}
	return sb.String()
}

// parseVocabInfo keeps the cards that answer a requested word and have every field; the
// example must use the word (or a form of it).
func parseVocabInfo(content string, requested []string, english bool) (map[string]domain.VocabInfo, error) {
	start := strings.Index(content, "{")
	if start < 0 {
		return nil, fmt.Errorf("no JSON object found in llm response")
	}
	var parsed struct {
		Words []struct {
			Word               string `json:"word"`
			POS                string `json:"pos"`
			IPA                string `json:"ipa"`
			Meaning            string `json:"meaning"`
			ExampleEN          string `json:"example_en"`
			ExampleTranslation string `json:"example_translation"`
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
			POS:                strings.TrimSpace(c.POS),
			IPA:                strings.TrimSpace(c.IPA),
			Meaning:            strings.TrimSpace(c.Meaning),
			ExampleEN:          strings.TrimSpace(c.ExampleEN),
			ExampleTranslation: strings.TrimSpace(c.ExampleTranslation),
		}
		if english {
			info.ExampleTranslation = ""
		}
		if !want[word] || info.POS == "" || info.Meaning == "" || (!english && info.ExampleTranslation == "") {
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
