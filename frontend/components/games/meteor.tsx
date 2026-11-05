"use client";

import { useEffect, useReducer } from "react";
import { useI18n } from "@/lib/i18n";
import { choices, points, shuffle, type Answer, type GameCard } from "@/lib/games/core";
import type { GameDeck } from "@/lib/games-api";
import { useGame, useGameLoop, useQuit, useReportEnd } from "./game-frame";

// Meteor: a meaning falls on a meteor; pick the English word (tap or keys 1-4) before it
// lands. Each right answer makes the next meteor a little faster. 3 hearts: a wrong word or a
// meteor that lands costs one. Reduced motion: the meteor stays up and a bar shows the time.
// All timing happens in the reducer (tick), so pausing stops everything.

const HEARTS = 3;
const FIRST_FALL_MS = 9_000;
const MIN_FALL_MS = 3_500;
const SPEED_UP = 0.95;
const RIGHT_WAIT_MS = 450;
const SHOW_ANSWER_MS = 1_200;

type Round = { n: number; card: GameCard; options: GameCard[]; t: number; fall: number; picked?: string | null };
type S = {
  queue: GameCard[];
  round: Round | null;
  fall: number;
  wait: number; // > 0: the next round after this time
  hearts: number;
  score: number;
  combo: number;
  answers: Answer[];
  missed: GameCard[];
  over: boolean;
};
type A = { type: "tick"; dt: number } | { type: "pick"; id: string | null } | { type: "quit" };

const init = (): S => ({ queue: [], round: null, fall: FIRST_FALL_MS, wait: 0, hearts: HEARTS, score: 0, combo: 0, answers: [], missed: [], over: false });

function nextRound(s: S, deck: GameDeck): S {
  let queue = s.queue;
  if (!queue.length) {
    // Words missed this game come back first, then the rest of the deck.
    const miss = new Set(s.missed.map((c) => c.id));
    queue = [...shuffle(deck.cards.filter((c) => miss.has(c.id))), ...shuffle(deck.cards.filter((c) => !miss.has(c.id)))];
  }
  const [card, ...rest] = queue;
  return { ...s, queue: rest, wait: 0, round: { n: (s.round?.n ?? 0) + 1, card, options: choices(card, [...deck.cards, ...deck.distractors], 4, "word"), t: 0, fall: s.fall } };
}

function resolve(s: S, picked: string | null): S {
  const r = s.round;
  if (!r || r.picked !== undefined) return s;
  const right = picked === r.card.id;
  const n: S = { ...s, round: { ...r, picked }, answers: [...s.answers, { wordId: r.card.id, correct: right }] };
  if (right) return { ...n, score: s.score + points(s.combo), combo: s.combo + 1, fall: Math.max(MIN_FALL_MS, s.fall * SPEED_UP), wait: RIGHT_WAIT_MS };
  const missed = s.missed.some((c) => c.id === r.card.id) ? s.missed : [...s.missed, r.card];
  return { ...n, missed, combo: 0, hearts: s.hearts - 1, wait: SHOW_ANSWER_MS };
}

function reduce(s: S, a: A, deck: GameDeck): S {
  if (s.over) return s;
  if (a.type === "quit") return { ...s, over: true };
  if (a.type === "pick") return resolve(s, a.id);
  if (!s.round) return nextRound(s, deck);
  if (s.round.picked === undefined) {
    const t = s.round.t + a.dt;
    return t >= s.round.fall ? resolve(s, null) : { ...s, round: { ...s.round, t } };
  }
  const wait = s.wait - a.dt;
  if (wait > 0) return { ...s, wait };
  return s.hearts <= 0 ? { ...s, over: true } : nextRound(s, deck);
}

export function Meteor({ deck }: { deck: GameDeck }) {
  const { t } = useI18n();
  const { paused, reduced, setHud, say } = useGame();
  const [s, dispatch] = useReducer((st: S, a: A) => reduce(st, a, deck), undefined, init);
  const round = s.round;
  const resolved = round?.picked !== undefined;

  useGameLoop((dt) => dispatch({ type: "tick", dt }), !paused && !s.over);
  useQuit(() => dispatch({ type: "quit" }));
  useReportEnd(s.over, { score: s.score, answers: s.answers, missed: s.missed });
  // Read the word aloud once its round is answered (or landed).
  useEffect(() => {
    if (round && resolved) say(round.card.word);
  }, [round?.card.id, resolved]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setHud({
      score: s.score,
      combo: s.combo,
      hearts: s.hearts,
      maxHearts: HEARTS,
      ...(round && reduced ? { timeLeft: round.fall - round.t, timeMax: round.fall } : {}),
    });
  }, [s.score, s.combo, s.hearts, round, reduced, setHud]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (round && !resolved && !paused && i >= 0 && i < round.options.length) dispatch({ type: "pick", id: round.options[i].id });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [round, resolved, paused]);

  if (!round) return null;
  const p = Math.min(1, round.t / round.fall);
  const state = resolved ? (round.picked === round.card.id ? "hit" : "miss") : "fall";
  return (
    <div className="game-meteor">
      <div className="game-sky" aria-live="polite">
        <div key={round.n} className="game-meteor-rock" data-state={state} style={{ top: reduced ? "8%" : `calc(${p} * (100% - 96px))` }}>
          <span className="game-meteor-tail" aria-hidden />
          <span>{round.card.meaning}</span>
        </div>
        <div className="game-ground" aria-hidden />
      </div>
      <div className="ds-keep-cols game-options" role="group" aria-label={t("games.meteor.options")}>
        {round.options.map((o, i) => {
          const mark = resolved ? (o.id === round.card.id ? "right" : o.id === round.picked ? "wrong" : undefined) : undefined;
          return (
            <button key={o.id} type="button" className="game-option" data-mark={mark} disabled={resolved} onClick={() => !paused && dispatch({ type: "pick", id: o.id })}>
              <kbd>{i + 1}</kbd> {o.word}
            </button>
          );
        })}
      </div>
    </div>
  );
}
