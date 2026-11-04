package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
)

func TestBridgeTranscriber(t *testing.T) {
	var gotAuth, gotType string
	var gotBody []byte
	reply := `{"text":"  I wouldn't call myself an avid photographer. [BLANK_AUDIO] (laughs) "}`
	status := http.StatusOK
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/transcribe" {
			t.Errorf("path = %s", r.URL.Path)
		}
		gotAuth, gotType = r.Header.Get("Authorization"), r.Header.Get("Content-Type")
		gotBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(status)
		w.Write([]byte(reply))
	}))
	defer srv.Close()

	tr := NewBridgeTranscriber(srv.URL, "secret-token-1234")
	text, err := tr.Transcribe(context.Background(), []byte("RIFFdata"))
	if err != nil {
		t.Fatal(err)
	}
	if text != "I wouldn't call myself an avid photographer." {
		t.Errorf("text = %q (non-speech marks must be removed)", text)
	}
	if gotAuth != "Bearer secret-token-1234" || gotType != "audio/wav" || string(gotBody) != "RIFFdata" {
		t.Errorf("request: auth=%q type=%q body=%q", gotAuth, gotType, gotBody)
	}

	reply = `{"text":"[BLANK_AUDIO]"}`
	if _, err := tr.Transcribe(context.Background(), []byte("RIFF")); err == nil {
		t.Error("an empty transcript must be an error")
	}
	status, reply = http.StatusServiceUnavailable, `{"error":"whisper not ready"}`
	if _, err := tr.Transcribe(context.Background(), []byte("RIFF")); err == nil || !strings.Contains(err.Error(), "whisper not ready") {
		t.Errorf("err = %v", err)
	}
}

func TestAzureScoreTranscribedSendsTranscriptWithoutMiscue(t *testing.T) {
	var cfgs []azurePronAssessmentConfig
	var mu sync.Mutex
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := base64.StdEncoding.DecodeString(r.Header.Get("Pronunciation-Assessment"))
		var c azurePronAssessmentConfig
		_ = json.Unmarshal(raw, &c)
		mu.Lock()
		cfgs = append(cfgs, c)
		mu.Unlock()
		w.Write([]byte(`{"RecognitionStatus":"Success","DisplayText":"Hi.","NBest":[{"AccuracyScore":90,"Words":[{"Word":"hi","AccuracyScore":90}]}]}`))
	}))
	defer srv.Close()
	s := NewAzurePronunciationScorer("k", "r", 1)
	s.endpoint = srv.URL

	if _, err := s.ScoreTranscribed(context.Background(), []byte("RIFF"), "Hi there."); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Score(context.Background(), []byte("RIFF"), "Good morning."); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Score(context.Background(), []byte("RIFF"), ""); err != nil {
		t.Fatal(err)
	}
	if cfgs[0].ReferenceText != "Hi there." || cfgs[0].EnableMiscue {
		t.Errorf("transcribed: %+v", cfgs[0])
	}
	if cfgs[1].ReferenceText != "Good morning." || !cfgs[1].EnableMiscue {
		t.Errorf("shadowing: %+v", cfgs[1])
	}
	if cfgs[2].ReferenceText != "" || cfgs[2].EnableMiscue {
		t.Errorf("unscripted: %+v", cfgs[2])
	}
}

type fakeTranscriber struct {
	text string
	err  error
	n    int
}

func (f *fakeTranscriber) Transcribe(context.Context, []byte) (string, error) {
	f.n++
	return f.text, f.err
}

// recordingScorer records which Azure mode was used.
type recordingScorer struct {
	fakeScorer
	calls          []string // "score:<ref>" or "transcribed:<ref>"
	transcribedErr error
}

func (r *recordingScorer) Score(ctx context.Context, wav []byte, ref string) (*ScoreResult, error) {
	r.calls = append(r.calls, "score:"+ref)
	return r.fakeScorer.Score(ctx, wav, ref)
}

func (r *recordingScorer) ScoreTranscribed(ctx context.Context, wav []byte, ref string) (*ScoreResult, error) {
	r.calls = append(r.calls, "transcribed:"+ref)
	if r.transcribedErr != nil {
		return nil, r.transcribedErr
	}
	return r.fakeScorer.Score(ctx, wav, ref)
}

func TestSubmitUsesTranscriberForFreeSpeechOnly(t *testing.T) {
	cases := []struct {
		name       string
		task       string
		ref        string
		tr         *fakeTranscriber
		scriptErr  error
		wantCalls  string
		wantSource string
		wantText   string
	}{
		{"ielts with whisper", "part1", "", &fakeTranscriber{text: "I enjoy photography."}, nil, "transcribed:I enjoy photography.", TranscriptWhisper, "I enjoy photography."},
		{"whisper down", "part1", "", &fakeTranscriber{err: errors.New("bridge down")}, nil, "score:", TranscriptAzure, "Good morning."},
		{"scripted azure fails", "part1", "", &fakeTranscriber{text: "x"}, errors.New("azure 400"), "transcribed:x,score:", TranscriptAzure, "Good morning."},
		{"shadowing keeps its sentence", TaskShadowing, "Good morning.", &fakeTranscriber{text: "never used"}, nil, "score:Good morning.", TranscriptAzure, "Good morning."},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sc := &recordingScorer{fakeScorer: fakeScorer{raw: firstSampleSegment(t)}, transcribedErr: c.scriptErr}
			svc := NewPronunciationService(sc, NewSpeakingGrader(loadRubric(t), nil, nil), fakeStorage{}, &fakeRepo{})
			svc.SetTranscriber(c.tr)
			a, err := svc.SubmitAttempt(context.Background(), uuid.New(), []byte("RIFF"), c.ref, SpeakingTask{Type: c.task})
			if err != nil {
				t.Fatal(err)
			}
			if got := strings.Join(sc.calls, ","); got != c.wantCalls {
				t.Errorf("azure calls = %q, want %q", got, c.wantCalls)
			}
			if a.TranscriptSource == nil || *a.TranscriptSource != c.wantSource || *a.RecognizedText != c.wantText {
				t.Errorf("source=%v text=%q", a.TranscriptSource, *a.RecognizedText)
			}
			if c.task == TaskShadowing && c.tr.n != 0 {
				t.Error("shadowing must not be transcribed")
			}
		})
	}
}
