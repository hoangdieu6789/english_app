package rubric

// Grader output: the JSON the LLM returns (schema/evaluation.schema.json) and the final
// result the application stores, which adds the rule-scored Pronunciation and the overall band.

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// Evaluation is the LLM reply described in prompts/output-format.md.
type Evaluation struct {
	TaskType    string          `json:"task_type"`
	Criteria    []CriterionEval `json:"criteria"`
	NotAssessed []NotAssessed   `json:"not_assessed"`
	Summary     string          `json:"summary"`
}

type CriterionEval struct {
	ID        string   `json:"id"`
	Band      int      `json:"band"`
	Rationale string   `json:"rationale"`
	Strengths []string `json:"strengths"`
	Issues    []Issue  `json:"issues"`
	NextStep  string   `json:"next_step"`
}

type Issue struct {
	Code        string `json:"code"`
	Quote       string `json:"quote"`
	Correction  string `json:"correction"`
	Explanation string `json:"explanation"`
	Impact      string `json:"impact"`     // global | local
	Confidence  string `json:"confidence"` // high | low
}

type NotAssessed struct {
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

// Result is what the application stores and shows: LLM criteria + rule-scored Pronunciation +
// overall band.
type Result struct {
	Version       string               `json:"version"`
	TaskType      string               `json:"task_type"`
	Overall       OverallResult        `json:"overall"` // Band 0 when nothing could be assessed
	Criteria      []CriterionEval      `json:"criteria"`
	Pronunciation *PronunciationResult `json:"pronunciation,omitempty"`
	NotAssessed   []NotAssessed        `json:"not_assessed"`
	Summary       string               `json:"summary"`
	SpeechHints   *SpeechHints         `json:"speech_hints,omitempty"`
}

var issueCodePattern = regexp.MustCompile(`^(FC|LR|GRA)-[0-9]{2}$`)

// HasTask reports whether taskType is one of the task types in rubric.yaml.
func (c *Config) HasTask(taskType string) bool {
	for _, t := range c.TaskTypes {
		if t == taskType {
			return true
		}
	}
	return false
}

// ParseEvaluation reads the LLM reply and applies the rules of prompts/output-format.md.
// It repairs what it safely can instead of failing the whole grade:
// unknown criteria (including pronunciation) are dropped, a band outside 1–9 moves the
// criterion to not_assessed, issues with an invalid code are dropped, extra issues are cut,
// and expected criteria the model left out are added to not_assessed.
func (c *Config) ParseEvaluation(reply, taskType string) (*Evaluation, error) {
	start, end := strings.Index(reply, "{"), strings.LastIndex(reply, "}")
	if start < 0 || end <= start {
		return nil, fmt.Errorf("no JSON object in grader reply")
	}
	var ev Evaluation
	if err := json.Unmarshal([]byte(reply[start:end+1]), &ev); err != nil {
		return nil, fmt.Errorf("parse grader JSON: %w", err)
	}

	expected := map[string]bool{}
	var order []string
	for _, cr := range c.LLMCriteria() {
		expected[cr.ID] = true
		order = append(order, cr.ID)
	}
	maxIssues := c.Feedback.MaxIssuesPerCriterion
	seen := map[string]bool{}
	var kept []CriterionEval
	var notAssessed []NotAssessed
	for _, cr := range ev.Criteria {
		if !expected[cr.ID] || seen[cr.ID] {
			continue
		}
		seen[cr.ID] = true
		if cr.Band < 1 || cr.Band > 9 {
			notAssessed = append(notAssessed, NotAssessed{ID: cr.ID, Reason: "invalid_band"})
			continue
		}
		issues := []Issue{} // never null in the stored JSON (the UI reads .length)
		for _, is := range cr.Issues {
			if issueCodePattern.MatchString(is.Code) {
				issues = append(issues, is)
			}
		}
		if maxIssues > 0 && len(issues) > maxIssues {
			issues = issues[:maxIssues]
		}
		cr.Issues = issues
		if cr.Strengths == nil {
			cr.Strengths = []string{}
		}
		kept = append(kept, cr)
	}
	for _, na := range ev.NotAssessed {
		if expected[na.ID] && !seen[na.ID] {
			seen[na.ID] = true
			notAssessed = append(notAssessed, na)
		}
	}
	for _, id := range order {
		if !seen[id] {
			notAssessed = append(notAssessed, NotAssessed{ID: id, Reason: "not_returned"})
		}
	}
	ev.TaskType, ev.Criteria, ev.NotAssessed = taskType, kept, notAssessed
	if ev.Criteria == nil {
		ev.Criteria = []CriterionEval{}
	}
	if ev.NotAssessed == nil {
		ev.NotAssessed = []NotAssessed{}
	}
	return &ev, nil
}

// Assemble combines the LLM evaluation (nil when the grader failed) with the rule-scored
// Pronunciation (nil when there is no acoustic data) into the final result.
func (c *Config) Assemble(taskType string, llm *Evaluation, pron *PronunciationResult, hints *SpeechHints) Result {
	res := Result{
		Version:       c.Version,
		TaskType:      taskType,
		Criteria:      []CriterionEval{},
		NotAssessed:   []NotAssessed{},
		Pronunciation: pron,
		SpeechHints:   hints,
	}
	bands := map[string]int{}

	if llm != nil {
		for _, cr := range llm.Criteria {
			res.Criteria = append(res.Criteria, cr)
			bands[cr.ID] = cr.Band
		}
		res.NotAssessed = append(res.NotAssessed, llm.NotAssessed...)
		res.Summary = llm.Summary
	} else {
		for _, cr := range c.LLMCriteria() {
			res.NotAssessed = append(res.NotAssessed, NotAssessed{ID: cr.ID, Reason: "grader_unavailable"})
		}
	}

	// Rule-scored criteria (pronunciation).
	for _, cr := range c.Criteria {
		if cr.Scoring != "rule" {
			continue
		}
		switch {
		case pron != nil && pron.Assessed && pron.ID == cr.ID:
			bands[cr.ID] = pron.Band
		case pron != nil && pron.Reason != "":
			res.NotAssessed = append(res.NotAssessed, NotAssessed{ID: cr.ID, Reason: pron.Reason})
		default:
			res.NotAssessed = append(res.NotAssessed, NotAssessed{ID: cr.ID, Reason: "no_acoustic_data"})
		}
	}

	res.Overall = c.OverallBand(bands)
	if res.Summary == "" {
		res.Summary = c.pronunciationSummary(pron)
	}
	return res
}

// pronunciationSummary is the learner-facing summary when no LLM result is available.
func (c *Config) pronunciationSummary(pron *PronunciationResult) string {
	vi := c.Feedback.Language != "en"
	if pron == nil || !pron.Assessed {
		if vi {
			return "Chưa đủ dữ liệu để chấm. Hãy nói trọn câu, rõ ràng, rồi thử lại."
		}
		return "Not enough data to score. Speak in full sentences, clearly, and try again."
	}
	var weakest *ItemResult
	for i := range pron.Items {
		it := &pron.Items[i]
		if it.Measured && (weakest == nil || it.Band < weakest.Band) {
			weakest = it
		}
	}
	var b strings.Builder
	if vi {
		fmt.Fprintf(&b, "Pronunciation: band %d (đo được %s đặc điểm).", pron.Band, pron.Coverage)
	} else {
		fmt.Fprintf(&b, "Pronunciation: band %d (%s features measured).", pron.Band, pron.Coverage)
	}
	if weakest != nil && weakest.Band < 9 {
		if tip := pronunciationTip(weakest.Code, vi); tip != "" {
			b.WriteString(" ")
			b.WriteString(tip)
		}
	}
	return b.String()
}

func pronunciationTip(code string, vi bool) string {
	tips := map[string][2]string{
		"P-01": {"Luyện lại các từ bị phát âm sai, chú ý âm cuối (-s, -ed, -t, -k) và nguyên âm dài/ngắn.",
			"Practise the mispronounced words, especially final sounds (-s, -ed, -t, -k) and long/short vowels."},
		"P-02": {"Ngắt hơi ở ranh giới cụm từ và ở dấu câu, tránh ngắt giữa một cụm.",
			"Pause at phrase boundaries and at punctuation, not inside a phrase."},
		"P-03": {"Nhấn rõ từ chính (danh từ, động từ, tính từ) và đọc nhẹ các từ phụ như a, the, to, of để có nhịp tự nhiên.",
			"Stress the content words and keep small words like a, the, to, of weak to get a natural rhythm."},
		"P-04": {"Thay đổi cao độ để làm nổi bật từ quan trọng; hạ giọng cuối câu kể, lên giọng cuối câu hỏi Yes/No.",
			"Vary your pitch to highlight key words; fall at the end of statements, rise at the end of yes-no questions."},
		"P-06": {"Nói chậm lại một chút và phát âm rõ từng từ để người nghe hiểu dễ hơn.",
			"Slow down a little and articulate each word so you are easier to understand."},
	}
	t, ok := tips[code]
	if !ok {
		return ""
	}
	if vi {
		return t[0]
	}
	return t[1]
}
