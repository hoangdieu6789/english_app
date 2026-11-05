package service

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
)

func TestSplitTranscript(t *testing.T) {
	in := "Anna: Hi Tom! How was your trip?\n\nTom: It was great. We went hiking every day.\n" +
		"This is a long paragraph with many words in it so it has to be split. It goes on and on with more words than a learner can write down at once. The end comes here."
	segs := SplitTranscript(in)
	if len(segs) < 4 {
		t.Fatalf("got %d lines: %+v", len(segs), segs)
	}
	if segs[0].Speaker != "Anna" || segs[0].Text != "Hi Tom! How was your trip?" {
		t.Errorf("line 0 = %+v", segs[0])
	}
	if segs[1].Speaker != "Tom" {
		t.Errorf("line 1 speaker = %q", segs[1].Speaker)
	}
	for _, s := range segs {
		if n := len(strings.Fields(s.Text)); n > 40 {
			t.Errorf("line too long (%d words): %q", n, s.Text)
		}
		if s.Start != nil {
			t.Errorf("pasted lines have no time")
		}
	}
}

func TestYouTubeID(t *testing.T) {
	for link, want := range map[string]string{
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10": "dQw4w9WgXcQ",
		"https://youtu.be/dQw4w9WgXcQ":                     "dQw4w9WgXcQ",
		"https://m.youtube.com/shorts/dQw4w9WgXcQ":         "dQw4w9WgXcQ",
		"https://www.youtube.com/embed/dQw4w9WgXcQ":        "dQw4w9WgXcQ",
		"https://example.com/watch?v=dQw4w9WgXcQ":          "",
		"https://youtu.be/short":                           "",
	} {
		if got := YouTubeID(link); got != want {
			t.Errorf("YouTubeID(%q) = %q, want %q", link, got, want)
		}
	}
}

const goodScript = `Sure! {"title": "Trips on a budget", "speakers": [{"name": "Mia", "gender": "female"}, {"name": "Leo", "gender": "male"}],
"lines": [
{"speaker": "Mia", "text": "Welcome back to the show, everyone. Today we are talking about travelling on a budget."},
{"speaker": "Leo", "text": "Thanks, Mia. I think a lot of people want to travel but they worry about the cost."},
{"speaker": "Mia", "text": "Right, and honestly, you can cut down on costs if you plan ahead and stay flexible."},
{"speaker": "Leo", "text": "Exactly. I always look for cheap flights a few months before I go anywhere."},
{"speaker": "Nobody", "text": "Another tip is to stay in hostels or rent a room from a local family."},
{"speaker": "Leo", "text": "That is a great way to meet people and pick up a few words of the language too."},
{"speaker": "Mia", "text": "And eating where the locals eat is cheaper, and the food is usually better as well."},
{"speaker": "Leo", "text": "So plan ahead, stay flexible, and enjoy the trip. Thanks for listening, everyone!"}],
"phrases": ["cut down on", "plan ahead", "pick up", "not in the script"]}`

func TestParseLessonScript(t *testing.T) {
	s, err := parseLessonScript(goodScript, "podcast")
	if err != nil {
		t.Fatal(err)
	}
	if s.Title != "Trips on a budget" || len(s.Speakers) != 2 || len(s.Lines) != 8 {
		t.Fatalf("script = %+v", s)
	}
	if s.Speakers[0].Voice == s.Speakers[1].Voice || s.Speakers[0].Voice == "" {
		t.Errorf("voices = %+v", s.Speakers)
	}
	if s.Lines[4].Speaker != "Mia" {
		t.Errorf("unknown speaker should fall back to the first: %q", s.Lines[4].Speaker)
	}
	if strings.Join(s.Phrases, "|") != "cut down on|plan ahead|pick up" {
		t.Errorf("phrases = %v", s.Phrases)
	}
	if _, err := parseLessonScript(`{"title": "x", "speakers": [{"name": "A"}], "lines": [{"speaker": "A", "text": "Hi."}]}`, "story"); err == nil {
		t.Error("a short script must fail")
	}
}

type scriptLLM struct {
	reply string
	err   error
	calls int
}

func (f *scriptLLM) Complete(context.Context, string, string) (string, error) {
	f.calls++
	return f.reply, f.err
}

type fakeTTS struct{ calls int }

func (f *fakeTTS) Synthesize(_ context.Context, text, _ string, _ bool) ([]byte, error) {
	f.calls++
	return make([]byte, 600*len(strings.Fields(text))), nil // 0.1 s a word
}

type memLessons struct {
	repository.ListeningRepository
	saved map[uuid.UUID]*domain.Lesson
}

func (m *memLessons) Create(_ context.Context, l *domain.Lesson) error {
	l.ID = uuid.New()
	cp := *l
	m.saved[l.ID] = &cp
	return nil
}

func (m *memLessons) Finish(_ context.Context, l *domain.Lesson) error {
	cp := *l
	m.saved[l.ID] = &cp
	return nil
}

func TestGenerateLesson(t *testing.T) {
	dir := t.TempDir()
	repo := &memLessons{saved: map[uuid.UUID]*domain.Lesson{}}
	tts := &fakeTTS{}
	s := NewLessonService(repo, &scriptLLM{reply: goodScript}, tts, dir)
	user := uuid.New()
	l, err := s.Generate(context.Background(), user, GenerateInput{Kind: "podcast", Topic: "budget travel", Band: 5.3})
	if err != nil {
		t.Fatal(err)
	}
	if l.Status != domain.LessonPending || l.Band != 5.5 {
		t.Errorf("new lesson = %+v", l)
	}
	s.Wait()
	got := repo.saved[l.ID]
	if got.Status != domain.LessonReady || len(got.Segments) != 8 || tts.calls != 8 {
		t.Fatalf("lesson = %+v (tts calls %d)", got, tts.calls)
	}
	// Lines follow each other with no gap; the file is as long as the clips.
	for i, seg := range got.Segments {
		if seg.Start == nil || seg.End == nil || *seg.End <= *seg.Start {
			t.Fatalf("line %d has no time: %+v", i, seg)
		}
		if i > 0 && *seg.Start != *got.Segments[i-1].End {
			t.Errorf("line %d starts at %v, line %d ends at %v", i, *seg.Start, i-1, *got.Segments[i-1].End)
		}
	}
	st, err := os.Stat(filepath.Join(dir, got.AudioPath))
	if err != nil {
		t.Fatal(err)
	}
	if want := float64(st.Size()) / TTSBytesPerSecond; float64(got.DurationSec)-want > 0.01 || *got.Segments[7].End != want {
		t.Errorf("duration %v, last end %v, file %v s", got.DurationSec, *got.Segments[7].End, want)
	}
	if _, err := s.Generate(context.Background(), user, GenerateInput{Kind: "song", Band: 5}); !errors.Is(err, ErrLessonInput) {
		t.Errorf("bad kind: %v", err)
	}
}

func TestGenerateLessonFails(t *testing.T) {
	repo := &memLessons{saved: map[uuid.UUID]*domain.Lesson{}}
	llm := &scriptLLM{reply: "sorry, no JSON"}
	s := NewLessonService(repo, llm, &fakeTTS{}, t.TempDir())
	l, err := s.Generate(context.Background(), uuid.New(), GenerateInput{Kind: "story", Band: 6})
	if err != nil {
		t.Fatal(err)
	}
	s.Wait()
	if got := repo.saved[l.ID]; got.Status != domain.LessonFailed || got.Error == "" || llm.calls != 2 {
		t.Errorf("lesson = %+v, llm calls %d", got, llm.calls)
	}
}

func TestSSMLEscapes(t *testing.T) {
	got := SSML(`Tom & "Jerry" <3`, "en-GB-RyanNeural", true)
	if !strings.Contains(got, `Tom &amp; &quot;Jerry&quot; &lt;3`) || !strings.Contains(got, `xml:lang="en-GB"`) || !strings.Contains(got, `rate="-25%"`) {
		t.Errorf("ssml = %s", got)
	}
}

func TestTTSCache(t *testing.T) {
	tts := &fakeTTS{}
	c := NewTTSCache(tts, t.TempDir())
	a, err := c.Path(context.Background(), "  hello   world ", "", false)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := c.Path(context.Background(), "hello world", "", false)
	slow, _ := c.Path(context.Background(), "hello world", "", true)
	if a != b || a == slow || tts.calls != 2 {
		t.Errorf("paths %q %q %q, calls %d", a, b, slow, tts.calls)
	}
	if _, err := c.Path(context.Background(), strings.Repeat("a", MaxTTSChars+1), "", false); err == nil {
		t.Error("long text must fail")
	}
}
