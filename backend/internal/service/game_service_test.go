package service

import (
	"context"
	"errors"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
)

// memGames is a GameRepository over the memVocab words (vocab_service_test.go).
type memGames struct {
	v     *memVocab
	mu    sync.Mutex
	plays []*domain.GamePlay
	level map[uuid.UUID]int
	due   []uuid.UUID
	langs []string
}

func newMemGames(v *memVocab) *memGames {
	return &memGames{v: v, level: map[uuid.UUID]int{}}
}

func (m *memGames) card(w *domain.VocabWord, lang string) (*domain.GameCard, bool) {
	t, ok := m.v.tr[w.ID][lang]
	if !ok || !w.Enriched {
		return nil, false
	}
	return &domain.GameCard{ID: w.ID, Word: w.Word, Band: w.Band, POS: w.Info.POS, IPA: w.Info.IPA, Meaning: t.Meaning, ExampleEN: w.Info.ExampleEN}, true
}

func (m *memGames) DeckMine(_ context.Context, uid uuid.UUID, lang string, limit int) ([]*domain.GameCard, error) {
	m.v.mu.Lock()
	defer m.v.mu.Unlock()
	var out []*domain.GameCard
	for _, w := range m.v.words {
		if c, ok := m.card(w, lang); ok && m.v.cards[uid][w.ID] && len(out) < limit {
			out = append(out, c)
		}
	}
	return out, nil
}

func (m *memGames) DeckBand(_ context.Context, lang string, from, to float32, limit int) ([]*domain.GameCard, error) {
	m.v.mu.Lock()
	defer m.v.mu.Unlock()
	var out []*domain.GameCard
	for _, w := range m.v.words {
		if c, ok := m.card(w, lang); ok && w.Band >= from && w.Band < to && len(out) < limit {
			out = append(out, c)
		}
	}
	return out, nil
}

func (m *memGames) CountReady(ctx context.Context, lang string, from, to float32) (int, error) {
	cs, _ := m.DeckBand(ctx, lang, from, to, 1<<30)
	return len(cs), nil
}

func (m *memGames) unready(lang string, keep func(*domain.VocabWord) bool, limit int) []*domain.VocabWord {
	m.v.mu.Lock()
	defer m.v.mu.Unlock()
	var out []*domain.VocabWord
	for _, w := range m.v.words {
		if _, ok := m.v.tr[w.ID][lang]; (!ok || !w.Enriched) && keep(w) && len(out) < limit {
			out = append(out, m.v.withLang(w, lang))
		}
	}
	return out
}

func (m *memGames) UnenrichedInBand(_ context.Context, lang string, from, to float32, limit int) ([]*domain.VocabWord, error) {
	return m.unready(lang, func(w *domain.VocabWord) bool { return w.Band >= from && w.Band < to }, limit), nil
}

func idSet(ids []uuid.UUID) map[uuid.UUID]bool {
	s := map[uuid.UUID]bool{}
	for _, id := range ids {
		s[id] = true
	}
	return s
}

func (m *memGames) WordsByID(_ context.Context, lang string, ids []uuid.UUID) ([]*domain.GameCard, error) {
	m.v.mu.Lock()
	defer m.v.mu.Unlock()
	want := idSet(ids)
	var out []*domain.GameCard
	for _, w := range m.v.words {
		if c, ok := m.card(w, lang); ok && want[w.ID] {
			out = append(out, c)
		}
	}
	return out, nil
}

func (m *memGames) UnenrichedByID(_ context.Context, lang string, ids []uuid.UUID) ([]*domain.VocabWord, error) {
	want := idSet(ids)
	return m.unready(lang, func(w *domain.VocabWord) bool { return want[w.ID] }, 1<<30), nil
}

func (m *memGames) VocabOrder(context.Context) ([]uuid.UUID, []float32, error) {
	ws := append([]*domain.VocabWord(nil), m.v.words...)
	sort.SliceStable(ws, func(i, j int) bool {
		if ws[i].Band != ws[j].Band {
			return ws[i].Band < ws[j].Band
		}
		return ws[i].Rank < ws[j].Rank
	})
	ids, bands := make([]uuid.UUID, len(ws)), make([]float32, len(ws))
	for i, w := range ws {
		ids[i], bands[i] = w.ID, w.Band
	}
	return ids, bands, nil
}

func (m *memGames) SavePlay(_ context.Context, p *domain.GamePlay) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.plays = append(m.plays, p)
	for _, a := range p.Answers {
		if !a.Correct {
			m.due = append(m.due, a.WordID)
		}
	}
	if p.Level > 0 {
		m.level[p.UserID] = p.Level
	}
	return nil
}

func (m *memGames) Bests(_ context.Context, uid uuid.UUID) ([]domain.GameBest, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	best := map[string]*domain.GameBest{}
	var out []domain.GameBest
	for _, p := range m.plays {
		if p.UserID != uid {
			continue
		}
		b := best[p.Game]
		if b == nil {
			b = &domain.GameBest{Game: p.Game}
			best[p.Game] = b
		}
		b.Plays++
		b.Best = max(b.Best, p.Score)
	}
	for _, b := range best {
		out = append(out, *b)
	}
	return out, nil
}

func (m *memGames) VocabLevel(_ context.Context, uid uuid.UUID) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.level[uid], nil
}

func (m *memGames) LangsInUse(context.Context) ([]string, error) { return m.langs, nil }

func (m *memGames) NextUnenriched(_ context.Context, lang string, skip []uuid.UUID, limit int) ([]*domain.VocabWord, error) {
	s := idSet(skip)
	return m.unready(lang, func(w *domain.VocabWord) bool { return !s[w.ID] }, limit), nil
}

func newGameTest(t *testing.T) (*GameService, *memGames, *fakeEnricher, uuid.UUID) {
	t.Helper()
	users := &memUsers{}
	u, _ := users.Create(context.Background(), "g@example.com", "x")
	v := newMemVocab()
	enricher := &fakeEnricher{}
	g := newMemGames(v)
	return NewGameService(g, NewVocabService(v, users, enricher)), g, enricher, u.ID
}

func TestGameLevels(t *testing.T) {
	svc, _, _, uid := newGameTest(t)
	ctx := context.Background()
	if err := svc.loadOrder(ctx); err != nil {
		t.Fatal(err)
	}
	// Levels cover the word list in order, without gaps.
	if from, _ := svc.levelSlice(1); from != 0 {
		t.Fatalf("level 1 starts at %d", from)
	}
	if _, to := svc.levelSlice(GameLevels); to != len(svc.order) {
		t.Fatalf("level 60 ends at %d of %d", to, len(svc.order))
	}
	if b1, b60 := svc.levelBand(1), svc.levelBand(GameLevels); b1 != 4 || b60 != 8 {
		t.Fatalf("level bands 1=%v 60=%v", b1, b60)
	}
	// No level yet: start at the level of the learner's band (5.0 by default).
	level, placed, err := svc.StartLevel(ctx, uid)
	if err != nil || placed || svc.levelBand(level) != 5 || svc.levelBand(level-1) >= 5 {
		t.Fatalf("start level %d placed=%v band=%v err=%v", level, placed, svc.levelBand(level), err)
	}
}

func TestGameLevelDeckEnrichesOnce(t *testing.T) {
	svc, _, enricher, _ := newGameTest(t)
	ctx := context.Background()
	d, err := svc.LevelDeck(ctx, "vi", 31)
	if err != nil {
		t.Fatal(err)
	}
	if len(enricher.calls) < 1 || len(enricher.calls[0]) != gameLevelQuestion {
		t.Fatalf("enrich calls %v", enricher.calls)
	}
	if len(d.Cards) != gameLevelQuestion || d.Level != 31 || d.LevelBand < 5.5 || d.LevelBand > 6.5 {
		t.Fatalf("deck: %d cards level %d band %v", len(d.Cards), d.Level, d.LevelBand)
	}
	in := cardIDs(d.Cards)
	for _, c := range d.Distractors {
		if in[c.ID] {
			t.Fatalf("distractor %q is also a card", c.Word)
		}
	}
	if _, err := svc.LevelDeck(ctx, "vi", 61); !errors.Is(err, ErrUnknownDeck) {
		t.Fatalf("level 61: %v", err)
	}
}

func TestGameDecks(t *testing.T) {
	svc, _, enricher, uid := newGameTest(t)
	ctx := context.Background()
	if _, err := svc.Deck(ctx, uid, "vi", "band-9", 10); !errors.Is(err, ErrUnknownDeck) {
		t.Fatalf("band-9: %v", err)
	}
	// Nothing written yet: the deck enriches one batch and plays with it.
	d, err := svc.Deck(ctx, uid, "vi", "band-6", 10)
	if err != nil || len(d.Cards) != 10 || len(enricher.calls) != 1 {
		t.Fatalf("band-6: %v cards=%d calls=%d", err, len(d.Cards), len(enricher.calls))
	}
	for _, c := range d.Cards {
		if c.Band < 6 || c.Band >= 7 || c.Meaning != "vi:"+c.Word {
			t.Fatalf("card %+v", c)
		}
	}
	// My words with no cards: filled with words of the learner's band range.
	d, err = svc.Deck(ctx, uid, "vi", "mine", 8)
	if err != nil || len(d.Cards) != 8 {
		t.Fatalf("mine: %v %d", err, len(d.Cards))
	}
	// The LLM is down and nothing is ready in English: too few words.
	enricher.fail = true
	if _, err := svc.Deck(ctx, uid, "en", "band-8", 10); !errors.Is(err, ErrDeckTooSmall) {
		t.Fatalf("no meanings: %v", err)
	}
}

func TestGameSave(t *testing.T) {
	svc, g, _, uid := newGameTest(t)
	ctx := context.Background()
	bad := []*domain.GamePlay{
		{UserID: uid, Game: "chess", Deck: "mine", Total: 1},
		{UserID: uid, Game: "meteor", Deck: "band-3", Total: 1},
		{UserID: uid, Game: "meteor", Deck: "mine", Correct: 5, Total: 4},
		{UserID: uid, Game: "meteor", Deck: "mine", Total: 4, Level: 3},       // level only for Level Climb
		{UserID: uid, Game: "level-climb", Deck: "level", Total: 4, Level: 0}, // Level Climb needs a level
	}
	for _, p := range bad {
		if _, err := svc.Save(ctx, p); err == nil {
			t.Errorf("saved invalid play %+v", p)
		}
	}
	w := uuid.New()
	best, err := svc.Save(ctx, &domain.GamePlay{UserID: uid, Game: "meteor", Deck: "band-5", Score: 120, Correct: 3, Total: 4,
		Answers: []domain.GameAnswer{{WordID: w, Correct: false}}})
	if err != nil || best != 120 || len(g.due) != 1 || g.due[0] != w {
		t.Fatalf("save: best=%d err=%v due=%v", best, err, g.due)
	}
	if best, _ = svc.Save(ctx, &domain.GamePlay{UserID: uid, Game: "meteor", Deck: "mine", Score: 80, Correct: 2, Total: 2}); best != 120 {
		t.Fatalf("best after a lower score = %d", best)
	}
	if _, err := svc.Save(ctx, &domain.GamePlay{UserID: uid, Game: "level-climb", Deck: "level", Score: 10, Correct: 1, Total: 1, Level: 33}); err != nil {
		t.Fatal(err)
	}
	if level, placed, _ := svc.StartLevel(ctx, uid); level != 33 || !placed {
		t.Fatalf("saved level %d placed=%v", level, placed)
	}
}

// skipEnricher leaves one word out of every answer (an LLM that cannot write it).
type skipEnricher struct {
	fakeEnricher
	skip string
}

func (s *skipEnricher) Enrich(ctx context.Context, words []string, ex map[string]string, lang string) (map[string]domain.VocabInfo, error) {
	out, err := s.fakeEnricher.Enrich(ctx, words, ex, lang)
	delete(out, s.skip)
	return out, err
}

func TestGameBackfill(t *testing.T) {
	users := &memUsers{}
	v := newMemVocab()
	v.words = v.words[:45] // a short list
	enricher := &skipEnricher{skip: v.words[3].Word}
	g := newMemGames(v)
	g.langs = []string{"vi"}
	svc := NewGameService(g, NewVocabService(v, users, enricher))
	done := make(chan struct{})
	go func() { svc.Backfill(context.Background(), 0); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("backfill did not finish")
	}
	for _, lang := range []string{"vi", "en"} {
		left, _ := g.NextUnenriched(context.Background(), lang, nil, 100)
		if len(left) != 1 || left[0].Word != enricher.skip {
			t.Fatalf("%s: words left %d", lang, len(left))
		}
	}
	// The left-out word was asked twice per language, then skipped.
	asked := 0
	for _, call := range enricher.calls {
		for _, w := range call {
			if w == enricher.skip {
				asked++
			}
		}
	}
	if asked != 4 {
		t.Fatalf("left-out word asked %d times, want 4", asked)
	}
}
