package vocab

import "testing"

func TestWords(t *testing.T) {
	ws := Words()
	if len(ws) != 3766 {
		t.Fatalf("words = %d", len(ws))
	}
	bands := map[float32]int{}
	for _, w := range ws {
		bands[w.Band]++
		if w.Word == "" || (w.Source != "ngsl" && w.Source != "nawl") || w.Rank < 1 {
			t.Fatalf("bad word %+v", w)
		}
	}
	if bands[4.0] != 500 || bands[8.0] == 0 {
		t.Errorf("bands = %v", bands)
	}
}

func TestLemma(t *testing.T) {
	for form, want := range map[string]string{"photographed": "photograph", "Purposes": "purpose", "atmosphere": "atmosphere"} {
		if got, ok := Lemma(form); !ok || got != want {
			t.Errorf("Lemma(%q) = %q, %v", form, got, ok)
		}
	}
	if _, ok := Lemma("jarosz"); ok {
		t.Error("jarosz is not a list word")
	}
}

func TestIsWord(t *testing.T) {
	for _, w := range []string{"photographer", "photographed", "atmosphere", "acoustic", "hectic", "unposed", "Depends"} {
		if !IsWord(w) {
			t.Errorf("%q should be a word", w)
		}
	}
	for _, w := range []string{"sweatered", "jarosz", "ansoff", "advanceing", "graford"} {
		if IsWord(w) {
			t.Errorf("%q should not be a word", w)
		}
	}
}
