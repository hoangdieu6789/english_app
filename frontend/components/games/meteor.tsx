"use client";

import { useEffect, useReducer, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { choices, points, shuffle, type Answer, type GameCard } from "@/lib/games/core";
import type { GameDeck } from "@/lib/games-api";
import { useGame, useGameLoop, useQuit, useReportEnd } from "./game-frame";
import { useFx, useFxEvents } from "./fx";
import { Castle, Wizard } from "./scenery";

// Fireball: a fireball carrying a meaning falls on the castle; cast the right English word
// (tap or keys 1-4) and the wizard's spell blasts it in the sky. Each hit makes the next
// fireball a little faster. 3 hearts: a wrong spell or a fireball that lands costs one.
// Reduced motion: the fireball stays up and a bar shows the time. All timing happens in the
// reducer (tick), so pausing stops everything; `ev` tells the effects layer what happened.

const HEARTS = 3;
const FIRST_FALL_MS = 9_000;
const MIN_FALL_MS = 3_500;
const SPEED_UP = 0.95;
const RIGHT_WAIT_MS = 650;
const SHOW_ANSWER_MS = 1_300;

type Round = { n: number; card: GameCard; options: GameCard[]; t: number; fall: number; picked?: string | null };
type Ev = { n: number; type: "hit" | "wrong" | "landed"; picked: string | null; points: number; combo: number };
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
  ev: Ev | null;
};
type A = { type: "tick"; dt: number } | { type: "pick"; id: string | null } | { type: "quit" };

const init = (): S => ({ queue: [], round: null, fall: FIRST_FALL_MS, wait: 0, hearts: HEARTS, score: 0, combo: 0, answers: [], missed: [], over: false, ev: null });

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
  const evN = (s.ev?.n ?? 0) + 1;
  if (right) {
    const pts = points(s.combo);
    return { ...n, score: s.score + pts, combo: s.combo + 1, fall: Math.max(MIN_FALL_MS, s.fall * SPEED_UP), wait: RIGHT_WAIT_MS, ev: { n: evN, type: "hit", picked, points: pts, combo: s.combo + 1 } };
  }
  const missed = s.missed.some((c) => c.id === r.card.id) ? s.missed : [...s.missed, r.card];
  return { ...n, missed, combo: 0, hearts: s.hearts - 1, wait: SHOW_ANSWER_MS, ev: { n: evN, type: picked ? "wrong" : "landed", picked, points: 0, combo: 0 } };
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
  const fx = useFx();
  const [s, dispatch] = useReducer((st: S, a: A) => reduce(st, a, deck), undefined, init);
  const round = s.round;
  const resolved = round?.picked !== undefined;
  const ball = useRef<HTMLDivElement>(null);
  const wand = useRef<HTMLSpanElement>(null);
  const ground = useRef<HTMLDivElement>(null);

  useGameLoop((dt) => dispatch({ type: "tick", dt }), !paused && !s.over);
  useQuit(() => dispatch({ type: "quit" }));
  useReportEnd(s.over, { score: s.score, answers: s.answers, missed: s.missed });
  useFxEvents(s.ev, (ev) => {
    if (round) say(round.card.word);
    const btn = ev.picked ? document.querySelector(`[data-option="${ev.picked}"]`) : null;
    if (ev.type === "hit") {
      fx.sound("zap");
      fx.beam(wand.current, ball.current, "spell");
      fx.burst(ball.current, "fire", 40);
      fx.burst(ball.current, "gold", 24);
      fx.float(ball.current, `+${ev.points}`, "gold");
      if (ev.combo > 1 && ev.combo % 5 === 0) {
        fx.flash("gold");
        fx.sound("combo", ev.combo);
      } else fx.sound("right");
    } else if (ev.type === "wrong") {
      fx.sound("wrong");
      fx.burst(btn, "smoke", 14);
      fx.shake(0.6);
    } else {
      fx.sound("boom");
      fx.burst(ground.current, "fire", 50);
      fx.burst(ground.current, "smoke", 18);
      fx.shake(1.4);
      fx.flash("bad");
    }
  });
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
  const state = resolved ? (round.picked === round.card.id ? "hit" : round.picked ? "miss" : "landed") : "fall";
  return (
    <div className="game-meteor">
      <div className="game-sky game-night" aria-live="polite">
        <span className="game-moon" aria-hidden />
        <div key={round.n} ref={ball} className="game-fireball" data-state={state} style={{ top: reduced ? "10%" : `calc(${p} * (100% - 170px) + 8px)` }}>
          <span className="game-fireball-core" aria-hidden />
          <span className="game-fireball-tag">{round.card.meaning}</span>
        </div>
        <div ref={ground} className="game-castle-row" aria-hidden>
          <Castle />
          <Wizard wandRef={wand} casting={state === "hit"} />
          <Castle flip />
        </div>
      </div>
      <div className="ds-keep-cols game-options" role="group" aria-label={t("games.meteor.options")}>
        {round.options.map((o, i) => {
          const mark = resolved ? (o.id === round.card.id ? "right" : o.id === round.picked ? "wrong" : undefined) : undefined;
          return (
            <button key={`${round.n}:${o.id}`} type="button" className="game-option game-spell" data-option={o.id} data-mark={mark} disabled={resolved} onClick={() => !paused && dispatch({ type: "pick", id: o.id })}>
              <kbd>{i + 1}</kbd> {o.word}
            </button>
          );
        })}
      </div>
    </div>
  );
}
