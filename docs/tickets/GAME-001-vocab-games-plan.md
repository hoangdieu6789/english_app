# GAME-001 Vocabulary games

Status: phase 1 done (branch `feat/vocab-games`): games 1-4, decks, level, results, word backfill.

## Goal

Short, fun games that make the learner recall words many times. Every game uses the
learner's own words, not fixed decks. The ideas come from Parroto's 11 games and Freerice's
adaptive level. We copy no art, names or content from them.

## Words (decks)

A deck is a list of cards `{id, word, pos, ipa, meaning, example}`. The meaning is in the
learner's language (a simple English definition for English learners).

- **My words**: the learner's review cards. These are vocab cards and words they said wrongly
  that are in the word list.
  - Wrong answers come first.
  - Then the cards due soonest.
  - The deck is filled up with new words from the learner's band range.
- **Band N** (4, 5, 6, 7, 8): NGSL/NAWL words of that band, in rank order.

Meanings come from `vocab_words` + `vocab_translations`.

- A background job writes the meaning and example of every word in vi and en with the
  free/subscription LLM chain. It writes 20 words per call, with a pause between calls.
  `VOCAB_BACKFILL=off` stops it.
- A deck request enriches up to 20 missing words at once, so a deck works before the job ends.

Wrong choices (distractors) come from other cards of the same band. Same part of speech is
preferred, and a wrong choice never has the same meaning as the answer.

## Results

`POST /api/games/results` saves one row per play in `game_plays`:

- game, deck, score, correct, total, duration, level.

It also updates `game_word_stats` (seen and correct per word).

When a review card is answered wrongly, it becomes due now, so the Review page shows it
again. Right answers do not change the SRS schedule: games are practice, the review is the test.

## Level climb (Freerice style)

- The word list is sorted by (band, rank) and cut into 60 levels.
- Placement: the first 4 questions start at the learner's band level and move 6 levels per
  answer.
- After placement, 3 right answers in a row move up one level, and a wrong answer moves down
  one level.
- A wrong question comes back 3 turns later.
- The level is saved on the user (`users.vocab_level`). It is shown with the band of its
  words, e.g. "Level 31 ≈ band 6".

## Games

| # | Game | Skill | Phase |
|---|------|-------|-------|
| 1 | Word Match | match word ↔ meaning on a board, 45 s, time bonus | 1 |
| 2 | Meteor Quiz | meaning falls, pick 1 of 4 words (keys 1-4) | 1 |
| 3 | Bubble Pop | words rise as bubbles, tap the one for the meaning | 1 |
| 4 | Level Climb | Freerice-style 4-choice quiz with the adaptive level | 1 |
| 5 | Word Rain | meaning falls with blanks, type the word, hints as it falls | 2 |
| 6 | Typing Blaster | words fall, type them to shoot | 2 |
| 7 | Fruit Toss | type the word for the meaning to push the monster back | 2 |
| 8 | Word Guess | Wordle on the meaning, 6 tries | 2 |
| 9 | Spelling Bee | hear the word (browser TTS), type it | 2 |
| 10 | Bridge Builder | put the example sentence back in order | 3 |
| 11 | Sky Runner | 3D lanes (three.js), fly into the lane with the right word | 3 |
| 12 | Vocab Battle | 1v1 real time over WebSocket: random match, private room by code, bot of the same level when nobody is free | 4 |

Shared rules for every game:

- Hearts, score and combo.
- Pause, and Esc to quit.
- The end screen lists the missed words with sound and meaning.
- Keyboard and touch both work.
- `prefers-reduced-motion`: no falling or floating motion; items appear in place and the
  timer works as normal.

## UI

- New nav item "Games" (`/games`). The page shows the vocab level card, then one card per
  game that is built. A game that is not built yet is not shown.
- Every game page has a deck picker (My words / Band 4-8). It remembers the last choice in
  localStorage.
- The design system applies:
  - tokens only, no raw colors;
  - text 14px or larger;
  - tap targets 44px or larger;
  - no horizontal scroll at 375px;
  - light and dark themes;
  - purple only for accents.

## Phases

Each phase is committed and pushed, checked in the browser at 1280/390 in light and dark,
and then shown to the user before the next phase starts.

1. Backend:
   - migration 16;
   - word backfill;
   - deck, level and results API.

   Frontend:
   - games hub and shared game shell;
   - games 1-4.
2. Typing games 5-9.
3. Bridge Builder and Sky Runner (three.js, loaded only on that page).
4. Vocab Battle:
   - WebSocket hub in the Go API;
   - matchmaking by level;
   - rooms by code;
   - a bot that answers at the player's level after a human-like delay;
   - ELO.
