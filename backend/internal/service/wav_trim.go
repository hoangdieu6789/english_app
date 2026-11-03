package service

import (
	"bytes"
	"encoding/binary"
	"math"
)

// Silence trimming before the audio goes to Azure. Azure bills (and the Free tier counts)
// by audio length, and the learner usually leaves a second or two of silence before and
// after speaking. Cutting it saves free quota and makes the Azure call faster.
const (
	trimFrameMs    = 20
	trimPadMs      = 250   // keep this much audio around the speech so first/last sounds stay whole
	trimMinRMS     = 300.0 // absolute floor (16-bit PCM) for "speech"
	trimPeakFactor = 0.06  // a frame is speech if its RMS >= 6% of the loudest frame (and >= trimMinRMS)
	trimMinSaveMs  = 300   // do not rewrite the file to save less than this
)

// TrimSilenceWAV removes leading and trailing silence from 16-bit mono PCM WAV audio (the
// format the frontend recorder produces). Any other format, or audio with no clear speech,
// is returned unchanged.
func TrimSilenceWAV(wav []byte) []byte {
	fmtOff, dataOff, dataLen, ok := parseWAV(wav)
	if !ok {
		return wav
	}
	channels := binary.LittleEndian.Uint16(wav[fmtOff+2:])
	rate := binary.LittleEndian.Uint32(wav[fmtOff+4:])
	bits := binary.LittleEndian.Uint16(wav[fmtOff+14:])
	if binary.LittleEndian.Uint16(wav[fmtOff:]) != 1 || channels != 1 || bits != 16 || rate == 0 {
		return wav
	}

	pcm := wav[dataOff : dataOff+dataLen]
	n := len(pcm) / 2
	frame := int(rate) * trimFrameMs / 1000
	if frame == 0 || n < frame*2 {
		return wav
	}
	frames := n / frame
	rms := make([]float64, frames)
	peak := 0.0
	for f := 0; f < frames; f++ {
		var sum float64
		for i := f * frame; i < (f+1)*frame; i++ {
			v := float64(int16(binary.LittleEndian.Uint16(pcm[i*2:])))
			sum += v * v
		}
		rms[f] = math.Sqrt(sum / float64(frame))
		peak = math.Max(peak, rms[f])
	}
	thr := math.Max(trimMinRMS, peak*trimPeakFactor)
	first, last := -1, -1
	for f, r := range rms {
		if r >= thr {
			if first < 0 {
				first = f
			}
			last = f
		}
	}
	if first < 0 {
		return wav // no speech found: let Azure decide
	}

	pad := int(rate) * trimPadMs / 1000
	start := max(0, first*frame-pad)
	end := min(n, (last+1)*frame+pad)
	if (start+(n-end))*1000/int(rate) < trimMinSaveMs {
		return wav
	}
	return buildWAV(wav[fmtOff:fmtOff+16], pcm[start*2:end*2])
}

// parseWAV finds the "fmt " and "data" chunks of a RIFF/WAVE file.
func parseWAV(b []byte) (fmtOff, dataOff, dataLen int, ok bool) {
	if len(b) < 12 || string(b[0:4]) != "RIFF" || string(b[8:12]) != "WAVE" {
		return 0, 0, 0, false
	}
	fmtOff = -1
	for p := 12; p+8 <= len(b); {
		id := string(b[p : p+4])
		size := int(binary.LittleEndian.Uint32(b[p+4:]))
		body := p + 8
		switch id {
		case "fmt ":
			if size >= 16 && body+16 <= len(b) {
				fmtOff = body
			}
		case "data":
			if fmtOff < 0 {
				return 0, 0, 0, false
			}
			size = min(size, len(b)-body) // recorders sometimes write a wrong size
			return fmtOff, body, size - size%2, true
		}
		p = body + size + size%2
	}
	return 0, 0, 0, false
}

func buildWAV(fmtChunk, pcm []byte) []byte {
	var b bytes.Buffer
	b.WriteString("RIFF")
	binary.Write(&b, binary.LittleEndian, uint32(4+8+16+8+len(pcm)))
	b.WriteString("WAVEfmt ")
	binary.Write(&b, binary.LittleEndian, uint32(16))
	b.Write(fmtChunk)
	b.WriteString("data")
	binary.Write(&b, binary.LittleEndian, uint32(len(pcm)))
	b.Write(pcm)
	return b.Bytes()
}
