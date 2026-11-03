package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/rubric"
)

// TaskShadowing is the app's read-aloud task. It is not an IELTS part: only Pronunciation
// is scored (rule-based), the transcript criteria are skipped and the LLM is not called.
const TaskShadowing = "shadowing"

// ReasonNotInTask marks the transcript criteria of a shadowing attempt in not_assessed.
const ReasonNotInTask = "not_in_task"

// SpeakingTask describes what the learner was asked to do. Type is "shadowing" or an IELTS
// part from internal/rubric/rubric.yaml (part1, part2, part3, full_test).
type SpeakingTask struct {
	Type   string `json:"task_type"`
	Prompt string `json:"questions,omitempty"` // the question(s) or cue card the learner answered
	// QuestionSetID is the IELTS question set answered (stored with the attempt, not sent to the LLM).
	QuestionSetID *uuid.UUID `json:"-"`
}

// LLMCompleter sends one system + user prompt and returns the model's text reply.
type LLMCompleter interface {
	Complete(ctx context.Context, system, user string) (string, error)
}

// PitchAnalyzer returns the final pitch direction of each item (rubric Pronunciation P-04).
type PitchAnalyzer interface {
	Analyze(ctx context.Context, audioWAV []byte, items []rubric.PitchItem) ([]rubric.PitchResult, error)
}

// SpeakingGrader applies the IELTS speaking rubric (internal/rubric):
//   - Pronunciation is computed in code from the Azure result (+ optional pitch analysis);
//   - Fluency and Coherence, Lexical Resource and Grammatical Range and Accuracy are scored
//     by the LLM from the transcript and the timing hints (not for shadowing);
//   - the overall band and CEFR estimate are computed in code.
type SpeakingGrader struct {
	cfg   *rubric.Config
	llm   LLMCompleter  // nil = no LLM configured; transcript criteria are then not assessed
	pitch PitchAnalyzer // nil = no pitch analysis; P-04 then uses the monotone signal only
}

func NewSpeakingGrader(cfg *rubric.Config, llm LLMCompleter, pitch PitchAnalyzer) *SpeakingGrader {
	return &SpeakingGrader{cfg: cfg, llm: llm, pitch: pitch}
}

func (g *SpeakingGrader) Config() *rubric.Config { return g.cfg }

// HasTask reports whether taskType is shadowing or an IELTS part from the rubric.
func (g *SpeakingGrader) HasTask(taskType string) bool {
	return taskType == TaskShadowing || g.cfg.HasTask(taskType)
}

type GradeInput struct {
	Task       SpeakingTask
	Transcript string
	AzureRaw   []byte // raw Azure Pronunciation Assessment response
	AudioWAV   []byte
}

// Grade returns the rubric result and the parsed Azure segments (their words carry the
// break / monotone flags). A failing LLM or pitch step does not fail the grade: the affected
// criteria are reported in not_assessed.
func (g *SpeakingGrader) Grade(ctx context.Context, in GradeInput) (*rubric.Result, []rubric.Segment, error) {
	if !g.HasTask(in.Task.Type) {
		return nil, nil, fmt.Errorf("unknown task type %q", in.Task.Type)
	}
	start := time.Now()
	pc := g.cfg.Pronunciation

	var segs []rubric.Segment
	if len(in.AzureRaw) > 0 {
		var err error
		segs, err = rubric.ParseAzureSegments([][]byte{in.AzureRaw}, pc.Thresholds.BreakConfidence)
		if err != nil {
			return nil, nil, fmt.Errorf("parse azure result: %w", err)
		}
	}

	var pron *rubric.PronunciationResult
	var hints *rubric.SpeechHints
	if len(segs) > 0 {
		var pitch []rubric.PitchResult
		if g.pitch != nil && len(in.AudioWAV) > 0 {
			if items := rubric.PitchItems(segs, 0.3); len(items) > 0 {
				p, err := g.pitch.Analyze(ctx, in.AudioWAV, items)
				if err != nil {
					log.Printf("speaking grader: pitch analysis skipped: %v", err)
				} else {
					pitch = p
				}
			}
		}
		r := pc.ScorePronunciation(segs, pitch)
		pron = &r
		h := rubric.ComputeSpeechHints(segs)
		if r.Assessed {
			h.PronunciationBand = r.Band
		}
		hints = &h
	}

	shadowing := in.Task.Type == TaskShadowing
	var llmEval *rubric.Evaluation
	if !shadowing && g.llm != nil {
		ev, err := g.gradeTranscript(ctx, in, hints)
		if err != nil {
			log.Printf("speaking grader: llm grading failed: %v", err)
		} else {
			llmEval = ev
		}
	}

	res := g.cfg.Assemble(in.Task.Type, llmEval, pron, hints)
	log.Printf("speaking grader: task=%s llm=%v took=%s", in.Task.Type, llmEval != nil, time.Since(start).Round(100*time.Millisecond))
	if shadowing {
		// Reading a given sentence shows nothing about fluency, vocabulary or grammar.
		for i, na := range res.NotAssessed {
			if na.Reason == "grader_unavailable" {
				res.NotAssessed[i].Reason = ReasonNotInTask
			}
		}
	}
	return &res, segs, nil
}

func (g *SpeakingGrader) gradeTranscript(ctx context.Context, in GradeInput, hints *rubric.SpeechHints) (*rubric.Evaluation, error) {
	system, err := g.cfg.BuildSystemPrompt()
	if err != nil {
		return nil, fmt.Errorf("build system prompt: %w", err)
	}
	user, err := json.Marshal(map[string]any{
		"task":         in.Task,
		"transcript":   in.Transcript,
		"speech_hints": hints,
	})
	if err != nil {
		return nil, err
	}
	reply, err := g.llm.Complete(ctx, system, string(user))
	if err != nil {
		return nil, err
	}
	return g.cfg.ParseEvaluation(reply, in.Task.Type)
}

// ScriptPitchAnalyzer runs internal/rubric/pitch/pitch_direction.py (needs Python with
// praat-parselmouth and numpy). Enabled by PITCH_PYTHON; see backend/env.example.
type ScriptPitchAnalyzer struct {
	python, script string
	pc             rubric.PronunciationConfig
	timeout        time.Duration
}

func NewScriptPitchAnalyzer(python, script string, pc rubric.PronunciationConfig) *ScriptPitchAnalyzer {
	return &ScriptPitchAnalyzer{python: python, script: script, pc: pc, timeout: 15 * time.Second}
}

func (a *ScriptPitchAnalyzer) Analyze(ctx context.Context, audioWAV []byte, items []rubric.PitchItem) ([]rubric.PitchResult, error) {
	f, err := os.CreateTemp("", "pitch-*.wav")
	if err != nil {
		return nil, err
	}
	defer os.Remove(f.Name())
	if _, err := f.Write(audioWAV); err != nil {
		f.Close()
		return nil, err
	}
	if err := f.Close(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, a.timeout)
	defer cancel()
	return a.pc.RunPitchAnalysis(ctx, a.python, a.script, f.Name(), items)
}
