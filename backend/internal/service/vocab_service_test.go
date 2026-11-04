package service

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/vocab"
)

func f32(v float32) *float32 { return &v }

func TestBandRange(t *testing.T) {
	cases := []struct {
		current  float32
		target   *float32
		from, to float32
	}{
		{6.7, f32(7.5), 6.2, 7.5},
		{6.5, nil, 6.0, 7.0},
		{7.0, f32(6.0), 6.5, 7.5}, // a target below the current band still gives a range
		{5.0, f32(8.0), 4.5, 8.0},
	}
	for _, c := range cases {
		from, to := BandRange(c.current, c.target)
		if diff(from, c.from) || diff(to, c.to) {
			t.Errorf("BandRange(%v, %v) = (%v, %v), want (%v, %v)", c.current, c.target, from, to, c.from, c.to)
		}
	}
}

func diff(a, b float32) bool { return a-b > 0.001 || b-a > 0.001 }

func TestParseVocabInfo(t *testing.T) {
	reply := `Here you go: {"words": [
	 {"word": "atmosphere", "pos": "noun", "ipa": "/ˈætməsfɪr/", "meaning_vi": "bầu không khí", "example_en": "I love the relaxed atmosphere of small cafés.", "example_vi": "Tôi thích bầu không khí thư thái của quán nhỏ."},
	 {"word": "Analyse", "pos": "verb", "ipa": "/ˈænəlaɪz/", "meaning_vi": "phân tích", "example_en": "Scientists analysed the data carefully last year.", "example_vi": "Các nhà khoa học đã phân tích dữ liệu."},
	 {"word": "budget", "pos": "noun", "ipa": "ˈbʌdʒɪt", "meaning_vi": "ngân sách", "example_en": "We set a budget for the trip.", "example_vi": "Chúng tôi đặt ngân sách."},
	 {"word": "cottage", "pos": "noun", "ipa": "/ˈkɑːtɪdʒ/", "meaning_vi": "nhà tranh", "example_en": "My grandparents live in the countryside.", "example_vi": "Ông bà tôi sống ở quê."},
	 {"word": "extra", "pos": "adj", "ipa": "/ˈekstrə/", "meaning_vi": "thêm", "example_en": "I need extra time.", "example_vi": "Tôi cần thêm thời gian."}
	]} thanks`
	got, err := parseVocabInfo(reply, []string{"atmosphere", "analyse", "budget", "cottage"})
	if err != nil {
		t.Fatal(err)
	}
	// budget: IPA without slashes; cottage: example does not use the word; extra: not requested.
	if len(got) != 2 || got["atmosphere"].MeaningVI != "bầu không khí" || got["analyse"].POS != "verb" {
		t.Fatalf("got %+v", got)
	}
	if _, err := parseVocabInfo(`{"words": []}`, []string{"a"}); err == nil {
		t.Error("no usable card must be an error")
	}
}

// ---- fakes ----

type memVocab struct {
	mu       sync.Mutex
	words    []*domain.VocabWord
	cards    map[uuid.UUID]map[uuid.UUID]bool // user -> vocab word ids
	spoken   []string
	measured float32
}

func newMemVocab() *memVocab {
	m := &memVocab{cards: map[uuid.UUID]map[uuid.UUID]bool{}}
	for _, w := range vocab.Words() {
		m.words = append(m.words, &domain.VocabWord{ID: uuid.New(), Word: w.Word, Source: w.Source, Rank: w.Rank, Band: w.Band})
	}
	return m
}

func (m *memVocab) Seed(context.Context, []vocab.Word) error { return nil }

func (m *memVocab) pick(uid uuid.UUID, from, to float32, known []string, limit int) []*domain.VocabWord {
	k := map[string]bool{}
	for _, w := range known {
		k[w] = true
	}
	var out []*domain.VocabWord
	for _, w := range m.words { // already band then rank within each list
		if w.Band > from && w.Band <= to && !k[w.Word] && !m.cards[uid][w.ID] {
			out = append(out, w)
		}
	}
	// band first, then rank
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && (out[j].Band < out[j-1].Band || (out[j].Band == out[j-1].Band && out[j].Rank < out[j-1].Rank)); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}

func (m *memVocab) PickNew(_ context.Context, uid uuid.UUID, from, to float32, known []string, limit int) ([]*domain.VocabWord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []*domain.VocabWord
	for _, w := range m.pick(uid, from, to, known, limit) {
		c := *w
		out = append(out, &c)
	}
	return out, nil
}

func (m *memVocab) CountNew(_ context.Context, uid uuid.UUID, from, to float32, known []string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.pick(uid, from, to, known, 0)), nil
}

func (m *memVocab) SaveEnrichment(_ context.Context, w *domain.VocabWord) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, v := range m.words {
		if v.ID == w.ID {
			v.Info, v.Enriched = w.Info, true
		}
	}
	return nil
}

func (m *memVocab) AddCard(_ context.Context, uid uuid.UUID, w *domain.VocabWord) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cards[uid] == nil {
		m.cards[uid] = map[uuid.UUID]bool{}
	}
	m.cards[uid][w.ID] = true
	return nil
}

func (m *memVocab) SpokenWords(context.Context, uuid.UUID) ([]string, error) { return m.spoken, nil }

func (m *memVocab) MeasuredBand(context.Context, uuid.UUID) (float32, error) { return m.measured, nil }

type fakeEnricher struct {
	mu    sync.Mutex
	calls [][]string
	fail  bool
}

func (f *fakeEnricher) Enrich(_ context.Context, words []string) (map[string]domain.VocabInfo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, words)
	if f.fail {
		return nil, errors.New("llm down")
	}
	out := map[string]domain.VocabInfo{}
	for _, w := range words {
		out[w] = domain.VocabInfo{POS: "noun", IPA: "/x/", MeaningVI: "nghĩa " + w, ExampleEN: "I use " + w + ".", ExampleVI: "Tôi dùng."}
	}
	return out, nil
}

func TestVocabGoalsAndNewWords(t *testing.T) {
	users := &memUsers{}
	u, _ := users.Create(context.Background(), "a@example.com", "x")
	repo := newMemVocab()
	enricher := &fakeEnricher{}
	svc := NewVocabService(repo, users, enricher)
	ctx := context.Background()

	// No measured band, no estimate: 5.0, range (4.5, 5.5].
	g, err := svc.Goals(ctx, u.ID)
	if err != nil || g.CurrentBand != 5 || g.BandFrom != 4.5 || g.BandTo != 5.5 || g.Remaining != 1000 {
		t.Fatalf("default goals: %+v %v", g, err)
	}
	if err := svc.SetGoals(ctx, u.ID, f32(6.5), f32(7.25)); !errors.Is(err, ErrInvalidBand) {
		t.Fatalf("7.25 must be rejected: %v", err)
	}
	if err := svc.SetGoals(ctx, u.ID, f32(6.0), f32(7.5)); err != nil {
		t.Fatal(err)
	}
	// A measured band wins over the estimate: 6.7 -> range (6.2, 7.5] = bands 6.5, 7.0, 7.5.
	repo.measured = 6.7
	repo.spoken = []string{"atmospheres", "Coherent"} // known words are skipped (by headword)
	g, err = svc.Goals(ctx, u.ID)
	if err != nil || g.CurrentBand != 6.7 || g.BandTo != 7.5 {
		t.Fatalf("goals: %+v %v", g, err)
	}

	added, err := svc.AddNewWords(ctx, u.ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	svc.Wait()
	if len(added) != 10 {
		t.Fatalf("added %d", len(added))
	}
	for _, w := range added {
		if w.Band <= 6.2 || w.Band > 7.5 || !w.Enriched || !strings.HasPrefix(w.Info.MeaningVI, "nghĩa ") {
			t.Errorf("word %+v", w)
		}
	}
	if added[0].Band != 6.5 {
		t.Errorf("easiest band first, got %v", added[0].Band)
	}
	// One call for the 10 words, one background call preparing the next batch.
	if len(enricher.calls) != 2 || len(enricher.calls[0]) != 10 {
		t.Fatalf("enrich calls = %v", len(enricher.calls))
	}
	// The next request uses the prepared words: no new LLM call.
	if _, err := svc.AddNewWords(ctx, u.ID, 10); err != nil {
		t.Fatal(err)
	}
	if len(enricher.calls) < 2 || len(enricher.calls[2-1]) == 0 {
		t.Fatal("prefetch missing")
	}
	svc.Wait()
	if n := len(enricher.calls); n != 3 {
		t.Fatalf("enrich calls after the second batch = %d, want 3 (the second batch was prepared)", n)
	}

	enricher.fail = true
	fresh := NewVocabService(newMemVocab(), users, enricher)
	if _, err := fresh.AddNewWords(ctx, u.ID, 5); !errors.Is(err, ErrVocabUnenriched) {
		t.Fatalf("LLM down: %v", err)
	}
}
