// Package vocab holds the word lists used by the Review page: NGSL/NAWL headwords with a
// band estimate (new words by band) and an English dictionary (to drop misrecognised words
// from pronunciation review). See README.md for sources and licences.
package vocab

import (
	"bufio"
	"bytes"
	_ "embed"
	"encoding/csv"
	"fmt"
	"strconv"
	"strings"
	"sync"
)

//go:embed data/vocab_words.csv
var wordsCSV []byte

//go:embed data/dictionary_en_us.txt
var dictionaryTxt []byte

// Word is one NGSL/NAWL headword.
type Word struct {
	Word   string
	Source string // ngsl | nawl
	Rank   int    // frequency rank within its list
	Band   float32
	Forms  []string // inflected forms
}

var (
	loadOnce   sync.Once
	words      []Word
	lemmaOf    map[string]string // form or headword -> headword
	dictionary map[string]struct{}
)

func load() {
	r := csv.NewReader(bytes.NewReader(wordsCSV))
	rows, err := r.ReadAll()
	if err != nil {
		panic(fmt.Sprintf("vocab_words.csv: %v", err))
	}
	lemmaOf = map[string]string{}
	for _, row := range rows[1:] {
		rank, err1 := strconv.Atoi(row[2])
		band, err2 := strconv.ParseFloat(row[3], 32)
		if err1 != nil || err2 != nil {
			panic(fmt.Sprintf("vocab_words.csv: bad row %v", row))
		}
		w := Word{Word: row[0], Source: row[1], Rank: rank, Band: float32(band)}
		if row[4] != "" {
			w.Forms = strings.Split(row[4], "|")
		}
		words = append(words, w)
		lemmaOf[w.Word] = w.Word
		for _, f := range w.Forms {
			if _, taken := lemmaOf[f]; !taken {
				lemmaOf[f] = w.Word
			}
		}
	}
	dictionary = map[string]struct{}{}
	sc := bufio.NewScanner(bytes.NewReader(dictionaryTxt))
	for sc.Scan() {
		if w := sc.Text(); w != "" {
			dictionary[w] = struct{}{}
		}
	}
}

// Words returns all headwords (NGSL first, then NAWL, each by rank).
func Words() []Word {
	loadOnce.Do(load)
	return words
}

// Lemma returns the headword of a list word or one of its forms ("photographed" ->
// "photograph").
func Lemma(form string) (string, bool) {
	loadOnce.Do(load)
	l, ok := lemmaOf[strings.ToLower(form)]
	return l, ok
}

// Common prefixes that make real words the dictionary may not list ("unposed").
var prefixes = []string{"un", "re", "non", "over", "under", "pre", "mis"}

// IsWord reports whether w (lower case) is an English word: in the dictionary, or a common
// prefix plus a dictionary word of at least 3 letters.
func IsWord(w string) bool {
	loadOnce.Do(load)
	w = strings.ToLower(w)
	if _, ok := dictionary[w]; ok {
		return true
	}
	// Not lemmaOf: the list's research forms include misspellings ("advanceing"); headwords
	// are already in the dictionary.
	for _, p := range prefixes {
		if rest, ok := strings.CutPrefix(w, p); ok && len(rest) >= 3 {
			if _, ok := dictionary[rest]; ok {
				return true
			}
		}
	}
	return false
}
