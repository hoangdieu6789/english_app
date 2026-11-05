"use client";

import { useEffect, useReducer, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { choices, points, shuffle, type Answer, type GameCard } from "@/lib/games/core";
import type { GameDeck } from "@/lib/games-api";
import { useGame, useGameLoop, useQuit, useReportEnd } from "./game-frame";

// Bubble Pop: the meaning is shown at the top; English words float up as bubbles. Pop the
// bubble with the word for the meaning before it floats away. 3 hearts: a wrong bubble or a
// right one that escapes costs one. Reduced motion: the bubbles stay in a row and a bar shows
// the time of the round. All timing happens in the reducer (tick), so pausing stops everything.

const HEARTS = 3;
const BUBBLES = 5;
const NARROW_BUBBLES = 4; // phones: fewer lanes so the bubbles do not overlap
const NARROW_PX = 520;
const STAGGER = 0.15; // start delays (part of the rise time) between bubbles
const MAX_RIGHT_DELAY = 0.3; // the right bubble is never among the last to start
const FIRST_RISE_MS = 8_000;
const MIN_RISE_MS = 4_000;
const SPEED_UP = 0.96;
const RIGHT_WAIT_MS = 400;
const SHOW_ANSWER_MS = 1_100;

type Bubble = { card: GameCard; lane: number; delay: number; popped?: "right" | "wrong" };
type Round = { n: number; card: GameCard; bubbles: Bubble[]; t: number; rise: number; over?: boolean };
type S = {
  queue: GameCard[];
  round: Round | null;
  rise: number;
  wait: number;
  hearts: number;
  score: number;
  combo: number;
  answers: Answer[];
  missed: GameCard[];
  over: boolean;
};
type A = { type: "tick"; dt: number; narrow: boolean } | { type: "pop"; id: string } | { type: "quit" };

const init = (): S => ({ queue: [], round: null, rise: FIRST_RISE_MS, wait: 0, hearts: HEARTS, score: 0, combo: 0, answers: [], missed: [], over: false });

/** 0 at the bottom, 1 gone at the top. */
const progress = (r: Round, b: Bubble) => Math.max(0, (r.t - b.delay * r.rise) / r.rise);
const rightBubble = (r: Round) => r.bubbles.find((b) => b.card.id === r.card.id)!;
const roundMs = (r: Round) => r.rise * (1 + rightBubble(r).delay);

function nextRound(s: S, deck: GameDeck, narrow: boolean): S {
  let queue = s.queue;
  if (!queue.length) {
    const miss = new Set(s.missed.map((c) => c.id));
    queue = [...shuffle(deck.cards.filter((c) => miss.has(c.id))), ...shuffle(deck.cards.filter((c) => !miss.has(c.id)))];
  }
  const [card, ...rest] = queue;
  const words = choices(card, [...deck.cards, ...deck.distractors], narrow ? NARROW_BUBBLES : BUBBLES, "word");
  const lanes = shuffle(words.map((_, i) => i));
  // Different start times keep the bubbles apart; the right one is on screen long enough.
  const delays = shuffle(words.map((_, i) => i * STAGGER));
  const bubbles = words.map((c, i) => ({ card: c, lane: lanes[i], delay: c.id === card.id ? Math.min(delays[i], MAX_RIGHT_DELAY) : delays[i] }));
  return { ...s, queue: rest, wait: 0, round: { n: (s.round?.n ?? 0) + 1, card, bubbles, t: 0, rise: s.rise } };
}

function lose(s: S, poppedId?: string): S {
  const r = s.round!;
  const missed = s.missed.some((c) => c.id === r.card.id) ? s.missed : [...s.missed, r.card];
  const bubbles = r.bubbles.map((b) => (b.card.id === poppedId ? { ...b, popped: "wrong" as const } : b));
  return { ...s, round: { ...r, over: true, bubbles }, answers: [...s.answers, { wordId: r.card.id, correct: false }], missed, combo: 0, hearts: s.hearts - 1, wait: SHOW_ANSWER_MS };
}

function reduce(s: S, a: A, deck: GameDeck): S {
  if (s.over) return s;
  if (a.type === "quit") return { ...s, over: true };
  const r = s.round;
  if (a.type === "pop") {
    if (!r || r.over) return s;
    if (a.id !== r.card.id) return lose(s, a.id);
    const bubbles = r.bubbles.map((b) => (b.card.id === a.id ? { ...b, popped: "right" as const } : b));
    return {
      ...s,
      round: { ...r, over: true, bubbles },
      answers: [...s.answers, { wordId: r.card.id, correct: true }],
      score: s.score + points(s.combo),
      combo: s.combo + 1,
      rise: Math.max(MIN_RISE_MS, s.rise * SPEED_UP),
      wait: RIGHT_WAIT_MS,
    };
  }
  if (!r) return nextRound(s, deck, a.narrow);
  if (!r.over) {
    const n = { ...r, t: r.t + a.dt };
    return progress(n, rightBubble(n)) >= 1 ? lose({ ...s, round: n }) : { ...s, round: n };
  }
  const wait = s.wait - a.dt;
  if (wait > 0) return { ...s, wait };
  return s.hearts <= 0 ? { ...s, over: true } : nextRound(s, deck, a.narrow);
}

export function BubblePop({ deck }: { deck: GameDeck }) {
  const { t } = useI18n();
  const { paused, reduced, setHud, say } = useGame();
  const field = useRef<HTMLDivElement>(null);
  const [s, dispatch] = useReducer((st: S, a: A) => reduce(st, a, deck), undefined, init);
  const round = s.round;

  useGameLoop((dt) => dispatch({ type: "tick", dt, narrow: (field.current?.clientWidth ?? 600) < NARROW_PX }), !paused && !s.over);
  useQuit(() => dispatch({ type: "quit" }));
  useReportEnd(s.over, { score: s.score, answers: s.answers, missed: s.missed });
  // Read the word aloud once its round is answered (or the bubble escaped).
  useEffect(() => {
    if (round?.over) say(round.card.word);
  }, [round?.card.id, round?.over]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setHud({
      score: s.score,
      combo: s.combo,
      hearts: s.hearts,
      maxHearts: HEARTS,
      ...(round && reduced ? { timeLeft: roundMs(round) - round.t, timeMax: roundMs(round) } : {}),
    });
  }, [s.score, s.combo, s.hearts, round, reduced, setHud]);

  return (
    <div className="game-bubbles">
      <div className="game-prompt" aria-live="polite">
        {round?.card.meaning ?? "\u00a0"}
      </div>
      <div
        ref={field}
        className="game-water"
        data-reduced={reduced || undefined}
        role="group"
        aria-label={t("games.bubble.field")}
        style={{ "--lane": `${100 / (round?.bubbles.length || BUBBLES)}%` } as React.CSSProperties}
      >
        {round?.bubbles.map((b) => {
          const p = progress(round, b);
          const answer = round.over && b.card.id === round.card.id;
          if (!reduced && p >= 1 && !answer) return null;
          const style: React.CSSProperties = reduced
            ? {}
            : { left: `${((b.lane + 0.5) / round.bubbles.length) * 100}%`, bottom: `calc(${Math.min(p, 1)} * (100% - var(--bubble-h)))` };
          return (
            <button
              key={`${round.n}:${b.card.id}`}
              type="button"
              className="game-bubble"
              style={style}
              data-popped={b.popped}
              data-answer={(answer && !b.popped) || undefined}
              disabled={round.over}
              onClick={() => !paused && dispatch({ type: "pop", id: b.card.id })}
            >
              {b.card.word}
            </button>
          );
        })}
      </div>
    </div>
  );
}
