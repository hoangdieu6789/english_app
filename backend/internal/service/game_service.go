package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math/rand/v2"
	"regexp"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/i18n"
	"englishapp/backend/internal/repository"
)

// Vocabulary games (docs/tickets/GAME-001-vocab-games-plan.md): decks of the learner's own
// words or of a band, the Freerice-style vocab level, saved plays, and the background job that
// writes the meaning of every word.

const (
	GameLevels        = 60 // Level Climb levels over the whole word list
	gameDeckSize      = 40
	gameMaxDeck       = 80
	gameMinDeck       = 4  // a 4-choice question needs 4 cards
	gameDistractors   = 60 // wrong choices sent with a deck
	gameLevelQuestion = 20 // words per Level Climb batch
	enrichBatch       = 20 // words per LLM call (same as new review words)
)

var (
	ErrUnknownGame  = errors.New("unknown game")
	ErrUnknownDeck  = errors.New("unknown deck")
	ErrDeckTooSmall = errors.New("not enough words with a meaning yet")
	ErrBadPlay      = errors.New("invalid game result")
)

// Games that can be saved; a game is added here when it is built.
var gameNames = map[string]bool{
	"word-match": true, "meteor": true, "bubble-pop": true, "level-climb": true, "broom-flight": true,
}

var bandDeck = regexp.MustCompile(`^band-([4-8])$`)

// GameDeck is the words of one game plus wrong choices for multiple-choice games.
type GameDeck struct {
	Deck        string
	Cards       []*domain.GameCard
	Distractors []*domain.GameCard
	Level       int     // Level Climb: the level of the cards
	LevelBand   float32 // the band of that level's words
}

// GameSummary is shown on the games page.
type GameSummary struct {
	Bests     []domain.GameBest
	Level     int // 0 = not placed yet
	LevelBand float32
	MyWords   int // cards in the "My words" deck
}

type GameService struct {
	repo  repository.GameRepository
	vocab *VocabService

	orderOnce sync.Once
	orderErr  error
	order     []uuid.UUID // every headword in level order
	bands     []float32
}

func NewGameService(repo repository.GameRepository, vocab *VocabService) *GameService {
	return &GameService{repo: repo, vocab: vocab}
}

func (s *GameService) loadOrder(ctx context.Context) error {
	s.orderOnce.Do(func() {
		s.order, s.bands, s.orderErr = s.repo.VocabOrder(ctx)
		if s.orderErr == nil && len(s.order) < GameLevels {
			s.orderErr = fmt.Errorf("only %d words for %d levels", len(s.order), GameLevels)
		}
	})
	return s.orderErr
}

// levelSlice returns the [from, to) indexes of a level in the word order.
func (s *GameService) levelSlice(level int) (int, int) {
	n := len(s.order)
	return (level - 1) * n / GameLevels, level * n / GameLevels
}

// LevelBand is the median band of a level's words.
func (s *GameService) levelBand(level int) float32 {
	from, to := s.levelSlice(level)
	return s.bands[(from+to)/2]
}

// levelForBand is the first level whose median word reaches the band.
func (s *GameService) levelForBand(band float32) int {
	for l := 1; l <= GameLevels; l++ {
		if s.levelBand(l) >= band {
			return l
		}
	}
	return GameLevels
}

// enrichSome writes the details of up to enrichBatch words (one LLM call); errors are logged:
// the deck is served with the words that are ready.
func (s *GameService) enrichSome(ctx context.Context, words []*domain.VocabWord, lang string) {
	if len(words) == 0 || s.vocab == nil || s.vocab.enricher == nil {
		return
	}
	if len(words) > enrichBatch {
		words = words[:enrichBatch]
	}
	if err := s.vocab.enrich(ctx, words, lang); err != nil {
		log.Printf("games: enrich %d words (%s): %v", len(words), lang, err)
	}
}

// ensureBand makes at least need words of [from, to) ready in lang (one LLM call at most).
func (s *GameService) ensureBand(ctx context.Context, lang string, from, to float32, need int) error {
	ready, err := s.repo.CountReady(ctx, lang, from, to)
	if err != nil || ready >= need {
		return err
	}
	words, err := s.repo.UnenrichedInBand(ctx, lang, from, to, enrichBatch)
	if err != nil {
		return err
	}
	s.enrichSome(ctx, words, lang)
	return nil
}

func excludeCards(cards []*domain.GameCard, drop map[uuid.UUID]bool) []*domain.GameCard {
	out := cards[:0]
	for _, c := range cards {
		if !drop[c.ID] {
			out = append(out, c)
		}
	}
	return out
}

func cardIDs(cards []*domain.GameCard) map[uuid.UUID]bool {
	ids := make(map[uuid.UUID]bool, len(cards))
	for _, c := range cards {
		ids[c.ID] = true
	}
	return ids
}

// Deck returns up to n cards of a deck ("mine" or "band-4".."band-8") with wrong choices.
func (s *GameService) Deck(ctx context.Context, userID uuid.UUID, lang, deck string, n int) (*GameDeck, error) {
	lang = i18n.Normalize(lang)
	if n < gameMinDeck || n > gameMaxDeck {
		n = gameDeckSize
	}
	var cards []*domain.GameCard
	var from, to float32
	switch m := bandDeck.FindStringSubmatch(deck); {
	case deck == "mine":
		// Vocab cards added in another language get their meaning in this one first.
		if err := s.vocab.TranslateCards(ctx, userID, lang, enrichBatch); err != nil {
			log.Printf("games: translate cards: %v", err)
		}
		var err error
		if cards, err = s.repo.DeckMine(ctx, userID, lang, n); err != nil {
			return nil, fmt.Errorf("my words: %w", err)
		}
		g, err := s.vocab.Goals(ctx, userID)
		if err != nil {
			return nil, err
		}
		from, to = g.BandFrom+0.01, g.BandTo+0.01 // new words: band in (BandFrom, BandTo]
		if len(cards) < n {                       // few cards yet: add words of the learner's band range
			if err := s.ensureBand(ctx, lang, from, to, n); err != nil {
				return nil, err
			}
			more, err := s.repo.DeckBand(ctx, lang, from, to, n)
			if err != nil {
				return nil, err
			}
			more = excludeCards(more, cardIDs(cards))
			cards = append(cards, more[:min(len(more), n-len(cards))]...)
		}
	case m != nil:
		b, _ := strconv.Atoi(m[1])
		from, to = float32(b), float32(b+1)
		if err := s.ensureBand(ctx, lang, from, to, n+gameDistractors); err != nil {
			return nil, err
		}
		var err error
		if cards, err = s.repo.DeckBand(ctx, lang, from, to, n); err != nil {
			return nil, err
		}
	default:
		return nil, ErrUnknownDeck
	}
	if len(cards) < gameMinDeck {
		return nil, ErrDeckTooSmall
	}
	distractors, err := s.distractors(ctx, lang, from-1, to+1, cards)
	if err != nil {
		return nil, err
	}
	return &GameDeck{Deck: deck, Cards: cards, Distractors: distractors}, nil
}

// distractors: ready words of a band range that are not in the deck.
func (s *GameService) distractors(ctx context.Context, lang string, from, to float32, cards []*domain.GameCard) ([]*domain.GameCard, error) {
	pool, err := s.repo.DeckBand(ctx, lang, from, to, gameDistractors+len(cards))
	if err != nil {
		return nil, fmt.Errorf("distractors: %w", err)
	}
	pool = excludeCards(pool, cardIDs(cards))
	return pool[:min(len(pool), gameDistractors)], nil
}

// StartLevel is the learner's saved level, or the level of their current band.
func (s *GameService) StartLevel(ctx context.Context, userID uuid.UUID) (level int, placed bool, err error) {
	if err := s.loadOrder(ctx); err != nil {
		return 0, false, err
	}
	if level, err = s.repo.VocabLevel(ctx, userID); err != nil || level > 0 {
		return level, level > 0, err
	}
	g, err := s.vocab.Goals(ctx, userID)
	if err != nil {
		return 0, false, err
	}
	return s.levelForBand(g.CurrentBand), false, nil
}

// LevelDeck returns a batch of random words of one level (1-60) with wrong choices from
// the levels around it.
func (s *GameService) LevelDeck(ctx context.Context, lang string, level int) (*GameDeck, error) {
	lang = i18n.Normalize(lang)
	if err := s.loadOrder(ctx); err != nil {
		return nil, err
	}
	if level < 1 || level > GameLevels {
		return nil, ErrUnknownDeck
	}
	from, to := s.levelSlice(level)
	ids := append([]uuid.UUID(nil), s.order[from:to]...)
	rand.Shuffle(len(ids), func(i, j int) { ids[i], ids[j] = ids[j], ids[i] })
	ids = ids[:min(len(ids), gameLevelQuestion)]
	missing, err := s.repo.UnenrichedByID(ctx, lang, ids)
	if err != nil {
		return nil, err
	}
	s.enrichSome(ctx, missing, lang)
	cards, err := s.repo.WordsByID(ctx, lang, ids)
	if err != nil {
		return nil, err
	}
	if len(cards) < gameMinDeck {
		return nil, ErrDeckTooSmall
	}
	rand.Shuffle(len(cards), func(i, j int) { cards[i], cards[j] = cards[j], cards[i] })
	band := s.levelBand(level)
	distractors, err := s.distractors(ctx, lang, band-1, band+1, cards)
	if err != nil {
		return nil, err
	}
	return &GameDeck{Deck: "level", Cards: cards, Distractors: distractors, Level: level, LevelBand: band}, nil
}

// LevelBandOf is the band of a level's words (for the UI).
func (s *GameService) LevelBandOf(ctx context.Context, level int) (float32, error) {
	if err := s.loadOrder(ctx); err != nil {
		return 0, err
	}
	return s.levelBand(min(GameLevels, max(1, level))), nil
}

// Save checks and saves a finished game. A review card answered wrongly becomes due now.
func (s *GameService) Save(ctx context.Context, p *domain.GamePlay) (best int, err error) {
	if !gameNames[p.Game] {
		return 0, ErrUnknownGame
	}
	if p.Deck != "mine" && p.Deck != "level" && !bandDeck.MatchString(p.Deck) {
		return 0, ErrUnknownDeck
	}
	if p.Score < 0 || p.Correct < 0 || p.Total < p.Correct || p.Total > 2000 || p.DurationMS < 0 ||
		len(p.Answers) > 2000 || p.Level < 0 || p.Level > GameLevels || (p.Level > 0) != (p.Game == "level-climb") {
		return 0, ErrBadPlay
	}
	if p.DurationMS > int(2*time.Hour/time.Millisecond) {
		p.DurationMS = int(2 * time.Hour / time.Millisecond)
	}
	if err := s.repo.SavePlay(ctx, p); err != nil {
		return 0, err
	}
	bests, err := s.repo.Bests(ctx, p.UserID)
	if err != nil {
		return 0, err
	}
	for _, b := range bests {
		if b.Game == p.Game {
			return b.Best, nil
		}
	}
	return p.Score, nil
}

// Summary: best scores, the vocab level and the size of "My words".
func (s *GameService) Summary(ctx context.Context, userID uuid.UUID, lang string) (*GameSummary, error) {
	bests, err := s.repo.Bests(ctx, userID)
	if err != nil {
		return nil, err
	}
	level, placed, err := s.StartLevel(ctx, userID)
	if err != nil {
		return nil, err
	}
	mine, err := s.repo.DeckMine(ctx, userID, i18n.Normalize(lang), 500)
	if err != nil {
		return nil, err
	}
	sum := &GameSummary{Bests: bests, MyWords: len(mine)}
	if placed {
		sum.Level, sum.LevelBand = level, s.levelBand(level)
	}
	return sum, nil
}

// Backfill writes the meaning of every word in each language learners use, one LLM call of
// enrichBatch words per pause, easiest words first. It stops when every word is ready (or
// ctx ends). Words the LLM could not write twice are skipped until the next start.
func (s *GameService) Backfill(ctx context.Context, pause time.Duration) {
	if s.vocab == nil || s.vocab.enricher == nil {
		return
	}
	failures := map[string]map[uuid.UUID]int{}
	for {
		langs, err := s.repo.LangsInUse(ctx)
		if err != nil {
			log.Printf("games backfill: languages: %v", err)
			langs = nil
		}
		seen := map[string]bool{}
		worked := false
		for _, l := range append([]string{"vi", "en"}, langs...) {
			l = i18n.Normalize(l)
			if seen[l] {
				continue
			}
			seen[l] = true
			if failures[l] == nil {
				failures[l] = map[uuid.UUID]int{}
			}
			var skip []uuid.UUID
			for id, n := range failures[l] {
				if n >= 2 {
					skip = append(skip, id)
				}
			}
			words, err := s.repo.NextUnenriched(ctx, l, skip, enrichBatch)
			if err != nil {
				log.Printf("games backfill: next words: %v", err)
				continue
			}
			if len(words) == 0 {
				continue
			}
			worked = true
			wait := pause
			if err := s.vocab.enrich(ctx, words, l); err != nil {
				// The whole call failed (provider down, bad JSON): try the same words later.
				log.Printf("games backfill (%s): %v", l, err)
				wait = 10 * pause
			} else {
				for _, w := range words {
					if !w.Enriched || !w.Translated { // left out by the LLM's answer
						failures[l][w.ID]++
					}
				}
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(wait):
			}
		}
		if !worked {
			log.Printf("games backfill: every word has a meaning")
			return
		}
	}
}
