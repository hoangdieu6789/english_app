package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
)

// Listening lessons (LISTEN-001): AI lessons (the LLM writes the script, Azure TTS reads each
// line, the clips are joined into one MP3 with the time of every line) and lessons the
// learner adds (VOA Learning English or their own audio, with a pasted transcript).

var (
	ErrLessonInput   = errors.New("invalid lesson")
	ErrLessonBusy    = errors.New("a lesson is already being made")
	ErrLessonNoMaker = errors.New("lessons need an LLM and Azure text to speech")
)

// AI lesson kinds and their scripts.
var aiKinds = map[string]string{
	"podcast":      "a friendly podcast episode: two hosts (one woman, one man) open the show, talk about the topic with examples and opinions, and close the show",
	"conversation": "an everyday conversation between two people (one woman, one man) in a real situation about the topic",
	"story":        "a short story told by one narrator (it may quote what characters say)",
}

// Topics used when the learner leaves the topic empty.
var lessonTopics = []string{
	"travel on a budget", "working from home", "healthy eating", "a favourite city", "learning a new skill",
	"social media habits", "weekend plans", "a memorable trip", "sleep and stress", "online shopping",
	"public transport", "a job interview", "climate and daily life", "friendship", "music festivals",
}

const (
	maxTranscriptChars = 20_000
	maxLessonLines     = 400
	maxLineChars       = 300
	maxAudioBytes      = 30 << 20
)

// AudioExts are the upload formats a lesson accepts.
var AudioExts = map[string]bool{".mp3": true, ".m4a": true, ".wav": true, ".ogg": true, ".webm": true, ".aac": true}

type LessonService struct {
	repo     repository.ListeningRepository
	llm      LLMCompleter // nil: no AI lessons
	tts      TTS          // nil: no AI lessons
	dir      string       // audio storage
	timeout  time.Duration
	wg       sync.WaitGroup
	inflight sync.Map // user id -> struct{}: one AI lesson at a time per learner
}

func NewLessonService(repo repository.ListeningRepository, llm LLMCompleter, tts TTS, audioDir string) *LessonService {
	return &LessonService{repo: repo, llm: llm, tts: tts, dir: audioDir, timeout: 6 * time.Minute}
}

// Wait blocks until background lessons are done (tests).
func (s *LessonService) Wait() { s.wg.Wait() }

// CanGenerate reports whether AI lessons are available.
func (s *LessonService) CanGenerate() bool { return s.llm != nil && s.tts != nil }

func (s *LessonService) List(ctx context.Context, userID uuid.UUID, source string) ([]*domain.Lesson, error) {
	switch source {
	case domain.LessonAI, domain.LessonVOA, domain.LessonMine:
	default:
		return nil, fmt.Errorf("%w: source", ErrLessonInput)
	}
	return s.repo.List(ctx, userID, source, 100)
}

// Get returns a lesson with the learner's progress.
func (s *LessonService) Get(ctx context.Context, userID, id uuid.UUID) (*domain.Lesson, error) {
	l, err := s.repo.Get(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if l.Progress, err = s.repo.Progress(ctx, userID, id); err != nil {
		return nil, err
	}
	return l, nil
}

func (s *LessonService) Delete(ctx context.Context, userID, id uuid.UUID) error {
	path, err := s.repo.Delete(ctx, id, userID)
	if err != nil {
		return err
	}
	if path != "" {
		_ = os.Remove(filepath.Join(s.dir, path))
	}
	return nil
}

func (s *LessonService) SaveProgress(ctx context.Context, userID, id uuid.UUID, positionSec float32) error {
	if _, err := s.repo.Get(ctx, id, userID); err != nil {
		return err
	}
	return s.repo.SaveProgress(ctx, userID, id, float32(math.Max(0, float64(positionSec))))
}

// Dictation saves one typed line; done (with the run's accuracy) when the run is finished.
func (s *LessonService) Dictation(ctx context.Context, userID, id uuid.UUID, segment int, typed string, accuracy float32, done bool, runAccuracy float32, lines int) error {
	l, err := s.repo.Get(ctx, id, userID)
	if err != nil {
		return err
	}
	if segment < 0 || segment >= len(l.Segments) || accuracy < 0 || accuracy > 100 || len(typed) > 2000 {
		return fmt.Errorf("%w: dictation", ErrLessonInput)
	}
	if err := s.repo.AddDictation(ctx, userID, id, segment, typed, accuracy); err != nil {
		return err
	}
	if done {
		if runAccuracy < 0 || runAccuracy > 100 || lines < 1 || lines > len(l.Segments) {
			return fmt.Errorf("%w: dictation run", ErrLessonInput)
		}
		return s.repo.SaveDictationRun(ctx, userID, id, lines, runAccuracy)
	}
	return nil
}

// ---------- AI lessons ----------

// GenerateInput asks for an AI lesson.
type GenerateInput struct {
	Kind  string
	Topic string
	Band  float32
}

// Generate creates a pending AI lesson and makes it in the background.
func (s *LessonService) Generate(ctx context.Context, userID uuid.UUID, in GenerateInput) (*domain.Lesson, error) {
	if !s.CanGenerate() {
		return nil, ErrLessonNoMaker
	}
	if _, ok := aiKinds[in.Kind]; !ok {
		return nil, fmt.Errorf("%w: kind", ErrLessonInput)
	}
	in.Topic = strings.Join(strings.Fields(in.Topic), " ")
	if len([]rune(in.Topic)) > 80 {
		return nil, fmt.Errorf("%w: topic", ErrLessonInput)
	}
	if in.Topic == "" {
		in.Topic = lessonTopics[rand.Intn(len(lessonTopics))]
	}
	if in.Band < 3 || in.Band > 9 {
		return nil, fmt.Errorf("%w: band", ErrLessonInput)
	}
	in.Band = float32(math.Round(float64(in.Band)*2) / 2)
	if _, busy := s.inflight.LoadOrStore(userID, struct{}{}); busy {
		return nil, ErrLessonBusy
	}
	l := &domain.Lesson{
		Source: domain.LessonAI, Kind: in.Kind, Title: in.Topic, Topic: in.Topic, Band: in.Band,
		Status: domain.LessonPending, CreatedBy: &userID,
	}
	if err := s.repo.Create(ctx, l); err != nil {
		s.inflight.Delete(userID)
		return nil, err
	}
	s.start(l, userID)
	return l, nil
}

func (s *LessonService) start(l *domain.Lesson, userID uuid.UUID) {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer s.inflight.Delete(userID)
		ctx, cancel := context.WithTimeout(context.Background(), s.timeout)
		defer cancel()
		if err := s.make(ctx, l); err != nil {
			log.Printf("lesson %s: %v", l.ID, err)
			l.Status, l.Error = domain.LessonFailed, err.Error()
		} else {
			l.Status, l.Error = domain.LessonReady, ""
		}
		if err := s.repo.Finish(context.Background(), l); err != nil {
			log.Printf("lesson %s: save: %v", l.ID, err)
		}
	}()
}

// ResumePending finishes AI lessons left pending by a restart.
func (s *LessonService) ResumePending(ctx context.Context) (int, error) {
	if !s.CanGenerate() {
		return 0, nil
	}
	ls, err := s.repo.Pending(ctx)
	for _, l := range ls {
		var by uuid.UUID
		if l.CreatedBy != nil {
			by = *l.CreatedBy
		}
		s.inflight.Store(by, struct{}{})
		s.start(l, by)
	}
	return len(ls), err
}

func (s *LessonService) make(ctx context.Context, l *domain.Lesson) error {
	var script *lessonScript
	var err error
	for try := 0; try < 2; try++ { // free models sometimes break the JSON: one more try
		var reply string
		reply, err = s.llm.Complete(ctx, "", buildLessonPrompt(l.Kind, l.Topic, l.Band))
		if err != nil {
			continue
		}
		if script, err = parseLessonScript(reply, l.Kind); err == nil {
			break
		}
	}
	if err != nil {
		return fmt.Errorf("script: %w", err)
	}
	l.Title = script.Title
	l.Speakers = script.Speakers
	l.Phrases = script.Phrases
	voices := map[string]string{}
	for _, sp := range script.Speakers {
		voices[sp.Name] = sp.Voice
	}
	var audio []byte
	l.Segments = make([]domain.Segment, 0, len(script.Lines))
	for _, line := range script.Lines {
		clip, err := s.tts.Synthesize(ctx, line.Text, voices[line.Speaker], false)
		if err != nil {
			return fmt.Errorf("audio: %w", err)
		}
		start := float64(len(audio)) / TTSBytesPerSecond
		audio = append(audio, clip...)
		end := float64(len(audio)) / TTSBytesPerSecond
		l.Segments = append(l.Segments, domain.Segment{Speaker: line.Speaker, Text: line.Text, Start: &start, End: &end})
	}
	rel := filepath.Join("lessons", l.ID.String()+".mp3")
	full := filepath.Join(s.dir, rel)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(full, audio, 0o644); err != nil {
		return err
	}
	l.AudioPath = rel
	l.DurationSec = float32(float64(len(audio)) / TTSBytesPerSecond)
	return nil
}

type scriptLine struct {
	Speaker string `json:"speaker"`
	Text    string `json:"text"`
}

type lessonScript struct {
	Title    string
	Speakers []domain.Speaker
	Lines    []scriptLine
	Phrases  []string
}

func lessonWords(band float32) (int, int) {
	switch {
	case band <= 4.5:
		return 200, 320
	case band <= 6:
		return 300, 450
	default:
		return 380, 550
	}
}

func buildLessonPrompt(kind, topic string, band float32) string {
	lo, hi := lessonWords(band)
	var sb strings.Builder
	sb.WriteString("You write listening lessons for English learners preparing for IELTS.\n")
	fmt.Fprintf(&sb, "Write %s about \"%s\".\n", aiKinds[kind], topic)
	fmt.Fprintf(&sb, "The listener is at about IELTS band %.1f: use vocabulary and grammar a band %.1f learner can follow, with a few words just above that level. ", band, band)
	fmt.Fprintf(&sb, "The whole script is %d-%d words of natural spoken English (contractions, fillers like \"you know\" now and then, reactions).\n", lo, hi)
	sb.WriteString("Use 8-12 useful collocations, phrasal verbs or idioms naturally, and list 6-10 of them (exactly as they appear in the script) in phrases.\n")
	sb.WriteString("Each line is one turn of one speaker, at most 2 sentences and at most 28 words, so a learner can write it down in a dictation.\n")
	sb.WriteString("Give the speakers short first names and a gender (female or male). No sound effects, no stage directions, no music cues, no markdown.\n")
	sb.WriteString("Respond with ONLY a JSON object in this exact shape:\n")
	sb.WriteString(`{"title": "...", "speakers": [{"name": "Mia", "gender": "female"}], "lines": [{"speaker": "Mia", "text": "..."}], "phrases": ["..."]}` + "\n")
	return sb.String()
}

func jsonObject(content string) (string, error) {
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start < 0 || end < start {
		return "", errors.New("no JSON object found in llm response")
	}
	return content[start : end+1], nil
}

func parseLessonScript(content, kind string) (*lessonScript, error) {
	raw, err := jsonObject(content)
	if err != nil {
		return nil, err
	}
	var p struct {
		Title    string `json:"title"`
		Speakers []struct {
			Name   string `json:"name"`
			Gender string `json:"gender"`
		} `json:"speakers"`
		Lines   []scriptLine `json:"lines"`
		Phrases []string     `json:"phrases"`
	}
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, fmt.Errorf("parse llm json: %w", err)
	}
	out := &lessonScript{Title: clip(strings.TrimSpace(p.Title), 120)}
	if out.Title == "" {
		return nil, errors.New("script has no title")
	}
	// Voices: women and men in turn from their lists, so two speakers never share a voice.
	nf, nm := rand.Intn(len(TTSVoicesFemale)), rand.Intn(len(TTSVoicesMale))
	known := map[string]bool{}
	for _, sp := range p.Speakers {
		name := strings.TrimSpace(sp.Name)
		if name == "" || known[name] || len(out.Speakers) == 4 {
			continue
		}
		known[name] = true
		var v string
		if strings.EqualFold(sp.Gender, "male") {
			v = TTSVoicesMale[nm%len(TTSVoicesMale)]
			nm++
		} else {
			v = TTSVoicesFemale[nf%len(TTSVoicesFemale)]
			nf++
		}
		out.Speakers = append(out.Speakers, domain.Speaker{Name: name, Voice: v})
	}
	if len(out.Speakers) == 0 {
		return nil, errors.New("script has no speakers")
	}
	var words int
	var text strings.Builder
	for _, ln := range p.Lines {
		t := strings.Join(strings.Fields(ln.Text), " ")
		if t == "" {
			continue
		}
		sp := strings.TrimSpace(ln.Speaker)
		if !known[sp] {
			sp = out.Speakers[0].Name
		}
		out.Lines = append(out.Lines, scriptLine{Speaker: sp, Text: clip(t, maxLineChars)})
		words += len(strings.Fields(t))
		text.WriteString(strings.ToLower(t) + " ")
	}
	if len(out.Lines) < 6 || words < 120 {
		return nil, fmt.Errorf("script too short (%d lines, %d words)", len(out.Lines), words)
	}
	all := text.String()
	seen := map[string]bool{}
	for _, ph := range p.Phrases {
		ph = strings.Trim(strings.Join(strings.Fields(ph), " "), ".,!?;:\"'")
		k := strings.ToLower(ph)
		if ph == "" || seen[k] || !strings.Contains(all, k) || len(out.Phrases) == 12 {
			continue
		}
		seen[k] = true
		out.Phrases = append(out.Phrases, ph)
	}
	return out, nil
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return strings.TrimSpace(string(r[:n]))
}

// ---------- lessons the learner adds ----------

// ImportInput is a VOA or own lesson.
type ImportInput struct {
	Source     string
	Kind       string
	Title      string
	Transcript string
	AudioURL   string
	VideoURL   string
	SourceURL  string
	Audio      []byte // an uploaded file (optional)
	AudioExt   string
}

var speakerPrefix = regexp.MustCompile(`^([A-Z][\p{L}.' -]{0,30}):\s+(.+)$`)

// SplitTranscript turns a pasted transcript into lines: one per paragraph, long paragraphs
// split into sentences (at most about 30 words a line), "Name: text" lines keep the speaker.
func SplitTranscript(text string) []domain.Segment {
	var out []domain.Segment
	for _, para := range strings.Split(strings.ReplaceAll(text, "\r", ""), "\n") {
		para = strings.Join(strings.Fields(para), " ")
		if para == "" {
			continue
		}
		speaker := ""
		if m := speakerPrefix.FindStringSubmatch(para); m != nil && len(strings.Fields(m[1])) <= 3 {
			speaker, para = m[1], m[2]
		}
		var cur []string
		flush := func() {
			if len(cur) > 0 {
				out = append(out, domain.Segment{Speaker: speaker, Text: clip(strings.Join(cur, " "), maxLineChars)})
				cur = nil
			}
		}
		for _, sent := range splitSentences(para) {
			n := len(strings.Fields(sent))
			if len(cur) > 0 && linesWords(cur)+n > 30 {
				flush()
			}
			cur = append(cur, sent)
		}
		flush()
	}
	return out
}

func linesWords(parts []string) int {
	n := 0
	for _, p := range parts {
		n += len(strings.Fields(p))
	}
	return n
}

// splitSentences splits at . ! ? followed by a space and an upper-case letter or a quote.
func splitSentences(p string) []string {
	var out []string
	r := []rune(p)
	start := 0
	for i := 0; i < len(r)-2; i++ {
		if (r[i] == '.' || r[i] == '!' || r[i] == '?') && r[i+1] == ' ' && (unicode.IsUpper(r[i+2]) || r[i+2] == '"' || r[i+2] == '“') {
			out = append(out, strings.TrimSpace(string(r[start:i+1])))
			start = i + 2
		}
	}
	if s := strings.TrimSpace(string(r[start:])); s != "" {
		out = append(out, s)
	}
	return out
}

func httpURL(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", true
	}
	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || len(s) > 500 {
		return "", false
	}
	return u.String(), true
}

var youTubeID = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

// YouTubeID returns the video id of a YouTube link ("" when it is not one).
func YouTubeID(link string) string {
	u, err := url.Parse(strings.TrimSpace(link))
	if err != nil {
		return ""
	}
	host := strings.TrimPrefix(strings.ToLower(u.Host), "www.")
	host = strings.TrimPrefix(host, "m.")
	var id string
	switch host {
	case "youtu.be":
		id = strings.Trim(u.Path, "/")
	case "youtube.com", "music.youtube.com", "youtube-nocookie.com":
		switch {
		case u.Path == "/watch":
			id = u.Query().Get("v")
		case strings.HasPrefix(u.Path, "/embed/"), strings.HasPrefix(u.Path, "/shorts/"), strings.HasPrefix(u.Path, "/live/"):
			parts := strings.Split(strings.Trim(u.Path, "/"), "/")
			if len(parts) > 1 {
				id = parts[1]
			}
		}
	}
	if youTubeID.MatchString(id) {
		return id
	}
	return ""
}

// Import adds a VOA or own lesson for the learner.
func (s *LessonService) Import(ctx context.Context, userID uuid.UUID, in ImportInput) (*domain.Lesson, error) {
	bad := func(field string) (*domain.Lesson, error) { return nil, fmt.Errorf("%w: %s", ErrLessonInput, field) }
	if in.Source != domain.LessonVOA && in.Source != domain.LessonMine {
		return bad("source")
	}
	valid := false
	for _, k := range domain.LessonKinds {
		valid = valid || k == in.Kind
	}
	if !valid {
		return bad("kind")
	}
	title := clip(strings.Join(strings.Fields(in.Title), " "), 120)
	if title == "" {
		return bad("title")
	}
	if len(in.Transcript) > maxTranscriptChars {
		return bad("transcript")
	}
	segs := SplitTranscript(in.Transcript)
	if len(segs) > maxLessonLines {
		return bad("transcript")
	}
	audioURL, ok1 := httpURL(in.AudioURL)
	sourceURL, ok2 := httpURL(in.SourceURL)
	if !ok1 || !ok2 {
		return bad("url")
	}
	video := ""
	if strings.TrimSpace(in.VideoURL) != "" {
		id := YouTubeID(in.VideoURL)
		if id == "" {
			return bad("video")
		}
		video = "https://www.youtube.com/watch?v=" + id
	}
	if len(in.Audio) > maxAudioBytes || (len(in.Audio) > 0 && !AudioExts[in.AudioExt]) {
		return bad("audio")
	}
	if len(in.Audio) == 0 && audioURL == "" && video == "" {
		return bad("audio") // something to listen to
	}
	l := &domain.Lesson{
		OwnerID: &userID, Source: in.Source, Kind: in.Kind, Title: title, Segments: segs,
		AudioURL: audioURL, VideoURL: video, SourceURL: sourceURL, Status: domain.LessonReady, CreatedBy: &userID,
	}
	if in.Source == domain.LessonVOA {
		l.Credit = "VOA Learning English (public domain)"
	}
	if err := s.repo.Create(ctx, l); err != nil {
		return nil, err
	}
	if len(in.Audio) > 0 {
		rel := filepath.Join("lessons", l.ID.String()+in.AudioExt)
		full := filepath.Join(s.dir, rel)
		err := os.MkdirAll(filepath.Dir(full), 0o755)
		if err == nil {
			err = os.WriteFile(full, in.Audio, 0o644)
		}
		if err == nil {
			l.AudioPath = rel
			err = s.repo.Finish(ctx, l)
		}
		if err != nil {
			_, _ = s.repo.Delete(ctx, l.ID, userID)
			_ = os.Remove(full)
			return nil, err
		}
	}
	return l, nil
}
