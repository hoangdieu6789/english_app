"use client";

import { useEffect, useReducer, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { choices, points, shuffle, type Answer, type GameCard } from "@/lib/games/core";
import type { GameDeck } from "@/lib/games-api";
import { useGame, useGameLoop, useQuit, useReportEnd } from "./game-frame";
import { useFx, useFxEvents } from "./fx";
import { LanternShape } from "./scenery";

// Lantern Catch: the meaning is shown on a scroll at the top; paper lanterns with English
// words float up over the night lake. Catch the lantern with the word for the meaning before
// it drifts away. 3 hearts: a wrong lantern, or the right one escaping, costs one. Reduced
// motion: the lanterns stay in a row and a bar shows the time of the round. All timing
// happens in the reducer (tick), so pausing stops everything.

const HEARTS = 3;
const BUBBLES = 5;
const NARROW_BUBBLES = 4; // phones: fewer lanes so the lanterns do not overlap
const NARROW_PX = 520;
const STAGGER = 0.15; // start delays (part of the rise time) between lanterns
const MAX_RIGHT_DELAY = 0.3; // the right lantern is never among the last to start
const FIRST_RISE_MS = 8_000;
const MIN_RISE_MS = 4_000;
const SPEED_UP = 0.96;
const RIGHT_WAIT_MS = 550;
const SHOW_ANSWER_MS = 1_200;

type Bubble = { card: GameCard; lane: number; delay: number; sway: number; popped?: "right" | "wrong" };
type Round = { n: number; card: GameCard; bubbles: Bubble[]; t: number; rise: number; over?: boolean };
type Ev = { n: number; type: "caught" | "wrong" | "escaped"; id: string; points: number; combo: number };
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
  ev: Ev | null;
};
type A = { type: "tick"; dt: number; narrow: boolean } | { type: "pop"; id: string } | { type: "quit" };

const init = (): S => ({ queue: [], round: null, rise: FIRST_RISE_MS, wait: 0, hearts: HEARTS, score: 0, combo: 0, answers: [], missed: [], over: false, ev: null });

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
  // Different start times keep the lanterns apart; the right one is on screen long enough.
  const delays = shuffle(words.map((_, i) => i * STAGGER));
  const bubbles = words.map((c, i) => ({
    card: c,
    lane: lanes[i],
    delay: c.id === card.id ? Math.min(delays[i], MAX_RIGHT_DELAY) : delays[i],
    sway: Math.random() * Math.PI * 2,
  }));
  return { ...s, queue: rest, wait: 0, round: { n: (s.round?.n ?? 0) + 1, card, bubbles, t: 0, rise: s.rise } };
}

function lose(s: S, poppedId?: string): S {
  const r = s.round!;
  const missed = s.missed.some((c) => c.id === r.card.id) ? s.missed : [...s.missed, r.card];
  const bubbles = r.bubbles.map((b) => (b.card.id === poppedId ? { ...b, popped: "wrong" as const } : b));
  const ev: Ev = { n: (s.ev?.n ?? 0) + 1, type: poppedId ? "wrong" : "escaped", id: poppedId ?? r.card.id, points: 0, combo: 0 };
  return { ...s, round: { ...r, over: true, bubbles }, answers: [...s.answers, { wordId: r.card.id, correct: false }], missed, combo: 0, hearts: s.hearts - 1, wait: SHOW_ANSWER_MS, ev };
}

function reduce(s: S, a: A, deck: GameDeck): S {
  if (s.over) return s;
  if (a.type === "quit") return { ...s, over: true };
  const r = s.round;
  if (a.type === "pop") {
    if (!r || r.over) return s;
    if (a.id !== r.card.id) return lose(s, a.id);
    const bubbles = r.bubbles.map((b) => (b.card.id === a.id ? { ...b, popped: "right" as const } : b));
    const pts = points(s.combo);
    return {
      ...s,
      round: { ...r, over: true, bubbles },
      answers: [...s.answers, { wordId: r.card.id, correct: true }],
      score: s.score + pts,
      combo: s.combo + 1,
      rise: Math.max(MIN_RISE_MS, s.rise * SPEED_UP),
      wait: RIGHT_WAIT_MS,
      ev: { n: (s.ev?.n ?? 0) + 1, type: "caught", id: a.id, points: pts, combo: s.combo + 1 },
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
  const fx = useFx();
  const field = useRef<HTMLDivElement>(null);
  const prompt = useRef<HTMLDivElement>(null);
  const [s, dispatch] = useReducer((st: S, a: A) => reduce(st, a, deck), undefined, init);
  const round = s.round;

  useGameLoop((dt) => dispatch({ type: "tick", dt, narrow: (field.current?.clientWidth ?? 600) < NARROW_PX }), !paused && !s.over);
  useQuit(() => dispatch({ type: "quit" }));
  useReportEnd(s.over, { score: s.score, answers: s.answers, missed: s.missed });
  useFxEvents(s.ev, (ev) => {
    if (round) say(round.card.word);
    const el = field.current?.querySelector(`[data-lantern="${ev.id}"]`);
    if (ev.type === "caught") {
      fx.sound("pop");
      fx.burst(el, "gold", 36);
      fx.burst(el, "spell", 12);
      fx.float(el, `+${ev.points}`, "gold");
      fx.beam(prompt.current, el, "gold");
      if (ev.combo > 1 && ev.combo % 5 === 0) {
        fx.flash("gold");
        fx.sound("combo", ev.combo);
      } else fx.sound("right");
    } else if (ev.type === "wrong") {
      fx.sound("wrong");
      fx.burst(el, "smoke", 16);
      fx.burst(el, "bad", 10);
      fx.shake(0.7);
    } else {
      fx.sound("wrong");
      fx.burst(el, "smoke", 12);
      fx.shake(0.5);
    }
  });
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
      <div ref={prompt} className="game-prompt game-scroll" aria-live="polite">
        {round?.card.meaning ?? "\u00a0"}
      </div>
      <div
        ref={field}
        className="game-water game-night game-lake"
        data-reduced={reduced || undefined}
        role="group"
        aria-label={t("games.bubble.field")}
        style={{ "--lane": `${100 / (round?.bubbles.length || BUBBLES)}%` } as React.CSSProperties}
      >
        <span className="game-moon" aria-hidden />
        {round?.bubbles.map((b) => {
          const p = progress(round, b);
          const answer = round.over && b.card.id === round.card.id;
          if (!reduced && p >= 1 && !answer) return null;
          const sway = Math.sin(b.sway + round.t / 600) * 10;
          const style: React.CSSProperties = reduced
            ? {}
            : {
                left: `calc(${((b.lane + 0.5) / round.bubbles.length) * 100}% + ${sway.toFixed(1)}px)`,
                bottom: `calc(${Math.min(p, 1)} * (100% - var(--bubble-h)))`,
                rotate: `${(sway / 3).toFixed(1)}deg`,
              };
          return (
            <button
              key={`${round.n}:${b.card.id}`}
              type="button"
              className="game-bubble game-lantern"
              style={style}
              data-lantern={b.card.id}
              data-popped={b.popped}
              data-answer={(answer && !b.popped) || undefined}
              disabled={round.over}
              onClick={() => !paused && dispatch({ type: "pop", id: b.card.id })}
            >
              <LanternShape />
              <span className="game-lantern-word">{b.card.word}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
