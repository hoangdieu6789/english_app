"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { choices, points, shuffle, type Answer, type GameCard } from "@/lib/games/core";
import type { GameDeck } from "@/lib/games-api";
import { useGame, useGameLoop, useQuit, useReportEnd } from "./game-frame";
import { useFx, useFxEvents } from "./fx";
import type { BroomScene, SceneColors } from "./broom-scene";

// Broom Flight (3D): the meaning is shown at the top; three rings with English words fly at
// the wizard's broom at three heights. Fly through the ring with the right word. Keys ↑ ↓ / W S
// / 1-3, the mouse (move up and down over the scene), a swipe, or the lane buttons. 3 hearts;
// every right ring makes the next set come faster. The rules live in this reducer (tick from
// the shared game loop, so pausing is exact); broom-scene.ts only draws the state.

const HEARTS = 3;
const LANES = 3;
const FIRST_MS = 7_000;
const MIN_MS = 3_200;
const SPEED_UP = 0.94;
const RIGHT_WAIT_MS = 700;
const WRONG_WAIT_MS = 1_400;

type Round = { n: number; card: GameCard; words: GameCard[]; t: number; dur: number; result?: "right" | "wrong"; resultLane?: number };
type Ev = { n: number; type: "right" | "wrong"; points: number; combo: number };
type S = {
  queue: GameCard[];
  round: Round | null;
  lane: number;
  dur: number;
  wait: number;
  hearts: number;
  score: number;
  combo: number;
  answers: Answer[];
  missed: GameCard[];
  over: boolean;
  ev: Ev | null;
};
type A = { type: "tick"; dt: number } | { type: "lane"; lane: number } | { type: "move"; by: number } | { type: "quit" };

const init = (): S => ({ queue: [], round: null, lane: 1, dur: FIRST_MS, wait: 0, hearts: HEARTS, score: 0, combo: 0, answers: [], missed: [], over: false, ev: null });

function nextRound(s: S, deck: GameDeck): S {
  let queue = s.queue;
  if (!queue.length) {
    const miss = new Set(s.missed.map((c) => c.id));
    queue = [...shuffle(deck.cards.filter((c) => miss.has(c.id))), ...shuffle(deck.cards.filter((c) => !miss.has(c.id)))];
  }
  const [card, ...rest] = queue;
  const words = shuffle(choices(card, [...deck.cards, ...deck.distractors], LANES, "word"));
  return { ...s, queue: rest, wait: 0, round: { n: (s.round?.n ?? 0) + 1, card, words, t: 0, dur: s.dur } };
}

function pass(s: S): S {
  const r = s.round!;
  const lane = Math.min(s.lane, r.words.length - 1);
  const right = r.words[lane].id === r.card.id;
  const evN = (s.ev?.n ?? 0) + 1;
  const base: S = { ...s, round: { ...r, t: r.dur, result: right ? "right" : "wrong", resultLane: lane }, answers: [...s.answers, { wordId: r.card.id, correct: right }] };
  if (right) {
    const pts = points(s.combo);
    return { ...base, score: s.score + pts, combo: s.combo + 1, dur: Math.max(MIN_MS, s.dur * SPEED_UP), wait: RIGHT_WAIT_MS, ev: { n: evN, type: "right", points: pts, combo: s.combo + 1 } };
  }
  const missed = s.missed.some((c) => c.id === r.card.id) ? s.missed : [...s.missed, r.card];
  return { ...base, missed, combo: 0, hearts: s.hearts - 1, wait: WRONG_WAIT_MS, ev: { n: evN, type: "wrong", points: 0, combo: 0 } };
}

function reduce(s: S, a: A, deck: GameDeck): S {
  if (s.over) return s;
  if (a.type === "quit") return { ...s, over: true };
  if (a.type === "lane") return { ...s, lane: Math.max(0, Math.min(LANES - 1, a.lane)) };
  if (a.type === "move") return { ...s, lane: Math.max(0, Math.min(LANES - 1, s.lane + a.by)) };
  if (!s.round) return nextRound(s, deck);
  if (!s.round.result) {
    const t = s.round.t + a.dt;
    return t >= s.round.dur ? pass(s) : { ...s, round: { ...s.round, t } };
  }
  const wait = s.wait - a.dt;
  if (wait > 0) return { ...s, wait };
  return s.hearts <= 0 ? { ...s, over: true } : nextRound(s, deck);
}

function sceneColors(el: Element): SceneColors {
  const cs = getComputedStyle(el);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    night1: v("--ds-game-night-1"),
    night2: v("--ds-game-night-2"),
    night3: v("--ds-game-night-3"),
    star: v("--ds-game-star"),
    moon: v("--ds-game-moon"),
    castle: v("--ds-game-castle"),
    window: v("--ds-game-window"),
    parchment: v("--ds-game-parchment"),
    parchmentEdge: v("--ds-game-parchment-edge"),
    ink: v("--ds-game-ink"),
    gold: v("--ds-game-gold"),
    spell: v("--ds-game-spell"),
    good: v("--ds-game-good"),
    bad: v("--ds-game-bad"),
    fire: v("--ds-game-fire"),
    ember: v("--ds-game-ember"),
    displayFont: getComputedStyle(document.body).getPropertyValue("--font-display").trim() || "sans-serif",
  };
}

export function BroomFlight({ deck }: { deck: GameDeck }) {
  const { t } = useI18n();
  const { paused, reduced, setHud, say } = useGame();
  const fx = useFx();
  const [s, dispatch] = useReducer((st: S, a: A) => reduce(st, a, deck), undefined, init);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<BroomScene | null>(null);
  const [noGl, setNoGl] = useState(false);
  const swipe = useRef<number | null>(null);
  const round = s.round;

  // Load three.js and build the scene once (only this page downloads it).
  useEffect(() => {
    let gone = false;
    let ro: ResizeObserver | undefined;
    void import("./broom-scene").then(({ BroomScene, webglAvailable }) => {
      if (gone || !canvas.current || !box.current) return;
      if (!webglAvailable()) {
        setNoGl(true);
        return;
      }
      const sc = new BroomScene(canvas.current, sceneColors(box.current), { round: 0, words: [], gate: 0, lane: 1, result: "", resultLane: 1, speed: 1, paused: false, reduced: false });
      scene.current = sc;
      ro = new ResizeObserver(([e]) => sc.resize(Math.max(1, e.contentRect.width), Math.max(1, e.contentRect.height)));
      ro.observe(box.current);
      sc.start();
    });
    return () => {
      gone = true;
      ro?.disconnect();
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  // Hand the current state to the scene.
  useEffect(() => {
    scene.current?.setInput({
      round: round?.n ?? 0,
      words: round?.words.map((w) => w.word) ?? [],
      gate: round ? round.t / round.dur : 0,
      lane: s.lane,
      result: round?.result ?? "",
      resultLane: round?.resultLane ?? 1,
      speed: FIRST_MS / s.dur,
      paused,
      reduced,
    });
  });

  useGameLoop((dt) => dispatch({ type: "tick", dt }), !paused && !s.over && !noGl);
  useQuit(() => dispatch({ type: "quit" }));
  useReportEnd(s.over, { score: s.score, answers: s.answers, missed: s.missed });
  useFxEvents(s.ev, (ev) => {
    if (round) say(round.card.word);
    const lane = box.current?.querySelector(`[data-lane="${round?.resultLane ?? 1}"]`);
    if (ev.type === "right") {
      fx.float(lane, `+${ev.points}`, "gold");
      if (ev.combo > 1 && ev.combo % 5 === 0) {
        fx.flash("gold");
        fx.sound("combo", ev.combo);
      } else fx.sound("right");
    } else {
      fx.sound("wrong");
      fx.flash("bad");
    }
  });
  useEffect(() => {
    setHud({
      score: s.score,
      combo: s.combo,
      hearts: s.hearts,
      maxHearts: HEARTS,
      ...(round && reduced ? { timeLeft: round.dur - round.t, timeMax: round.dur } : {}),
    });
  }, [s.score, s.combo, s.hearts, round, reduced, setHud]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused) return;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") dispatch({ type: "move", by: -1 });
      else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") dispatch({ type: "move", by: 1 });
      else if (["1", "2", "3"].includes(e.key)) dispatch({ type: "lane", lane: Number(e.key) - 1 });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused]);

  // Mouse: the height of the pointer over the scene picks the lane. Touch: swipe up or down.
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || paused || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    dispatch({ type: "lane", lane: y < 0.4 ? 0 : y < 0.6 ? 1 : 2 });
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") swipe.current = e.clientY;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (swipe.current == null || paused) return;
    const d = e.clientY - swipe.current;
    swipe.current = null;
    if (Math.abs(d) > 24) dispatch({ type: "move", by: d < 0 ? -1 : 1 });
  };

  return (
    <div className="game-broom">
      <div className="game-prompt game-scroll" aria-live="polite">
        {round?.card.meaning ?? "\u00a0"}
      </div>
      <div ref={box} className="game-broom-view game-night" onPointerMove={onPointerMove} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <canvas ref={canvas} className="game-broom-canvas" aria-hidden />
        {noGl && <p className="game-broom-nogl">{t("games.broom.noWebgl")}</p>}
        <div className="game-broom-lanes" role="group" aria-label={t("games.broom.lanes")}>
          {Array.from({ length: LANES }, (_, i) => {
            const w = round?.words[i]?.word ?? "";
            const mark = round?.result && round.resultLane === i ? round.result : undefined;
            return (
              <button
                key={i}
                type="button"
                className="game-broom-lane"
                data-lane={i}
                data-mark={mark}
                aria-pressed={s.lane === i}
                aria-label={t("games.broom.lane", { word: w })}
                onClick={() => !paused && dispatch({ type: "lane", lane: i })}
              >
                <kbd>{i + 1}</kbd>
                <span>{w}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
