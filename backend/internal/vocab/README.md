# Vocabulary data

Word lists for the Review page: new words by band, and a dictionary check for pronunciation
review words.

## Files

- `data/vocab_words.csv`: `word,source,rank,band,forms`. 3,766 headwords from
  - the **New General Service List 1.2** (NGSL, 2,809 general English words) and
  - the **New Academic Word List 1.2** (NAWL, 957 academic words),
  with each word's frequency rank and its inflected forms (`|`-separated).
- `data/dictionary_en_us.txt`: lower-case English words (SCOWL, via the Debian `wamerican`
  package) plus the headwords above. Used to drop words that Azure misrecognised
  ("sweatered", "jarosz") from pronunciation review.

## Band estimate

`band` is the app's own estimate from frequency rank, **not** an official IELTS or CEFR
mapping:

| List | Rank | Band |
| --- | --- | --- |
| NGSL | 1–500 | 4.0 |
| NGSL | 501–1000 | 4.5 |
| NGSL | 1001–1500 | 5.0 |
| NGSL | 1501–2000 | 5.5 |
| NGSL | 2001–2500 | 6.0 |
| NGSL | 2501–2809 | 6.5 |
| NAWL | 1–320 | 7.0 |
| NAWL | 321–640 | 7.5 |
| NAWL | 641–957 | 8.0 |

A learner gets new words with a band above (current band − 0.5) and up to the target band,
most frequent first.

## Rebuild

Download into one folder, then run the script:

```
curl -LO https://www.newgeneralservicelist.com/s/NGSL_12_stats.csv
curl -LO https://www.newgeneralservicelist.com/s/NGSL_12_lemmatized_for_research.csv
curl -LO https://www.newgeneralservicelist.com/s/NAWL_12_stats.csv
curl -LO https://www.newgeneralservicelist.com/s/NAWL_12_lemmatized_for_research.csv
docker run --rm -v "$PWD":/out debian:stable-slim sh -c \
  'apt-get update -qq && apt-get install -y -qq wamerican && cp /usr/share/dict/american-english /out/'
python3 tools/vocab/build_vocab_data.py <that folder> backend/internal/vocab/data
```

Meanings, IPA and example sentences are not in these files: the LLM writes them once per
word and they are stored in the `vocab_words` table, shared by all learners.

## Licences

- `data/vocab_words.csv` is derived from the NGSL 1.2 and NAWL 1.2 by Browne, C., Culligan,
  B., and Phillips, J. (https://www.newgeneralservicelist.com), licensed under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). This file (and the word
  meanings/examples stored from it) is shared under the same licence. Changes: band column
  added, lists merged.
- `data/dictionary_en_us.txt` is derived from SCOWL (Copyright 2000-2011 Kevin Atkinson and
  others; see `data/SCOWL-COPYRIGHT`), which allows use, copying, modification and
  distribution with the copyright notice kept.
