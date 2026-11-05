package service

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
)

func TestNormalizeSaved(t *testing.T) {
	for in, want := range map[string]string{
		"  Turn   it DOWN. ":                "turn it down",
		"“break the ice”":                   "break the ice",
		"I'm all ears!":                     "I'm all ears",
		"well-being":                        "well-being",
		"one two three four five six":       "one two three four five six",
		"one two three four five six seven": "",
		"<script>":                          "script",
		"!!!":                               "",
		"a/b":                               "",
	} {
		if got := NormalizeSaved(in); got != want {
			t.Errorf("NormalizeSaved(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestUsesPhrase(t *testing.T) {
	for _, c := range []struct {
		sentence, phrase string
		want             bool
	}{
		{"She turned the offer down politely.", "turn down", true},
		{"I always plan ahead before a trip.", "plan ahead", true},
		{"We are cutting down on sugar.", "cut down on", true},
		{"Down he turned.", "turn down", false},
		{"I like travelling.", "plan ahead", false},
	} {
		if got := UsesPhrase(c.sentence, c.phrase); got != c.want {
			t.Errorf("UsesPhrase(%q, %q) = %v", c.sentence, c.phrase, got)
		}
	}
}

func TestParseVerdict(t *testing.T) {
	v, err := parseVerdict("```json\n{\"usesTarget\": true, \"meaningOk\": true, \"grammarOk\": true, \"natural\": true, \"score\": 12, \"corrected\": \"Ok.\", \"feedback\": \"Tốt.\"}\n```")
	if err != nil {
		t.Fatal(err)
	}
	if v.Score != 10 || !v.UsesTarget || v.Feedback != "Tốt." {
		t.Errorf("verdict = %+v", v)
	}
}

type memNotebook struct {
	repository.NotebookRepository
	word, meaning string
	example       string
	sentences     []*domain.NotebookSentence
	saved         *domain.NotebookCard
}

func (m *memNotebook) SaveWord(_ context.Context, _ uuid.UUID, _ string, c *domain.NotebookCard) (uuid.UUID, error) {
	m.saved = c
	return uuid.New(), nil
}

func (m *memNotebook) Entry(context.Context, uuid.UUID, uuid.UUID) (string, string, error) {
	return m.word, m.meaning, nil
}

func (m *memNotebook) AddSentence(_ context.Context, _ uuid.UUID, s *domain.NotebookSentence) error {
	s.ID = uuid.New()
	m.sentences = append(m.sentences, s)
	return nil
}

func (m *memNotebook) SetMyExample(_ context.Context, _ uuid.UUID, _, sentence string, _ float32) error {
	m.example = sentence
	return nil
}

func TestSaveLooksUp(t *testing.T) {
	repo := &memNotebook{}
	llm := &scriptLLM{reply: `{"pos": "phrasal verb", "ipa": "/tɝn daʊn/", "meaning": "từ chối", "example_en": "She turned down the job offer.", "band": 6}`}
	s := NewNotebookService(repo, llm, nil)
	c, ok, err := s.Save(context.Background(), uuid.New(), "vi", SaveInput{Text: "Turned down", Context: "He turned down the offer."})
	if err != nil || !ok {
		t.Fatal(err, ok)
	}
	if c.Word != "turned down" || c.Meaning != "từ chối" || c.Band != 6 || repo.saved.Context != "He turned down the offer." {
		t.Errorf("card = %+v", c)
	}
	llm.reply = "no json"
	if _, ok, err := s.Save(context.Background(), uuid.New(), "vi", SaveInput{Text: "plan ahead"}); err != nil || ok {
		t.Errorf("a failed lookup still saves the card: ok=%v err=%v", ok, err)
	}
}

func TestGradeSentence(t *testing.T) {
	repo := &memNotebook{word: "turn down", meaning: "từ chối"}
	llm := &scriptLLM{reply: `{"usesTarget": true, "meaningOk": true, "grammarOk": true, "natural": true, "score": 8, "corrected": "", "feedback": "Hay."}`}
	s := NewNotebookService(repo, llm, nil)
	ctx, user, card := context.Background(), uuid.New(), uuid.New()

	got, err := s.GradeSentence(ctx, user, card, "vi", "I turned down the offer because the pay was low.")
	if err != nil || !got.Accepted || repo.example != "I turned down the offer because the pay was low." {
		t.Fatalf("good sentence: %+v %v (example %q)", got, err, repo.example)
	}
	repo.example = ""
	// The LLM says yes but the phrase is not there: capped and not accepted.
	got, err = s.GradeSentence(ctx, user, card, "vi", "I said no to the offer last week.")
	if err != nil || got.Accepted || got.Score > 3 || got.Verdict.UsesTarget || repo.example != "" {
		t.Errorf("missing phrase: %+v %v", got, err)
	}
	if _, err := s.GradeSentence(ctx, user, card, "vi", "turn down"); err == nil {
		t.Error("too short must fail")
	}
}
