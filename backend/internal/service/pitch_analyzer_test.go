package service

import (
	"bytes"
	"context"
	"encoding/binary"
	"math"
	"os"
	"testing"

	"englishapp/backend/internal/rubric"
)

// sweepWAV returns 16 kHz mono 16-bit PCM: a glide falling 220→150 Hz over the first half,
// then rising 150→240 Hz over the second half (phase-continuous).
func sweepWAV(seconds float64) []byte {
	const rate = 16000
	n := int(seconds * rate)
	half := n / 2
	pcm := make([]int16, n)
	phase := 0.0
	for i := 0; i < n; i++ {
		var f float64
		if i < half {
			f = 220 - 70*float64(i)/float64(half)
		} else {
			f = 150 + 90*float64(i-half)/float64(n-half)
		}
		phase += 2 * math.Pi * f / rate
		// a few harmonics so it looks more like a voice to the pitch tracker
		v := math.Sin(phase) + 0.5*math.Sin(2*phase) + 0.25*math.Sin(3*phase)
		pcm[i] = int16(v / 1.75 * 0.6 * math.MaxInt16)
	}
	var b bytes.Buffer
	data := n * 2
	b.WriteString("RIFF")
	binary.Write(&b, binary.LittleEndian, uint32(36+data))
	b.WriteString("WAVEfmt ")
	binary.Write(&b, binary.LittleEndian, uint32(16))
	binary.Write(&b, binary.LittleEndian, uint16(1)) // PCM
	binary.Write(&b, binary.LittleEndian, uint16(1)) // mono
	binary.Write(&b, binary.LittleEndian, uint32(rate))
	binary.Write(&b, binary.LittleEndian, uint32(rate*2))
	binary.Write(&b, binary.LittleEndian, uint16(2))
	binary.Write(&b, binary.LittleEndian, uint16(16))
	b.WriteString("data")
	binary.Write(&b, binary.LittleEndian, uint32(data))
	binary.Write(&b, binary.LittleEndian, pcm)
	return b.Bytes()
}

// Runs the real pitch script. Needs Python with praat-parselmouth + numpy:
//
//	PITCH_PYTHON=python3 go test ./internal/service/ -run Pitch
func TestScriptPitchAnalyzer(t *testing.T) {
	python := os.Getenv("PITCH_PYTHON")
	if python == "" {
		t.Skip("PITCH_PYTHON not set")
	}
	cfg, err := rubric.Load()
	if err != nil {
		t.Fatal(err)
	}
	a := NewScriptPitchAnalyzer(python, "../rubric/pitch/pitch_direction.py", cfg.Pronunciation)
	res, err := a.Analyze(context.Background(), sweepWAV(1.2), []rubric.PitchItem{
		{ID: 0, Start: 0.1, End: 0.45, SentenceType: "statement"},
		{ID: 1, Start: 0.75, End: 1.1, SentenceType: "yes_no_question"},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("pitch: %+v", res)
	if len(res) != 2 || res[0].Direction != "fall" || res[1].Direction != "rise" {
		t.Fatalf("want [fall rise], got %+v", res)
	}
}
