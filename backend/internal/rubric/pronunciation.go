package rubric

// Rule-based scoring of the IELTS Pronunciation criterion (criteria/04) and timing hints for
// Fluency and Coherence, computed from Azure Pronunciation Assessment results + pitch analysis.

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"unicode"
)

// ---------- Azure Pronunciation Assessment JSON ----------
// One AzureResult per recognised segment (continuous recognition fires one per utterance).
// Offset / Duration are in 100-ns ticks.
//
// NOTE: the exact nesting of prosody feedback is not fully documented. The parser accepts
// Feedback both inside Words[].PronunciationAssessment and directly on Words[].
// Verify against a real response (save it in examples/azure/) before going live.

type AzureResult struct {
	DisplayText string       `json:"DisplayText"`
	Offset      int64        `json:"Offset"`
	Duration    int64        `json:"Duration"`
	NBest       []AzureNBest `json:"NBest"`
}

// AzureNBest accepts both shapes: the Speech SDK nests scores in PronunciationAssessment,
// the REST API for short audio puts them flat on NBest[] (see examples/azure/rest-sample.json).
type AzureNBest struct {
	Lexical                 string       `json:"Lexical"`
	Display                 string       `json:"Display"`
	PronunciationAssessment *AzureScores `json:"PronunciationAssessment"`
	AzureScores                          // flat REST fields
	Words                   []AzureWord  `json:"Words"`
}

func (nb AzureNBest) scores() AzureScores {
	if nb.PronunciationAssessment != nil {
		return *nb.PronunciationAssessment
	}
	return nb.AzureScores
}

type AzureScores struct {
	AccuracyScore     float64  `json:"AccuracyScore"`
	FluencyScore      float64  `json:"FluencyScore"`
	CompletenessScore float64  `json:"CompletenessScore"`
	ProsodyScore      *float64 `json:"ProsodyScore"` // nil when prosody is off / not en-US
	PronScore         float64  `json:"PronScore"`
}

type AzureWord struct {
	Word                    string         `json:"Word"`
	Offset                  int64          `json:"Offset"`
	Duration                int64          `json:"Duration"`
	PronunciationAssessment *AzureWordPA   `json:"PronunciationAssessment"`
	AccuracyScore           float64        `json:"AccuracyScore"` // flat REST fields
	ErrorType               string         `json:"ErrorType"`
	Feedback                *AzureFeedback `json:"Feedback"`
}

func (w AzureWord) pa() AzureWordPA {
	if w.PronunciationAssessment != nil {
		return *w.PronunciationAssessment
	}
	return AzureWordPA{AccuracyScore: w.AccuracyScore, ErrorType: w.ErrorType}
}

type AzureWordPA struct {
	AccuracyScore float64        `json:"AccuracyScore"`
	ErrorType     string         `json:"ErrorType"`
	Feedback      *AzureFeedback `json:"Feedback"`
}

type AzureConfidence struct {
	Confidence float64 `json:"Confidence"`
}

type AzureFeedback struct {
	Prosody struct {
		Break struct {
			ErrorTypes      []string         `json:"ErrorTypes"`
			UnexpectedBreak *AzureConfidence `json:"UnexpectedBreak"`
			MissingBreak    *AzureConfidence `json:"MissingBreak"`
			BreakLength     int64            `json:"BreakLength"`
		} `json:"Break"`
		Intonation struct {
			ErrorTypes []string `json:"ErrorTypes"`
		} `json:"Intonation"`
	} `json:"Prosody"`
}

func (w AzureWord) feedback() *AzureFeedback {
	if w.PronunciationAssessment != nil && w.PronunciationAssessment.Feedback != nil {
		return w.PronunciationAssessment.Feedback
	}
	return w.Feedback
}

// ---------- Normalised segment ----------

const ticksPerSec = 1e7

type Word struct {
	Text            string
	Start, End      float64 // seconds from the start of the audio stream
	Accuracy        float64
	ErrorType       string
	UnexpectedBreak bool
	MissingBreak    bool
	Monotone        bool
}

type Segment struct {
	ID           int
	Display      string
	Lexical      string
	Start, End   float64
	Words        []Word
	Scores       AzureScores
	SentenceType string // statement | wh_question | yes_no_question | tag_question | other
}

// ParseAzureSegments parses one Azure JSON result per segment.
//
//   - Words with ErrorType "Omission" (reference words the learner did not say, scripted mode)
//     are dropped: they were not spoken, so they are not judged.
//   - MissingBreak only counts where the Display text has punctuation before the word.
//     Azure reports a high MissingBreak confidence on ordinary words too (e.g. "morning" in
//     "Good morning."), so the flag alone would mark normal speech as an error.
//   - UnexpectedBreak counts from its confidence or from the word ErrorType.
func ParseAzureSegments(raw [][]byte, breakConfidence float64) ([]Segment, error) {
	var segs []Segment
	for i, b := range raw {
		var r AzureResult
		if err := json.Unmarshal(b, &r); err != nil {
			return nil, fmt.Errorf("segment %d: %w", i, err)
		}
		if len(r.NBest) == 0 {
			continue
		}
		nb := r.NBest[0]
		s := Segment{
			ID: i, Display: nb.Display, Lexical: nb.Lexical, Scores: nb.scores(),
			Start: float64(r.Offset) / ticksPerSec, End: float64(r.Offset+r.Duration) / ticksPerSec,
		}
		if s.Display == "" {
			s.Display = r.DisplayText
		}
		punct := punctuationBefore(s.Display, nb.Words)
		for j, aw := range nb.Words {
			pa := aw.pa()
			if pa.ErrorType == "Omission" {
				continue
			}
			w := Word{
				Text:  aw.Word,
				Start: float64(aw.Offset) / ticksPerSec, End: float64(aw.Offset+aw.Duration) / ticksPerSec,
				Accuracy: pa.AccuracyScore, ErrorType: pa.ErrorType,
			}
			if fb := aw.feedback(); fb != nil {
				br := fb.Prosody.Break
				w.UnexpectedBreak = (br.UnexpectedBreak != nil && br.UnexpectedBreak.Confidence >= breakConfidence) || contains(br.ErrorTypes, "UnexpectedBreak")
				w.MissingBreak = punct[j] && ((br.MissingBreak != nil && br.MissingBreak.Confidence >= breakConfidence) || contains(br.ErrorTypes, "MissingBreak"))
				w.Monotone = contains(fb.Prosody.Intonation.ErrorTypes, "Monotone")
			}
			switch w.ErrorType {
			case "UnexpectedBreak":
				w.UnexpectedBreak = true
			case "MissingBreak":
				w.MissingBreak = w.MissingBreak || punct[j]
			case "Monotone":
				w.Monotone = true
			}
			s.Words = append(s.Words, w)
		}
		if len(s.Words) > 0 {
			s.Start, s.End = s.Words[0].Start, s.Words[len(s.Words)-1].End
		}
		s.SentenceType = SentenceType(lastSentence(s.Display))
		segs = append(segs, s)
	}
	return segs, nil
}

// punctuationBefore reports, for each recognised word, whether the Display text has
// punctuation (, ; : . ! ?) right before it. Words are aligned to Display tokens in order;
// words missing from Display (fillers, miscues, numbers written as digits) get false.
func punctuationBefore(display string, words []AzureWord) []bool {
	type tok struct {
		norm   string
		punctB bool
	}
	var toks []tok
	prevPunct := false
	for _, f := range strings.Fields(display) {
		core := strings.TrimFunc(f, func(r rune) bool { return !(unicode.IsLetter(r) || unicode.IsDigit(r)) })
		toks = append(toks, tok{norm: normWord(core), punctB: prevPunct})
		trail := strings.TrimRightFunc(f, func(r rune) bool { return r == '"' || r == '\'' || r == ')' || r == '”' })
		prevPunct = trail != "" && strings.ContainsAny(trail[len(trail)-1:], ",;:.!?")
	}
	out := make([]bool, len(words))
	k := 0
	for i, w := range words {
		nw := normWord(w.Word)
		for j := k; j < len(toks) && j < k+3; j++ {
			if toks[j].norm == nw {
				out[i] = toks[j].punctB
				k = j + 1
				break
			}
		}
	}
	return out
}

func normWord(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '\'' {
			return unicode.ToLower(r)
		}
		return -1
	}, s)
}

// ---------- Sentence type (from Azure Display text) ----------

var whWords = wordSet("what", "where", "when", "why", "who", "whom", "whose", "which", "how")
var auxWords = wordSet("am", "is", "are", "was", "were", "do", "does", "did", "have", "has", "had",
	"can", "could", "will", "would", "shall", "should", "may", "might", "must",
	"isn't", "aren't", "wasn't", "weren't", "don't", "doesn't", "didn't", "haven't", "hasn't",
	"can't", "couldn't", "won't", "wouldn't", "shouldn't")

func lastSentence(display string) string {
	d := strings.TrimSpace(display)
	if d == "" {
		return ""
	}
	cut := -1
	for i, r := range d[:len(d)-1] {
		if r == '.' || r == '?' || r == '!' {
			cut = i
		}
	}
	return strings.TrimSpace(d[cut+1:])
}

// SentenceType classifies one sentence by its final punctuation and first word.
func SentenceType(sentence string) string {
	s := strings.TrimSpace(sentence)
	if s == "" {
		return "other"
	}
	words := strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !(unicode.IsLetter(r) || r == '\'')
	})
	if len(words) == 0 {
		return "other"
	}
	switch s[len(s)-1] {
	case '?':
		if i := strings.LastIndex(s, ","); i > 0 && len(strings.Fields(s[i+1:])) <= 3 {
			if _, ok := auxWords[firstWord(s[i+1:])]; ok {
				return "tag_question" // "..., isn't it?" — tone depends on meaning, skipped
			}
		}
		if _, ok := whWords[words[0]]; ok {
			return "wh_question"
		}
		return "yes_no_question" // inverted or declarative ("You like it?")
	case '.', '!':
		return "statement"
	}
	return "other"
}

func firstWord(s string) string {
	f := strings.Fields(strings.ToLower(s))
	if len(f) == 0 {
		return ""
	}
	return strings.Trim(f[0], "?.,!")
}

// ---------- Pitch analysis request / result (pitch/pitch_direction.py) ----------

type PitchItem struct {
	ID           int     `json:"id"`
	Start        float64 `json:"start"` // seconds
	End          float64 `json:"end"`
	SentenceType string  `json:"sentence_type"`
}

type PitchResult struct {
	ID        int     `json:"id"`
	Direction string  `json:"direction"` // rise | fall | level | unvoiced
	DeltaST   float64 `json:"delta_st"`  // semitone change across the region
}

// PitchItems returns the final-word region of each checkable segment.
// The region is extended back to at least minDur seconds so short words still have pitch frames.
func PitchItems(segs []Segment, minDur float64) []PitchItem {
	var items []PitchItem
	for _, s := range segs {
		if s.SentenceType != "statement" && s.SentenceType != "wh_question" && s.SentenceType != "yes_no_question" {
			continue
		}
		if len(s.Words) == 0 {
			continue
		}
		lw := s.Words[len(s.Words)-1]
		start := lw.Start
		if lw.End-start < minDur {
			start = math.Max(s.Start, lw.End-minDur)
		}
		items = append(items, PitchItem{ID: s.ID, Start: start, End: lw.End, SentenceType: s.SentenceType})
	}
	return items
}

// ---------- Speech hints for Fluency and Coherence (evidence for the LLM) ----------

var fillers = wordSet("um", "uh", "er", "erm", "ah", "hmm", "mm")

type SpeechHints struct {
	Words             int      `json:"words"`
	SpeakingSeconds   float64  `json:"speaking_seconds"`
	WordsPerMinute    float64  `json:"words_per_minute"`
	FillerCount       int      `json:"filler_count"`
	Repetitions       int      `json:"repetitions"` // immediate word repeats ("I I", "the the")
	Pauses            int      `json:"pauses_over_0_5s"`
	LongPauses        int      `json:"pauses_over_1_5s"`
	MidSentencePauses int      `json:"mid_sentence_pauses"` // pauses > 0.5 s inside a segment
	MeanPause         float64  `json:"mean_pause_seconds"`
	LowAccuracyWords  []string `json:"low_accuracy_words,omitempty"` // may explain ASR errors in GRA/LR
	PronunciationBand int      `json:"pronunciation_band,omitempty"` // for context only
}

func ComputeSpeechHints(segs []Segment) SpeechHints {
	var h SpeechHints
	type tw struct {
		Word
		seg int
	}
	var words []tw
	for _, s := range segs {
		for _, w := range s.Words {
			words = append(words, tw{w, s.ID})
		}
	}
	if len(words) == 0 {
		return h
	}
	var pauseSum float64
	for i, w := range words {
		lw := strings.ToLower(w.Text)
		if _, ok := fillers[lw]; ok {
			h.FillerCount++
		} else {
			h.Words++
		}
		if w.Accuracy > 0 && w.Accuracy < 60 && len(h.LowAccuracyWords) < 15 {
			h.LowAccuracyWords = append(h.LowAccuracyWords, w.Text)
		}
		if i == 0 {
			continue
		}
		prev := words[i-1]
		if lw == strings.ToLower(prev.Text) {
			h.Repetitions++
		}
		if gap := w.Start - prev.End; gap > 0.5 {
			h.Pauses++
			pauseSum += gap
			if gap > 1.5 {
				h.LongPauses++
			}
			if w.seg == prev.seg {
				h.MidSentencePauses++
			}
		}
	}
	h.SpeakingSeconds = round1(words[len(words)-1].End - words[0].Start)
	if h.SpeakingSeconds > 0 {
		h.WordsPerMinute = round1(float64(h.Words) / h.SpeakingSeconds * 60)
	}
	if h.Pauses > 0 {
		h.MeanPause = round1(pauseSum / float64(h.Pauses))
	}
	return h
}

// ---------- Rule-based Pronunciation band ----------

type SubCriterion struct {
	Method string  `yaml:"method" json:"method"` // rule | not_measured
	Weight float64 `yaml:"weight" json:"weight"`
	Signal string  `yaml:"signal" json:"signal"`
}

type PronunciationConfig struct {
	MinMeasuredItems int                     `yaml:"min_measured_items"`
	Subcriteria      map[string]SubCriterion `yaml:"subcriteria"`
	Thresholds       struct {
		BreakConfidence  float64   `yaml:"break_confidence"`
		MispronouncedPct []float64 `yaml:"mispronounced_pct"`
		BreaksPer10Words []float64 `yaml:"breaks_per_10_words"`
		ProsodyScore     []float64 `yaml:"prosody_score"`
		AccuracyScore    []float64 `yaml:"accuracy_score"`
		IntonationPct    []float64 `yaml:"intonation_pct"`
		MinToneSamples   int       `yaml:"min_tone_samples"`
		MinWords         int       `yaml:"min_words"`
	} `yaml:"thresholds"`
	Pitch struct {
		Script        string  `yaml:"script"`
		RiseSemitones float64 `yaml:"rise_semitones"`
		FallSemitones float64 `yaml:"fall_semitones"`
	} `yaml:"pitch"`
}

// DefaultPronunciationConfig mirrors rubric.yaml; yaml values override it.
func DefaultPronunciationConfig() PronunciationConfig {
	var c PronunciationConfig
	c.MinMeasuredItems = 3
	c.Subcriteria = map[string]SubCriterion{
		"P-01": {Method: "rule", Weight: 1.5}, "P-02": {Method: "rule", Weight: 1},
		"P-03": {Method: "rule", Weight: 1}, "P-04": {Method: "rule", Weight: 1},
		"P-05": {Method: "not_measured"}, "P-06": {Method: "rule", Weight: 1.5},
	}
	t := &c.Thresholds
	t.BreakConfidence = 0.75
	t.MispronouncedPct = []float64{1, 3, 6, 10, 15, 22, 30, 45}
	t.BreaksPer10Words = []float64{0.2, 0.5, 1.0, 1.5, 2.2, 3.0, 4.0, 5.5}
	t.ProsodyScore = []float64{95, 90, 82, 74, 65, 55, 45, 35}
	t.AccuracyScore = []float64{95, 90, 84, 77, 68, 58, 45, 35}
	t.IntonationPct = []float64{95, 88, 78, 66, 55, 42, 30, 20}
	t.MinToneSamples = 2
	t.MinWords = 10
	c.Pitch.Script = "pitch/pitch_direction.py"
	c.Pitch.RiseSemitones, c.Pitch.FallSemitones = 1.5, -1.5
	return c
}

type ItemResult struct {
	Code     string  `json:"code"`
	Method   string  `json:"method"`   // rule | not_measured
	Measured bool    `json:"measured"` // false when not_measured or not enough data
	Band     int     `json:"band,omitempty"`
	Value    float64 `json:"value,omitempty"` // raw metric
	Samples  int     `json:"samples,omitempty"`
	Note     string  `json:"note,omitempty"`
}

type ToneIssue struct {
	SegmentID    int    `json:"segment_id"`
	Quote        string `json:"quote"`
	SentenceType string `json:"sentence_type"`
	Expected     string `json:"expected"`
	Got          string `json:"got"`
}

type PronunciationResult struct {
	ID            string       `json:"id"` // pronunciation
	Assessed      bool         `json:"assessed"`
	Band          int          `json:"band,omitempty"` // 1–9
	Coverage      string       `json:"coverage"`       // e.g. "5/6"
	Items         []ItemResult `json:"items"`
	Mispronounced []string     `json:"mispronounced_words,omitempty"`
	ToneIssues    []ToneIssue  `json:"tone_issues,omitempty"`
	Reason        string       `json:"reason,omitempty"` // when not assessed
}

// bandHigher: value >= cuts[0] -> 9, >= cuts[1] -> 8, ... else 1.
func bandHigher(v float64, cuts []float64) int {
	for i, c := range cuts {
		if v >= c {
			return 9 - i
		}
	}
	return 1
}

// bandLower: value <= cuts[0] -> 9, <= cuts[1] -> 8, ... else 1.
func bandLower(v float64, cuts []float64) int {
	for i, c := range cuts {
		if v <= c {
			return 9 - i
		}
	}
	return 1
}

// ScorePronunciation computes the Pronunciation band. pitch may be nil (P-04 then uses
// the monotone signal only).
func (pc PronunciationConfig) ScorePronunciation(segs []Segment, pitch []PitchResult) PronunciationResult {
	res := PronunciationResult{ID: "pronunciation"}
	th := pc.Thresholds
	items := map[string]*ItemResult{}
	codes := make([]string, 0, len(pc.Subcriteria))
	for code, sc := range pc.Subcriteria {
		codes = append(codes, code)
		items[code] = &ItemResult{Code: code, Method: sc.Method}
	}
	sort.Strings(codes)
	put := func(code string, ok bool, band int, value float64, n int, note string) {
		it := items[code]
		if it == nil || it.Method != "rule" {
			return
		}
		it.Measured, it.Value, it.Samples, it.Note = ok, round1(value), n, note
		if ok {
			it.Band = band
		}
	}

	// Aggregate signals
	var words, mispron, breaks, monoSegs, voicedSegs int
	var ps, psDur, acc, accDur float64
	for _, s := range segs {
		d := s.End - s.Start
		if d > 0 {
			acc += s.Scores.AccuracyScore * d
			accDur += d
			if s.Scores.ProsodyScore != nil {
				ps += *s.Scores.ProsodyScore * d
				psDur += d
			}
		}
		mono := len(s.Words) > 0
		for _, w := range s.Words {
			if _, ok := fillers[strings.ToLower(w.Text)]; ok {
				continue
			}
			words++
			if w.ErrorType == "Mispronunciation" {
				mispron++
				if len(res.Mispronounced) < 20 {
					res.Mispronounced = append(res.Mispronounced, w.Text)
				}
			}
			if w.UnexpectedBreak || w.MissingBreak {
				breaks++
			}
			if !w.Monotone {
				mono = false
			}
		}
		if len(s.Words) > 0 {
			voicedSegs++
			if mono {
				monoSegs++
			}
		}
	}
	enough := words >= th.MinWords

	// P-01 individual words / phonemes
	if enough {
		v := float64(mispron) / float64(words) * 100
		put("P-01", true, bandLower(v, th.MispronouncedPct), v, words, "")
	} else {
		put("P-01", false, 0, 0, words, fmt.Sprintf("fewer than %d words", th.MinWords))
	}
	// P-02 chunking
	if enough {
		v := float64(breaks) / float64(words) * 10
		put("P-02", true, bandLower(v, th.BreaksPer10Words), v, words, "")
	} else {
		put("P-02", false, 0, 0, words, fmt.Sprintf("fewer than %d words", th.MinWords))
	}
	// P-03 rhythm (proxy)
	if psDur > 0 {
		v := ps / psDur
		put("P-03", true, bandHigher(v, th.ProsodyScore), v, len(segs), "ProsodyScore is a proxy for rhythm and stress-timing")
	} else {
		put("P-03", false, 0, 0, 0, "no ProsodyScore (prosody disabled or locale not en-US)")
	}
	// P-04 intonation and stress: non-monotone share, combined with correct final tone when available
	byID := map[int]Segment{}
	for _, s := range segs {
		byID[s.ID] = s
	}
	toneOK, toneN := 0, 0
	for _, p := range pitch {
		s, found := byID[p.ID]
		if !found || p.Direction == "unvoiced" {
			continue
		}
		expected := "fall"
		switch s.SentenceType {
		case "yes_no_question":
			expected = "rise"
		case "statement", "wh_question":
		default:
			continue
		}
		toneN++
		if p.Direction == expected {
			toneOK++
		} else {
			res.ToneIssues = append(res.ToneIssues, ToneIssue{SegmentID: s.ID, Quote: lastSentence(s.Display),
				SentenceType: s.SentenceType, Expected: expected, Got: p.Direction})
		}
	}
	if voicedSegs > 0 {
		v := 100 - float64(monoSegs)/float64(voicedSegs)*100
		note := "non-monotone segments only"
		n := voicedSegs
		if toneN >= th.MinToneSamples {
			v = (v + float64(toneOK)/float64(toneN)*100) / 2
			note = fmt.Sprintf("non-monotone segments + correct final tone (%d/%d)", toneOK, toneN)
			n += toneN
		}
		put("P-04", true, bandHigher(v, th.IntonationPct), v, n, note)
	} else {
		put("P-04", false, 0, 0, 0, "no segments")
	}
	// P-06 intelligibility (proxy)
	if enough && accDur > 0 {
		v := acc / accDur
		put("P-06", true, bandHigher(v, th.AccuracyScore), v, len(segs), "AccuracyScore is measured against a native en-US model")
	} else {
		put("P-06", false, 0, 0, words, "not enough speech")
	}

	// Combine
	var sum, wsum float64
	measured := 0
	for _, code := range codes {
		it := items[code]
		res.Items = append(res.Items, *it)
		if it.Measured {
			measured++
			w := pc.Subcriteria[code].Weight
			if w == 0 {
				w = 1
			}
			sum += float64(it.Band) * w
			wsum += w
		}
	}
	res.Coverage = fmt.Sprintf("%d/%d", measured, len(codes))
	if measured < pc.MinMeasuredItems || wsum == 0 {
		res.Reason = "insufficient_speech"
		return res
	}
	res.Assessed = true
	res.Band = int(math.Round(sum / wsum))
	return res
}

// ---------- helpers ----------

func wordSet(xs ...string) map[string]struct{} {
	m := make(map[string]struct{}, len(xs))
	for _, x := range xs {
		m[x] = struct{}{}
	}
	return m
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }
