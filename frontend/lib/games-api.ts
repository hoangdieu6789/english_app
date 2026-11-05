import { apiFetch, errorFrom } from "./http";
import { getLang, translate } from "@/lib/i18n";
import type { Answer, DeckId, GameCard } from "@/lib/games/core";

// Vocabulary games (backend: /api/games, docs/tickets/GAME-001-vocab-games-plan.md).

export type GameId = "word-match" | "meteor" | "bubble-pop" | "level-climb";

export type GameDeck = {
  deck: DeckId | "level";
  cards: GameCard[];
  distractors: GameCard[]; // wrong choices for multiple-choice games
  level: number;
  levelBand: number;
};

export type LevelDeck = GameDeck & { placed: boolean; levels: number };

export type GamesSummary = {
  bests: { game: string; best: number; plays: number; lastPlayed: string }[];
  level: number; // 0 = Level Climb not played yet
  levelBand: number;
  levels: number;
  myWords: number;
};

export type GameResult = {
  game: GameId;
  deck: DeckId | "level";
  score: number;
  correct: number;
  total: number;
  durationMs: number;
  level?: number;
  answers: Answer[];
};

export const gamesQuery = {
  queryKey: ["games"],
  queryFn: async (): Promise<GamesSummary> => {
    const res = await apiFetch("/games");
    if (!res.ok) throw await errorFrom(res, translate(getLang(), "games.err.load"));
    return res.json();
  },
};

export async function fetchDeck(deck: DeckId, n = 40): Promise<GameDeck> {
  const res = await apiFetch(`/games/deck?deck=${encodeURIComponent(deck)}&n=${n}`);
  if (!res.ok) throw await errorFrom(res, translate(getLang(), "games.err.deck"));
  return res.json();
}

/** level 0 = the learner's start level (saved, or estimated from their band). */
export async function fetchLevel(level = 0): Promise<LevelDeck> {
  const res = await apiFetch(`/games/level${level ? `?level=${level}` : ""}`);
  if (!res.ok) throw await errorFrom(res, translate(getLang(), "games.err.deck"));
  return res.json();
}

export async function saveResult(r: GameResult): Promise<{ best: number; newBest: boolean; levelBand?: number }> {
  const res = await apiFetch("/games/results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(r),
  });
  if (!res.ok) throw await errorFrom(res, translate(getLang(), "games.err.save"));
  return res.json();
}
