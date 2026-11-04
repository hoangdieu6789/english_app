#!/usr/bin/env python3
"""Builds backend/internal/vocab/data/* from the NGSL/NAWL 1.2 lists and SCOWL (wamerican).

Inputs (download first; see backend/internal/vocab/README.md):
  NGSL_12_stats.csv, NGSL_12_lemmatized_for_research.csv,
  NAWL_12_stats.csv, NAWL_12_lemmatized_for_research.csv  (newgeneralservicelist.com, CC BY-SA 4.0)
  american-english  (Debian package wamerican, SCOWL; see wamerican-copyright)

Usage: python3 tools/vocab/build_vocab_data.py <input dir> backend/internal/vocab/data
"""

import csv
import re
import sys
from pathlib import Path

# Band estimate per word from its frequency rank. This is the app's own heuristic, not an
# official IELTS or CEFR mapping: frequent general words are expected at lower bands, the
# academic list (NAWL) from band 7.
NGSL_BANDS = [(500, 4.0), (1000, 4.5), (1500, 5.0), (2000, 5.5), (2500, 6.0), (10**9, 6.5)]
NAWL_BANDS = [(320, 7.0), (640, 7.5), (10**9, 8.0)]

WORD = re.compile(r"^[a-z][a-z'-]*$")


def band_for(rank, table):
    for limit, band in table:
        if rank <= limit:
            return band
    raise ValueError(rank)


def read_rows(path):
    raw = Path(path).read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:  # NAWL research file is Latin-1
        text = raw.decode("latin-1")
    lines = [l for l in text.splitlines(keepends=True) if not l.startswith("##")]
    return list(csv.reader(lines))


def forms(path):
    out = {}
    for row in read_rows(path):
        row = [c.strip().lower() for c in row if c.strip()]
        if row:
            out[row[0]] = sorted({f for f in row[1:] if WORD.match(f) and f != row[0]})
    return out


def main(src, dst):
    src, dst = Path(src), Path(dst)
    dst.mkdir(parents=True, exist_ok=True)

    words = []
    ngsl_forms = forms(src / "NGSL_12_lemmatized_for_research.csv")
    for row in read_rows(src / "NGSL_12_stats.csv")[1:]:
        lemma, rank = row[0].strip().lower(), int(row[1])
        words.append((lemma, "ngsl", rank, band_for(rank, NGSL_BANDS), ngsl_forms.get(lemma, [])))
    nawl_forms = forms(src / "NAWL_12_lemmatized_for_research.csv")
    for row in read_rows(src / "NAWL_12_stats.csv")[1:]:
        lemma, rank = row[0].strip().lower(), int(row[1])
        words.append((lemma, "nawl", rank, band_for(rank, NAWL_BANDS), nawl_forms.get(lemma, [])))

    seen = set()
    with open(dst / "vocab_words.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["word", "source", "rank", "band", "forms"])
        for lemma, source, rank, band, fs in words:
            if lemma in seen or not WORD.match(lemma):
                continue
            seen.add(lemma)
            w.writerow([lemma, source, rank, band, "|".join(fs)])

    dictionary = set()
    for line in open(src / "american-english", encoding="utf-8", errors="ignore"):
        word = line.strip()
        if word.endswith("'s"):
            word = word[:-2]
        if word and word == word.lower() and WORD.match(word):
            dictionary.add(word)
    dictionary |= seen  # list words are real words (their research forms include misspellings
    # such as "advanceing", so forms are not added)
    (dst / "dictionary_en_us.txt").write_text("\n".join(sorted(dictionary)) + "\n", encoding="utf-8")

    print(f"vocab words: {len(seen)}, dictionary: {len(dictionary)}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
