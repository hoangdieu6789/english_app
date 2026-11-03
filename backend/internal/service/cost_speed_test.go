package service

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
)

// ---- OpenRouter: free-only guard, fallbacks, reasoning off ----

func TestOpenRouterCompleterRefusesPaidModels(t *testing.T) {
	if _, err := NewOpenRouterCompleter("k", []string{"nvidia/x:free", "anthropic/claude-3.5-haiku"}, 0, false, time.Second); err == nil {
		t.Error("a paid fallback model must be refused")
	}
	if _, err := NewOpenRouterCompleter("k", []string{"anthropic/claude-3.5-haiku"}, 0, true, time.Second); err != nil {
		t.Errorf("ALLOW_PAID_MODELS=true should allow it: %v", err)
	}
	if _, err := NewOpenRouterCompleter("k", nil, 0, false, time.Second); err == nil {
		t.Error("no model must be an error")
	}
}

func TestOpenRouterCompleterRequest(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&got)
		w.Write([]byte(`{"model":"a:free","choices":[{"message":{"role":"assistant","content":"hi"}}]}`))
	}))
	defer srv.Close()

	c, err := NewOpenRouterCompleter("k", []string{"a:free", "b:free", "a:free"}, 0, false, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	c.endpoint = srv.URL
	out, err := c.Complete(context.Background(), "", "hello")
	if err != nil || out != "hi" {
		t.Fatalf("out=%q err=%v", out, err)
	}
	if got["model"] != "a:free" || fmt.Sprint(got["models"]) != "[a:free b:free]" {
		t.Errorf("model/fallbacks = %v / %v", got["model"], got["models"])
	}
	if r, _ := got["reasoning"].(map[string]any); r == nil || r["enabled"] != false {
		t.Errorf("reasoning must be off: %v", got["reasoning"])
	}
	if msgs, _ := got["messages"].([]any); len(msgs) != 1 {
		t.Errorf("empty system prompt must not be sent: %v", got["messages"])
	}
}

// Seen live: HTTP 200 with an error object and no choices. Retry once with the fallbacks only;
// a 429 (quota) is not retried.
func TestOpenRouterCompleterRetriesErrorBody(t *testing.T) {
	var models []string
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req map[string]any
		_ = json.NewDecoder(r.Body).Decode(&req)
		models = append(models, fmt.Sprint(req["model"]))
		switch atomic.AddInt32(&calls, 1) {
		case 1:
			w.Write([]byte(`{"error":{"code":502,"message":"provider returned error"}}`))
		case 2:
			w.Write([]byte(`{"model":"b:free","choices":[{"message":{"role":"assistant","content":"ok"}}]}`))
		default:
			w.WriteHeader(http.StatusTooManyRequests)
		}
	}))
	defer srv.Close()

	c, _ := NewOpenRouterCompleter("k", []string{"a:free", "b:free"}, 0, false, time.Second)
	c.endpoint = srv.URL
	out, err := c.Complete(context.Background(), "", "x")
	if err != nil || out != "ok" || fmt.Sprint(models) != "[a:free b:free]" {
		t.Fatalf("out=%q err=%v models=%v", out, err, models)
	}
	calls, models = 2, nil
	if _, err := c.Complete(context.Background(), "", "x"); err == nil || len(models) != 1 {
		t.Errorf("429 must fail without retry: err=%v requests=%d", err, len(models))
	}
}

// ---- Azure: one call at a time, 429 retried ----

func TestAzureScorerSerialisesAndRetries(t *testing.T) {
	sample := restSample(t)
	var inFlight, maxInFlight, calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&inFlight, 1)
		defer atomic.AddInt32(&inFlight, -1)
		for {
			m := atomic.LoadInt32(&maxInFlight)
			if n <= m || atomic.CompareAndSwapInt32(&maxInFlight, m, n) {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
		if atomic.AddInt32(&calls, 1)%2 == 1 { // every first try is throttled
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Write(sample)
	}))
	defer srv.Close()

	s := NewAzurePronunciationScorer("k", "eastus", 1)
	s.endpoint, s.retryWait = srv.URL, time.Millisecond

	var wg sync.WaitGroup
	errs := make(chan error, 3)
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := s.Score(context.Background(), []byte("RIFF"), "Good morning.")
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("score: %v", err)
		}
	}
	if maxInFlight != 1 {
		t.Errorf("max concurrent Azure calls = %d, want 1 (F0 limit)", maxInFlight)
	}
	if calls != 6 {
		t.Errorf("calls = %d, want 6 (3 throttled + 3 retried)", calls)
	}
}

// Seen live: one Azure call hung for 60 s. It must be cut off and retried once.
func TestAzureScorerRetriesHungCall(t *testing.T) {
	sample := restSample(t)
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&calls, 1) == 1 {
			select { // hang until the client gives up
			case <-r.Context().Done():
			case <-time.After(500 * time.Millisecond):
			}
			return
		}
		w.Write(sample)
	}))
	defer srv.Close()

	s := NewAzurePronunciationScorer("k", "eastus", 1)
	s.endpoint, s.attemptTimeout = srv.URL, 100*time.Millisecond
	t0 := time.Now()
	if _, err := s.Score(context.Background(), []byte("RIFF"), "Good morning."); err != nil {
		t.Fatalf("score: %v", err)
	}
	if calls != 2 || time.Since(t0) > time.Second {
		t.Errorf("calls=%d took=%s, want 2 calls well under 1s", calls, time.Since(t0))
	}
}

// ---- WAV silence trimming ----

// toneWAV: silence, a 440 Hz tone, silence (16 kHz mono 16-bit).
func toneWAV(silenceS, toneS float64) []byte {
	const rate = 16000
	ns, nt := int(silenceS*rate), int(toneS*rate)
	pcm := make([]int16, 2*ns+nt)
	for i := 0; i < nt; i++ {
		pcm[ns+i] = int16(8000 * math.Sin(2*math.Pi*440*float64(i)/rate))
	}
	var data bytes.Buffer
	binary.Write(&data, binary.LittleEndian, pcm)
	fmtChunk := make([]byte, 16)
	binary.LittleEndian.PutUint16(fmtChunk[0:], 1)
	binary.LittleEndian.PutUint16(fmtChunk[2:], 1)
	binary.LittleEndian.PutUint32(fmtChunk[4:], rate)
	binary.LittleEndian.PutUint32(fmtChunk[8:], rate*2)
	binary.LittleEndian.PutUint16(fmtChunk[12:], 2)
	binary.LittleEndian.PutUint16(fmtChunk[14:], 16)
	return buildWAV(fmtChunk, data.Bytes())
}

func wavSeconds(t *testing.T, b []byte) float64 {
	t.Helper()
	_, _, n, ok := parseWAV(b)
	if !ok {
		t.Fatal("not a valid WAV")
	}
	return float64(n) / 2 / 16000
}

func TestTrimSilenceWAV(t *testing.T) {
	in := toneWAV(1.5, 2)
	out := TrimSilenceWAV(in)
	got := wavSeconds(t, out)
	if got < 2.0 || got > 2.6 {
		t.Errorf("trimmed length = %.2fs, want ~2.5s (2s speech + 2x0.25s padding)", got)
	}

	if b := TrimSilenceWAV(toneWAV(0.05, 2)); !bytes.Equal(b, toneWAV(0.05, 2)) {
		t.Error("almost no silence: audio should be unchanged")
	}
	silent := toneWAV(1, 0)
	if !bytes.Equal(TrimSilenceWAV(silent), silent) {
		t.Error("no speech: audio should be unchanged")
	}
	if junk := []byte("RIFF not a wav"); !bytes.Equal(TrimSilenceWAV(junk), junk) {
		t.Error("non-WAV input should be unchanged")
	}
}

// ---- Practice sentences: one LLM call per batch, background refill ----

type fakeSentenceGen struct {
	mu    sync.Mutex
	calls int
	next  int
	size  int           // sentences per batch; 0 = n
	delay time.Duration // simulates a slow LLM
}

func (g *fakeSentenceGen) GenerateBatch(_ context.Context, _ []string, n, _ int) ([]GeneratedSentence, error) {
	time.Sleep(g.delay)
	g.mu.Lock()
	defer g.mu.Unlock()
	g.calls++
	if g.size > 0 {
		n = g.size
	}
	out := make([]GeneratedSentence, n)
	for i := range out {
		g.next++
		out[i] = GeneratedSentence{Text: fmt.Sprintf("sentence number %d", g.next)}
	}
	return out, nil
}

type memSentenceRepo struct {
	mu    sync.Mutex
	queue []*domain.PracticeSentence
	all   []string
}

func (r *memSentenceRepo) Create(_ context.Context, uid uuid.UUID, text, ph, gl string) (*domain.PracticeSentence, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	s := &domain.PracticeSentence{ID: uuid.New(), UserID: uid, Text: text, Phonetic: ph, Gloss: gl}
	r.queue = append(r.queue, s)
	r.all = append(r.all, text)
	return s, nil
}

func (r *memSentenceRepo) ClaimNext(context.Context, uuid.UUID) (*domain.PracticeSentence, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.queue) == 0 {
		return nil, nil
	}
	s := r.queue[0]
	r.queue = r.queue[1:]
	return s, nil
}

func (r *memSentenceRepo) CountQueued(context.Context, uuid.UUID) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.queue), nil
}

func (r *memSentenceRepo) ListRecentTexts(context.Context, uuid.UUID, int) ([]string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.all...), nil
}

func TestPracticeSentencesAreBatched(t *testing.T) {
	gen, repo := &fakeSentenceGen{}, &memSentenceRepo{}
	svc := NewPracticeSentenceService(gen, repo, 10)
	uid := uuid.New()
	seen := map[string]bool{}
	for i := 0; i < 25; i++ {
		s, err := svc.NextSentence(context.Background(), uid)
		if err != nil {
			t.Fatal(err)
		}
		if seen[s.Text] {
			t.Fatalf("sentence %q served twice", s.Text)
		}
		seen[s.Text] = true
		svc.wg.Wait() // let a background refill finish before the next request
	}
	// 25 sentences: 1 synchronous batch + background refills of 10 each.
	if gen.calls > 3 {
		t.Errorf("LLM calls = %d for 25 sentences, want <= 3", gen.calls)
	}
}

// An empty queue while a background refill is running must wait for it, not pay for a
// second batch.
func TestEmptyQueueWaitsForRunningRefill(t *testing.T) {
	gen, repo := &fakeSentenceGen{size: 4, delay: 100 * time.Millisecond}, &memSentenceRepo{}
	svc := NewPracticeSentenceService(gen, repo, 10)
	uid := uuid.New()
	ctx := context.Background()
	next := func() {
		t.Helper()
		if _, err := svc.NextSentence(ctx, uid); err != nil {
			t.Fatal(err)
		}
	}
	next()                            // empty: fills 4, 3 left
	next()                            // 2 left -> background refill starts (slow LLM)
	time.Sleep(20 * time.Millisecond) // refill is now inside the LLM call
	next()                            // 1 left
	next()                            // 0 left
	next()                            // empty: must wait for the running refill, not start another
	svc.wg.Wait()
	if gen.calls != 2 {
		t.Errorf("LLM calls = %d, want 2 (first fill + one refill)", gen.calls)
	}
}

func TestParseGeneratedSentences(t *testing.T) {
	reply := "```json\n" + `{"sentences":[
	  {"text":"Could you tell me the way to the station, please?","phonetic":"p","gloss":"g"},
	  {"text":"Too short.","phonetic":"p","gloss":"g"},
	  {"text":"could you tell me the way to the station please","phonetic":"p","gloss":"g"},
	  {"text":"I usually take the bus to work because it is cheaper.","phonetic":"p","gloss":"g"},
	  {"text":"I usually take the bus to work because it is cheaper than driving.","phonetic":"p","gloss":"g"},
	  {"text":"What did you have for breakfast before you left home today?","phonetic":"p","gloss":"g"}]}` + "\n```"
	got, err := parseGeneratedSentences(reply, []string{"What did you have for breakfast before you left home today?"}, 10)
	if err != nil {
		t.Fatal(err)
	}
	var texts []string
	for _, s := range got {
		texts = append(texts, s.Text)
	}
	if len(got) != 2 || !strings.HasPrefix(texts[0], "Could you") || !strings.HasPrefix(texts[1], "I usually") {
		t.Errorf("kept %q; want the two new sentences of >= 10 words, no duplicates", texts)
	}
	if _, err := parseGeneratedSentences(`{"sentences":[]}`, nil, 10); err == nil {
		t.Error("an empty batch must be an error")
	}
	// Seen live: a stray "}" after the object.
	stray := `{"sentences":[{"text":"I usually take the bus to work because it is cheaper.","phonetic":"p","gloss":"g"}]}}`
	if got, err := parseGeneratedSentences(stray, nil, 10); err != nil || len(got) != 1 {
		t.Errorf("trailing brace: got %v, err %v", got, err)
	}
}

func TestAzureNoSpeechIsReportedAsNoSpeechError(t *testing.T) {
	for _, status := range []string{"NoMatch", "InitialSilenceTimeout", "BabbleTimeout"} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`{"RecognitionStatus":"` + status + `"}`))
		}))
		s := NewAzurePronunciationScorer("k", "eastus", 1)
		s.endpoint = srv.URL
		_, err := s.Score(context.Background(), []byte("RIFF"), "")
		srv.Close()
		var noSpeech *NoSpeechError
		if !errors.As(err, &noSpeech) || noSpeech.Status != status {
			t.Fatalf("%s: err = %v, want NoSpeechError", status, err)
		}
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"RecognitionStatus":"Error"}`))
	}))
	defer srv.Close()
	s := NewAzurePronunciationScorer("k", "eastus", 1)
	s.endpoint = srv.URL
	var noSpeech *NoSpeechError
	if _, err := s.Score(context.Background(), []byte("RIFF"), ""); err == nil || errors.As(err, &noSpeech) {
		t.Fatalf("status Error must be a plain error, got %v", err)
	}
}

func TestAudioLevel(t *testing.T) {
	// 0.5 s silence, 1 s tone (amplitude 8000), 0.5 s silence.
	secs, peak, ok := AudioLevel(toneWAV(0.5, 1))
	if !ok || secs != 2 || peak < 5000 || peak > 6000 { // RMS of a sine = amplitude / sqrt 2 ≈ 5657
		t.Fatalf("secs=%v peak=%v ok=%v", secs, peak, ok)
	}
	if _, _, ok := AudioLevel([]byte("RIFF")); ok {
		t.Fatal("bad WAV must not be ok")
	}
}
