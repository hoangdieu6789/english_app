// Package i18n is the list of languages the app supports and the few learner-facing
// messages written by the backend. The frontend has its own messages
// (frontend/lib/i18n); both lists must name the same languages.
//
// To add a language: add it to languages below, add its messages to backendMessages, and
// add it to the frontend registry. No database change is needed.
package i18n

import (
	"strings"

	"github.com/labstack/echo/v4"
)

// Language is one UI / feedback language.
type Language struct {
	Code string // BCP 47 primary tag (vi, en, ...)
	Name string // English name, used in LLM prompts
	// English: the language is English, so no translation of English text is needed
	// (vocabulary meanings are simple English definitions, sentence glosses are empty).
	English bool
}

var languages = []Language{
	{Code: "vi", Name: "Vietnamese"},
	{Code: "en", Name: "English", English: true},
}

// Default is the language of new users and of requests without a supported language.
const Default = "vi"

// Header is the request header the frontend sends with the learner's language.
const Header = "X-App-Lang"

func find(code string) (Language, bool) {
	code = strings.ToLower(strings.TrimSpace(code))
	for _, l := range languages {
		if l.Code == code {
			return l, true
		}
	}
	return Language{}, false
}

// Supported reports whether code is a supported language.
func Supported(code string) bool {
	_, ok := find(code)
	return ok
}

// Normalize returns code when supported, else Default.
func Normalize(code string) string {
	if l, ok := find(code); ok {
		return l.Code
	}
	return Default
}

// Get returns the language for code (Default when unsupported).
func Get(code string) Language {
	l, _ := find(Normalize(code))
	return l
}

// Name is the English name of the language (for LLM prompts).
func Name(code string) string { return Get(code).Name }

// IsEnglish reports whether the learner's language is English.
func IsEnglish(code string) bool { return Get(code).English }

// Codes lists the supported language codes.
func Codes() []string {
	out := make([]string, 0, len(languages))
	for _, l := range languages {
		out = append(out, l.Code)
	}
	return out
}

// FromRequest returns the request's language (Header, else Default).
func FromRequest(c echo.Context) string {
	return Normalize(c.Request().Header.Get(Header))
}

// Message keys of backend-written learner-facing text.
const (
	MsgNoSpeech        = "no_speech"
	MsgNoSpeechStatus  = "no_speech_status" // %s: Azure recognition status
	MsgScoringFailed   = "scoring_failed"
	MsgNoWordsLeft     = "no_words_left"
	MsgVocabUnenriched = "vocab_unenriched"
	MsgResetSubject    = "reset_subject"
	MsgResetBody       = "reset_body" // %[1]s: email, %[2]s: link
)

var backendMessages = map[string]map[string]string{
	"vi": {
		MsgNoSpeech:        "Không nhận ra lời nói trong bản ghi. Kiểm tra micro, nói to và rõ hơn rồi thử lại.",
		MsgNoSpeechStatus:  "Không nhận ra lời nói trong bản ghi (Azure: %s). Kiểm tra micro, nói to và rõ hơn rồi thử lại.",
		MsgScoringFailed:   "Chấm điểm thất bại. Thử lại sau ít phút.",
		MsgNoWordsLeft:     "Đã hết từ mới trong khoảng band này. Hãy nâng band mục tiêu.",
		MsgVocabUnenriched: "AI chưa soạn được nghĩa cho từ mới. Thử lại sau ít phút.",
		MsgResetSubject:    "SpeakUp: đặt lại mật khẩu",
		MsgResetBody: "Xin chào,\n\nBạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu SpeakUp cho %[1]s.\n" +
			"Mở link sau trong 30 phút để đặt mật khẩu mới:\n\n%[2]s\n\n" +
			"Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu cũ vẫn dùng được.\n",
	},
	"en": {
		MsgNoSpeech:        "No speech was recognised in the recording. Check the microphone, speak louder and more clearly, then try again.",
		MsgNoSpeechStatus:  "No speech was recognised in the recording (Azure: %s). Check the microphone, speak louder and more clearly, then try again.",
		MsgScoringFailed:   "Scoring failed. Try again in a few minutes.",
		MsgNoWordsLeft:     "There are no new words left in this band range. Raise your target band.",
		MsgVocabUnenriched: "The AI could not write the new words yet. Try again in a few minutes.",
		MsgResetSubject:    "SpeakUp: reset your password",
		MsgResetBody: "Hello,\n\nYou (or someone else) asked to reset the SpeakUp password for %[1]s.\n" +
			"Open this link within 30 minutes to set a new password:\n\n%[2]s\n\n" +
			"If you did not ask for this, ignore this email; your current password still works.\n",
	},
}

// T returns the backend message key in lang (English when missing).
func T(lang, key string) string {
	if m, ok := backendMessages[Normalize(lang)]; ok {
		if s, ok := m[key]; ok {
			return s
		}
	}
	return backendMessages["en"][key]
}
