package rubric

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
)

// RunPitchAnalysis calls pitch/pitch_direction.py on a WAV file (the same audio that was
// streamed to Azure, so word offsets line up) and returns the final pitch direction per item.
//
//	python: interpreter path, e.g. "python3"
//	script: path to pitch_direction.py on disk (not embedded — it runs as a separate process)
func (pc PronunciationConfig) RunPitchAnalysis(ctx context.Context, python, script, wavPath string, items []PitchItem) ([]PitchResult, error) {
	if len(items) == 0 {
		return []PitchResult{}, nil
	}
	req, err := json.Marshal(map[string]any{
		"audio":          wavPath,
		"items":          items,
		"rise_semitones": pc.Pitch.RiseSemitones,
		"fall_semitones": pc.Pitch.FallSemitones,
	})
	if err != nil {
		return nil, err
	}
	cmd := exec.CommandContext(ctx, python, script)
	cmd.Stdin = bytes.NewReader(req)
	var out, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("pitch analysis: %w: %s", err, stderr.String())
	}
	var res struct {
		Results []PitchResult `json:"results"`
	}
	if err := json.Unmarshal(out.Bytes(), &res); err != nil {
		return nil, fmt.Errorf("pitch analysis output: %w", err)
	}
	return res.Results, nil
}
