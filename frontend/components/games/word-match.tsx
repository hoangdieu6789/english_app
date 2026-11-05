"use client";

import { useEffect, useReducer, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { points, shuffle, type Answer, type GameCard } from "@/lib/games/core";
import type { GameDeck } from "@/lib/games-api";
import { useGame, useGameLoop, useQuit, useReportEnd } from "./game-frame";
import { useFx, useFxEvents } from "./fx";

// Spell Match: a spellbook of word runes and meaning runes; tap a word and its meaning to bind
// the spell (a golden beam joins them). 45 s on the clock: a right pair adds time, a wrong one
// takes time and breaks the combo. A cleared board is filled again from the deck. All timing happens in the reducer (tick), so
// pausing stops everything.

const PAIRS = 5;
const START_MS = 45_000;
const MAX_MS = 60_000;
const BONUS_MS = 2_000;
const PENALTY_MS = 3_000;
const WRONG_FLASH_MS = 450;
const NEXT_BOARD_MS = 250;

type Side = "word" | "meaning";
type Tile = { id: string; side: Side };
type Ev = { n: number; type: "pair" | "wrong" | "board"; wordId: string; meaningId: string; points: number; combo: number };

type S = {
  queue: GameCard[];
  words: GameCard[];
  meanings: GameCard[];
  cleared: string[];
  sel: Tile | null;
  wrong: string[]; // tile keys flashing red
  wrongMs: number;
  nextBoardMs: number; // > 0: a new board after this time
  time: number;
  score: number;
  combo: number;
  answers: Answer[];
  slipped: string[]; // cards with a wrong try on this board
  missed: GameCard[];
  started: boolean;
  over: boolean;
  ev: Ev | null;
};

type A = { type: "tick"; dt: number } | { type: "pick"; tile: Tile } | { type: "quit" };

const init = (): S => ({
  queue: [], words: [], meanings: [], cleared: [], sel: null, wrong: [], wrongMs: 0, nextBoardMs: 0,
  time: START_MS, score: 0, combo: 0, answers: [], slipped: [], missed: [], started: false, over: false, ev: null,
});

function newBoard(s: S, deck: GameCard[]): S {
  let queue = s.queue;
  const cards: GameCard[] = [];
  while (cards.length < Math.min(PAIRS, deck.length)) {
    if (!queue.length) queue = shuffle(deck);
    const [c, ...rest] = queue;
    queue = rest;
    if (!cards.some((x) => x.id === c.id)) cards.push(c);
  }
  return { ...s, queue, words: shuffle(cards), meanings: shuffle(cards), cleared: [], sel: null, slipped: [], started: true };
}

function reduce(s: S, a: A, deck: GameCard[]): S {
  if (s.over) return s;
  if (a.type === "quit") return { ...s, over: true };
  if (a.type === "tick") {
    let n: S = s.started ? s : newBoard(s, deck);
    const time = Math.max(0, n.time - a.dt);
    n = { ...n, time, over: time <= 0 };
    if (n.wrongMs > 0) n = { ...n, wrongMs: n.wrongMs - a.dt, wrong: n.wrongMs - a.dt > 0 ? n.wrong : [] };
    if (n.nextBoardMs > 0) {
      const left = n.nextBoardMs - a.dt;
      n = left > 0 ? { ...n, nextBoardMs: left } : { ...newBoard(n, deck), nextBoardMs: 0 };
    }
    return n;
  }
  const { tile } = a;
  if (s.cleared.includes(tile.id) || s.nextBoardMs > 0) return s;
  if (!s.sel || s.sel.side === tile.side) return { ...s, sel: tile };
  const wordId = s.sel.side === "word" ? s.sel.id : tile.id;
  const meaningId = s.sel.side === "meaning" ? s.sel.id : tile.id;
  if (wordId === meaningId) {
    const cleared = [...s.cleared, wordId];
    const pts = points(s.combo);
    const full = cleared.length === s.words.length;
    return {
      ...s,
      sel: null,
      cleared,
      answers: [...s.answers, { wordId, correct: !s.slipped.includes(wordId) }],
      score: s.score + pts,
      combo: s.combo + 1,
      time: Math.min(MAX_MS, s.time + BONUS_MS),
      nextBoardMs: full ? NEXT_BOARD_MS : 0,
      ev: { n: (s.ev?.n ?? 0) + 1, type: full ? "board" : "pair", wordId, meaningId, points: pts, combo: s.combo + 1 },
    };
  }
  const slipped = [...new Set([...s.slipped, wordId, meaningId])];
  const add = deck.filter((c) => (c.id === wordId || c.id === meaningId) && !s.missed.some((m) => m.id === c.id));
  return {
    ...s,
    sel: null,
    slipped,
    missed: [...s.missed, ...add],
    combo: 0,
    time: Math.max(0, s.time - PENALTY_MS),
    wrong: [`word:${wordId}`, `meaning:${meaningId}`],
    wrongMs: WRONG_FLASH_MS,
    ev: { n: (s.ev?.n ?? 0) + 1, type: "wrong", wordId, meaningId, points: 0, combo: 0 },
  };
}

export function WordMatch({ deck }: { deck: GameDeck }) {
  const { t } = useI18n();
  const { paused, setHud, say } = useGame();
  const fx = useFx();
  const board = useRef<HTMLDivElement>(null);
  const [s, dispatch] = useReducer((st: S, a: A) => reduce(st, a, deck.cards), undefined, init);

  useGameLoop((dt) => dispatch({ type: "tick", dt }), !paused && !s.over);
  useQuit(() => dispatch({ type: "quit" }));
  useReportEnd(s.over, { score: s.score, answers: s.answers, missed: s.missed });
  useFxEvents(s.ev, (ev) => {
    const w = board.current?.querySelector(`[data-tile="word:${ev.wordId}"]`);
    const m = board.current?.querySelector(`[data-tile="meaning:${ev.meaningId}"]`);
    if (ev.type === "wrong") {
      fx.sound("wrong");
      fx.burst(w, "smoke", 10);
      fx.burst(m, "smoke", 10);
      fx.shake(0.5);
      return;
    }
    fx.beam(w, m, "gold");
    fx.burst(w, "gold", 18);
    fx.burst(m, "spell", 18);
    fx.float(m, `+${ev.points}`, "gold");
    if (ev.type === "board") {
      fx.flash("gold");
      fx.sound("levelUp");
    } else if (ev.combo > 1 && ev.combo % 5 === 0) fx.sound("combo", ev.combo);
    else fx.sound("right");
  });
  useEffect(() => {
    setHud({ score: s.score, combo: s.combo, timeLeft: s.time, timeMax: START_MS });
  }, [s.score, s.combo, s.time, setHud]);

  const pick = (c: GameCard, side: Side) => {
    if (paused || s.over) return;
    if (side === "word") say(c.word);
    dispatch({ type: "pick", tile: { id: c.id, side } });
  };

  const tile = (c: GameCard, side: Side) => {
    const key = `${side}:${c.id}`;
    const isSel = s.sel?.id === c.id && s.sel.side === side;
    const done = s.cleared.includes(c.id);
    return (
      <button
        key={key}
        type="button"
        className="game-tile game-rune"
        data-tile={key}
        data-side={side}
        data-sel={isSel || undefined}
        data-wrong={s.wrong.includes(key) || undefined}
        data-done={done || undefined}
        disabled={done}
        aria-pressed={isSel}
        onClick={() => pick(c, side)}
      >
        {side === "word" ? c.word : c.meaning}
      </button>
    );
  };

  return (
    <div ref={board} className="ds-keep-cols game-match game-night game-spellbook" role="group" aria-label={t("games.match.board")}>
      <div className="game-match-col">{s.words.map((c) => tile(c, "word"))}</div>
      <div className="game-match-col">{s.meanings.map((c) => tile(c, "meaning"))}</div>
    </div>
  );
}
