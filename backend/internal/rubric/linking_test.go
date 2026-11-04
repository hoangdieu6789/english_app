package rubric

import (
	"fmt"
	"testing"
)

// azureWordJSON builds one REST-shaped word with phonemes; start and dur are in ms.
func azureWordJSON(word string, start, dur int, phones ...string) string {
	ps := ""
	for i, p := range phones {
		if i > 0 {
			ps += ","
		}
		ps += fmt.Sprintf(`{"Phoneme":%q}`, p)
	}
	return fmt.Sprintf(`{"Word":%q,"Offset":%d,"Duration":%d,"AccuracyScore":95,"ErrorType":"None","Phonemes":[%s]}`,
		word, start*10000, dur*10000, ps)
}

func TestLinkingFromAzureJSON(t *testing.T) {
	// "I turn it off, and look at it." with one pause inside "look at".
	words := []string{
		azureWordJSON("i", 0, 200, "ay"),
		azureWordJSON("turn", 210, 300, "t", "er", "n"), // turn_it: linked (10 ms)
		azureWordJSON("it", 540, 150, "ih", "t"),        // it_off: linked (30 ms)
		azureWordJSON("off", 720, 250, "ao", "f"),       // off_and: comma -> skipped
		azureWordJSON("and", 1300, 200, "ae", "n", "d"), // and_look: next starts with a consonant
		azureWordJSON("look", 1510, 250, "l", "uh", "k"),
		azureWordJSON("at", 1900, 150, "ae", "t"), // look_at: 140 ms pause -> not linked
		azureWordJSON("it", 2060, 150, "ih", "t"), // at_it: linked (10 ms)
	}
	body := `{"NBest":[{"Display":"I turn it off, and look at it.","Words":[`
	for i, w := range words {
		if i > 0 {
			body += ","
		}
		body += w
	}
	body += `]}]}`
	segs, err := ParseAzureSegments([][]byte{[]byte(body)}, 0.75)
	if err != nil {
		t.Fatal(err)
	}
	if w := segs[0].Words[1]; w.FirstPhone != "t" || w.LastPhone != "n" {
		t.Fatalf("phones of %q = %q..%q", w.Text, w.FirstPhone, w.LastPhone)
	}
	linked, pairs, unlinked := Linking(segs, 0.03)
	if pairs != 4 || linked != 3 || len(unlinked) != 1 || unlinked[0] != "look at" {
		t.Fatalf("linked=%d pairs=%d unlinked=%v", linked, pairs, unlinked)
	}

	pc := DefaultPronunciationConfig()
	r := pc.ScorePronunciation(segs, nil)
	var p05 *ItemResult
	for i := range r.Items {
		if r.Items[i].Code == "P-05" {
			p05 = &r.Items[i]
		}
	}
	if p05 == nil || !p05.Measured || p05.Value != 75 || p05.Band != bandHigher(75, pc.Thresholds.LinkingPct) || p05.Samples != 4 {
		t.Fatalf("P-05 = %+v", p05)
	}
	if len(r.UnlinkedPairs) != 1 {
		t.Fatalf("unlinked pairs = %v", r.UnlinkedPairs)
	}
}

func TestLinkingNeedsEnoughJoins(t *testing.T) {
	segs := []Segment{{Words: []Word{
		{Text: "look", End: 0.3, LastPhone: "k"},
		{Text: "at", Start: 0.31, End: 0.5, FirstPhone: "ae", LastPhone: "t"},
		{Text: "um", Start: 0.51, End: 0.7, FirstPhone: "ah", LastPhone: "m"}, // filler: skipped
		{Text: "me", Start: 0.71, End: 0.9, FirstPhone: "m", LastPhone: "iy"},
	}}}
	if linked, pairs, _ := Linking(segs, 0.03); linked != 1 || pairs != 1 {
		t.Fatalf("linked=%d pairs=%d", linked, pairs)
	}
	r := DefaultPronunciationConfig().ScorePronunciation(segs, nil)
	for _, it := range r.Items {
		if it.Code == "P-05" && it.Measured {
			t.Fatalf("P-05 measured with 1 join: %+v", it)
		}
	}
}
