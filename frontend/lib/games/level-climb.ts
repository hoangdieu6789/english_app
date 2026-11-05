// Level Climb: the Freerice-style adaptive vocab level (no React).
// - 60 levels over the whole word list (backend: GameService).
// - Placement: the first PLACEMENT answers move PLACEMENT_STEP levels up or down.
// - Then 3 right answers in a row move one level up; a wrong answer moves one level down.
// - A word answered wrongly comes back RETRY_AFTER questions later.

import type { GameCard } from "./core";

export const LEVELS = 60;
export const PLACEMENT = 4;
export const PLACEMENT_STEP = 6;
export const STREAK_UP = 3;
export const RETRY_AFTER = 3;

export type ClimbState = {
  level: number;
  placementLeft: number; // 0 = placed
  streak: number; // right answers in a row at this level
  turn: number; // questions answered
  retry: { card: GameCard; level: number; dueTurn: number }[];
  best: number; // highest level reached this session
};

export function startClimb(level: number, placed: boolean): ClimbState {
  const l = clamp(level);
  return { level: l, placementLeft: placed ? 0 : PLACEMENT, streak: 0, turn: 0, retry: [], best: l };
}

function clamp(level: number): number {
  return Math.min(LEVELS, Math.max(1, Math.round(level)));
}

/** The state after answering `card` (asked at state.level). */
export function answer(state: ClimbState, card: GameCard, correct: boolean): ClimbState {
  const turn = state.turn + 1;
  let { level, placementLeft, streak } = state;
  let retry = state.retry.filter((r) => r.card.id !== card.id);
  if (placementLeft > 0) {
    level = clamp(level + (correct ? PLACEMENT_STEP : -PLACEMENT_STEP));
    placementLeft -= 1;
    streak = 0;
  } else if (correct) {
    streak += 1;
    if (streak >= STREAK_UP) {
      level = clamp(level + 1);
      streak = 0;
    }
  } else {
    level = clamp(level - 1);
    streak = 0;
  }
  if (!correct) retry = [...retry, { card, level: state.level, dueTurn: turn + RETRY_AFTER }];
  return { level, placementLeft, streak, turn, retry, best: Math.max(state.best, level) };
}

/** A word answered wrongly that is due again, if any (asked before new words). */
export function dueRetry(state: ClimbState): GameCard | null {
  const r = state.retry.find((x) => x.dueTurn <= state.turn);
  return r ? r.card : null;
}
