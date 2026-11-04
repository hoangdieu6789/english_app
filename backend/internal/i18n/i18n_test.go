package i18n

import (
	"fmt"
	"strings"
	"testing"
)

func TestRegistry(t *testing.T) {
	if !Supported("vi") || !Supported(" EN ") || Supported("fr") {
		t.Fatal("supported")
	}
	if Normalize("fr") != Default || Normalize("en") != "en" {
		t.Fatal("normalize")
	}
	if Name("en") != "English" || Name("vi") != "Vietnamese" || !IsEnglish("en") || IsEnglish("vi") {
		t.Fatal("name")
	}
}

// Every language has every backend message, and format verbs match English.
func TestMessagesComplete(t *testing.T) {
	for _, code := range Codes() {
		m, ok := backendMessages[code]
		if !ok {
			t.Fatalf("no messages for %s", code)
		}
		for key, en := range backendMessages["en"] {
			s, ok := m[key]
			if !ok || s == "" {
				t.Errorf("%s: missing %s", code, key)
			}
			if strings.Count(s, "%") != strings.Count(en, "%") {
				t.Errorf("%s: %s has different format verbs", code, key)
			}
		}
	}
	body := fmt.Sprintf(T("vi", MsgResetBody), "a@b.c", "http://x")
	if !strings.Contains(body, "a@b.c") || !strings.Contains(body, "http://x") {
		t.Fatal(body)
	}
	if T("fr", MsgScoringFailed) != T(Default, MsgScoringFailed) {
		t.Fatal("unsupported language falls back to the default")
	}
}
