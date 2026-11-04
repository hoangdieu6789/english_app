// Package rubric loads the IELTS speaking rubric (markdown + yaml), builds the grader prompt
// and computes the overall band.
//
// Copy this whole folder into your backend, e.g. internal/rubric/, and the markdown files
// are compiled into the binary through embed — no file paths needed at runtime.
package rubric

import (
	"embed"
	"fmt"
	"math"
	"strings"

	"englishapp/backend/internal/i18n"
	"gopkg.in/yaml.v3"
)

//go:embed rubric.yaml criteria/*.md prompts/*.md schema/*.json
var files embed.FS

type Criterion struct {
	ID       string  `yaml:"id"`
	File     string  `yaml:"file"`
	Evidence string  `yaml:"evidence"` // transcript | acoustic
	Scoring  string  `yaml:"scoring"`  // llm | rule
	Weight   float64 `yaml:"weight"`
}

type CEFRBand struct {
	Min   float64 `yaml:"min"`
	Max   float64 `yaml:"max"`
	Level string  `yaml:"level"`
}

type Config struct {
	Version string `yaml:"version"`
	Overall struct {
		Rounding    string     `yaml:"rounding"` // ielts_half | floor_half
		CEFRMapping []CEFRBand `yaml:"cefr_mapping"`
	} `yaml:"overall"`
	Feedback struct {
		Language              string `yaml:"language"`
		MaxIssuesPerCriterion int    `yaml:"max_issues_per_criterion"`
	} `yaml:"feedback"`
	Shared        []string            `yaml:"shared"`
	Criteria      []Criterion         `yaml:"criteria"`
	TaskTypes     []string            `yaml:"task_types"`
	Pronunciation PronunciationConfig `yaml:"pronunciation"`
	Prompts       struct {
		System       string `yaml:"system"`
		OutputFormat string `yaml:"output_format"`
	} `yaml:"prompts"`
	OutputSchema string `yaml:"output_schema"`
}

// Load parses rubric.yaml.
func Load() (*Config, error) {
	b, err := files.ReadFile("rubric.yaml")
	if err != nil {
		return nil, err
	}
	c := Config{Pronunciation: DefaultPronunciationConfig()}
	if err := yaml.Unmarshal(b, &c); err != nil {
		return nil, fmt.Errorf("parse rubric.yaml: %w", err)
	}
	return &c, nil
}

// LLMCriteria returns the criteria the LLM must score (scoring: llm), in yaml order.
func (c *Config) LLMCriteria() []Criterion {
	var out []Criterion
	for _, cr := range c.Criteria {
		if cr.Scoring == "llm" {
			out = append(out, cr)
		}
	}
	return out
}

// WithLanguage returns a copy of the config whose learner-facing feedback is in lang (a
// supported language, internal/i18n); other values keep the configured language.
func (c *Config) WithLanguage(lang string) *Config {
	if !i18n.Supported(lang) || lang == c.Feedback.Language {
		return c
	}
	cp := *c
	cp.Feedback.Language = lang
	return &cp
}

// BuildSystemPrompt assembles prompts/system.md with the shared docs and the docs of the
// LLM-scored criteria. It does not depend on the task, so the whole system prompt is a
// stable prefix that the LLM provider can cache. Put task type, question and transcript
// in the user message.
func (c *Config) BuildSystemPrompt() (string, error) {
	read := func(p string) (string, error) {
		b, err := files.ReadFile(p)
		return string(b), err
	}
	var shared, docs, ids []string
	for _, p := range c.Shared {
		s, err := read(p)
		if err != nil {
			return "", err
		}
		shared = append(shared, s)
	}
	for _, cr := range c.LLMCriteria() {
		s, err := read(cr.File)
		if err != nil {
			return "", err
		}
		docs = append(docs, s)
		ids = append(ids, "`"+cr.ID+"`")
	}
	sys, err := read(c.Prompts.System)
	if err != nil {
		return "", err
	}
	out, err := read(c.Prompts.OutputFormat)
	if err != nil {
		return "", err
	}
	// Placeholders inside the output-format doc first (Replacer does a single pass).
	out = strings.ReplaceAll(out, "{{max_issues_per_criterion}}", fmt.Sprint(c.Feedback.MaxIssuesPerCriterion))

	r := strings.NewReplacer(
		"{{criteria_ids}}", strings.Join(ids, ", "),
		"{{shared_docs}}", strings.Join(shared, "\n\n---\n\n"),
		"{{criteria_docs}}", strings.Join(docs, "\n\n---\n\n"),
		"{{output_format}}", out,
		"{{feedback_language}}", languageName(c.Feedback.Language),
	)
	return r.Replace(sys), nil
}

// Schema returns the JSON schema of the LLM output (structured output / validation).
func Schema() ([]byte, error) { return files.ReadFile("schema/evaluation.schema.json") }

type OverallResult struct {
	Band        float64  `json:"band"`        // 0–9 in half bands
	Mean        float64  `json:"mean"`        // unrounded weighted mean
	CEFR        string   `json:"cefr"`        // approximate
	Provisional bool     `json:"provisional"` // true when a criterion was not assessed
	Missing     []string `json:"missing,omitempty"`
}

// OverallBand averages the criterion bands (1–9) and rounds to a half band.
// Criteria absent from bands, or with band < 1, are treated as not assessed.
func (c *Config) OverallBand(bands map[string]int) OverallResult {
	var res OverallResult
	var sum, wsum float64
	for _, cr := range c.Criteria {
		b, ok := bands[cr.ID]
		if !ok || b < 1 {
			res.Missing = append(res.Missing, cr.ID)
			continue
		}
		w := cr.Weight
		if w == 0 {
			w = 1
		}
		sum += float64(b) * w
		wsum += w
	}
	if wsum == 0 {
		return res
	}
	res.Provisional = len(res.Missing) > 0
	res.Mean = math.Round(sum/wsum*100) / 100
	res.Band = RoundHalf(sum/wsum, c.Overall.Rounding)
	for _, m := range c.Overall.CEFRMapping {
		if res.Band >= m.Min && res.Band <= m.Max {
			res.CEFR = m.Level
			break
		}
	}
	return res
}

// RoundHalf rounds a mean band to .0 or .5.
//
//	ielts_half: fraction < .25 -> .0, < .75 -> .5, else next whole band
//	floor_half: always down to the nearest .0 / .5
func RoundHalf(v float64, mode string) float64 {
	v = math.Round(v*1000) / 1000 // avoid float noise like 6.2499999
	whole := math.Floor(v)
	frac := v - whole
	if mode == "floor_half" {
		if frac >= 0.5 {
			return whole + 0.5
		}
		return whole
	}
	switch {
	case frac < 0.25:
		return whole
	case frac < 0.75:
		return whole + 0.5
	default:
		return whole + 1
	}
}

// languageName turns the feedback language code into the name used in the prompt.
func languageName(code string) string {
	if i18n.Supported(code) {
		return i18n.Name(code)
	}
	return code
}
