// Shared logic of the vocabulary games (no React): choices, scoring, shuffling.
// docs/tickets/GAME-001-vocab-games-plan.md

export type GameCard = {
  id: string;
  word: string;
  band: number;
  pos: string;
  ipa: string;
  meaning: string; // in the learner's language (a simple English definition for English learners)
  exampleEn: string;
  exampleTranslation: string;
  missed: boolean; // answered wrongly in a game since the last review
};

export type Answer = { wordId: string; correct: boolean };

export function shuffle<T>(items: readonly T[], rnd: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * n choices for a question about `answer` (the answer included, shuffled). Wrong choices come
 * from `pool`: the same part of speech first, never the same word or a choice that shows the
 * same text as another one (`show` is what the learner reads on the button).
 */
export function choices(
  answer: GameCard,
  pool: readonly GameCard[],
  n = 4,
  show: "word" | "meaning" = "word",
  rnd: () => number = Math.random,
): GameCard[] {
  const seen = new Set([norm(answer[show]), norm(answer.word), norm(answer.meaning)]);
  const picked: GameCard[] = [];
  const candidates = shuffle(
    pool.filter((c) => c.id !== answer.id),
    rnd,
  ).sort((a, b) => Number(b.pos === answer.pos) - Number(a.pos === answer.pos));
  for (const c of candidates) {
    if (picked.length >= n - 1) break;
    const keys = [norm(c[show]), norm(c.word), norm(c.meaning)];
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    picked.push(c);
  }
  return shuffle([answer, ...picked], rnd);
}

/** Points for a right answer: 10, plus 2 per combo step (up to +20). */
export function points(combo: number, base = 10): number {
  return base + Math.min(combo, 10) * 2;
}

/** Deck choice kept per device. */
export type DeckId = "mine" | "band-4" | "band-5" | "band-6" | "band-7" | "band-8";
export const DECKS: DeckId[] = ["mine", "band-4", "band-5", "band-6", "band-7", "band-8"];
export const DECK_KEY = "speakup.games.deck";
export const SOUND_KEY = "speakup.games.sound";

export function isDeck(v: unknown): v is DeckId {
  return typeof v === "string" && (DECKS as string[]).includes(v);
}

/** The last answer per word wins (a word asked twice counts once, as the learner left it). */
export function lastAnswers(answers: readonly Answer[]): Answer[] {
  const by = new Map<string, Answer>();
  for (const a of answers) {
    // A wrong answer stays wrong: the word goes back to the review even if retried later.
    const prev = by.get(a.wordId);
    by.set(a.wordId, { wordId: a.wordId, correct: a.correct && (prev?.correct ?? true) });
  }
  return [...by.values()];
}
