"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useI18n } from "@/lib/i18n";
import { choices, shuffle, type Answer, type GameCard } from "@/lib/games/core";
import { answer, dueRetry, startClimb, LEVELS, PLACEMENT_STEP, type ClimbState } from "@/lib/games/level-climb";
import { fetchLevel, type LevelDeck } from "@/lib/games-api";
import { useGame, useQuit } from "./game-frame";
import { useFx } from "./fx";
import { Tower } from "./scenery";

// Level Climb (Freerice style): a word and 4 meanings. The first 4 answers place you (6 levels
// a step); then 3 right answers in a row move you up a level and a wrong answer moves you
// down. A word you missed comes back 3 questions later. Play as long as you like; the level
// is saved when you stop.

const RIGHT_PAUSE_MS = 700;

type Q = { card: GameCard; options: GameCard[]; level: number; picked?: string };

export function LevelClimb({ deck }: { deck: LevelDeck }) {
  const { t } = useI18n();
  const { paused, setHud, finish, say } = useGame();
  const fx = useFx();
  const wordBox = useRef<HTMLDivElement>(null);
  const towerBox = useRef<HTMLDivElement>(null);
  const decks = useRef(new Map<number, Promise<LevelDeck>>([[deck.level, Promise.resolve(deck)]]));
  const used = useRef(new Set<string>());
  const [state, setState] = useState<ClimbState>(() => startClimb(deck.level, deck.placed));
  const [q, setQ] = useState<Q | null>(null);
  const [band, setBand] = useState(deck.levelBand);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [error, setError] = useState("");
  const answers = useRef<Answer[]>([]);
  const missed = useRef(new Map<string, GameCard>());
  const done = useRef(false);

  const levelDeck = (level: number) => {
    let d = decks.current.get(level);
    if (!d) {
      d = fetchLevel(level);
      d.catch(() => decks.current.delete(level));
      decks.current.set(level, d);
    }
    return d;
  };

  async function ask(s: ClimbState, refetched = false) {
    setError("");
    try {
      const retry = dueRetry(s);
      const d = await levelDeck(s.level);
      let card = retry;
      if (!card) {
        let fresh = d.cards.filter((c) => !used.current.has(c.id));
        if (!fresh.length && !refetched) {
          decks.current.delete(s.level); // every word of this batch asked: get another batch
          return ask(s, true);
        }
        if (!fresh.length) fresh = d.cards; // the whole level was asked: words may repeat
        card = shuffle(fresh)[0];
      }
      used.current.add(card.id);
      setBand(d.levelBand);
      setQ({ card, options: choices(card, [...d.cards, ...d.distractors], 4, "meaning"), level: s.level });
      say(card.word);
      // The levels the next answer can lead to, in the background, so moving is instant.
      const step = s.placementLeft > 0 ? PLACEMENT_STEP : 1;
      for (const l of [s.level - step, s.level + step]) if (l >= 1 && l <= LEVELS) void levelDeck(l).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : t("games.err.deck"));
    }
  }
  useEffect(() => {
    void ask(state);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const end = () => {
    if (done.current) return;
    done.current = true;
    finish({ score, answers: answers.current, missed: [...missed.current.values()], level: state.level, deck: "level" });
  };
  useQuit(end);

  function pick(o: GameCard) {
    if (!q || q.picked || paused || done.current) return;
    const right = o.id === q.card.id;
    answers.current.push({ wordId: q.card.id, correct: right });
    const s = answer(state, q.card, right);
    setState(s);
    setQ({ ...q, picked: o.id });
    const btn = document.querySelector(`[data-option="${o.id}"]`);
    if (right) {
      fx.burst(btn, "gold", 22);
      fx.float(btn, "+10", "gold");
      if (s.level > state.level) {
        fx.sound("levelUp");
        fx.flash("gold");
        fx.beam(btn, towerBox.current, "gold");
        fx.burst(towerBox.current, "spell", 40);
        fx.float(towerBox.current, t("games.climb.up"), "gold");
      } else fx.sound("right");
    } else {
      fx.sound("wrong");
      fx.burst(btn, "smoke", 14);
      fx.shake(0.7);
      if (s.level < state.level) fx.float(towerBox.current, t("games.climb.down"), "bad");
    }
    if (right) {
      setScore((x) => x + 10);
      setCombo((c) => c + 1);
      window.setTimeout(() => void ask(s), RIGHT_PAUSE_MS);
    } else {
      missed.current.set(q.card.id, q.card);
      setCombo(0);
    }
  }
  const goOn = () => void ask(state);

  useEffect(() => {
    setHud({ score, combo, extra: t("games.climb.levelShort", { n: state.level }) });
  }, [score, combo, state.level, setHud, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q || paused) return;
      const i = Number(e.key) - 1;
      if (!q.picked && i >= 0 && i < q.options.length) pick(q.options[i]);
      else if (q.picked && q.picked !== q.card.id && e.key === "Enter") goOn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const placing = state.placementLeft > 0;
  return (
    <div className="game-climb game-night">
      <div ref={towerBox} className="game-tower-box" aria-hidden>
        <Tower level={state.level} levels={LEVELS} />
      </div>
      <div className="game-climb-main">
      <div className="game-ladder game-scroll" aria-label={t("games.climb.level", { n: state.level, total: LEVELS })}>
        <div className="game-ladder-head">
          <b>{t("games.climb.level", { n: state.level, total: LEVELS })}</b>
          <span style={{ color: "var(--ds-game-ink-muted)" }}>{t("games.climb.band", { band: band.toFixed(1) })}</span>
        </div>
        <div className="game-ladder-track" aria-hidden>
          <span style={{ width: `${(state.level / LEVELS) * 100}%` }} />
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-game-ink-muted)" }}>
          {placing ? t("games.climb.placing", { n: state.placementLeft }) : t("games.climb.streak", { n: state.streak, need: 3 })}
        </div>
      </div>
      {error && (
        <div role="alert" style={{ color: "var(--ds-danger)" }}>
          {error}{" "}
          <button type="button" className="ds-btn ds-btn-sm ds-btn-outline" onClick={goOn}>
            {t("common.retry")}
          </button>
        </div>
      )}
      {q && (
        <>
          <div ref={wordBox} className="game-climb-word game-scroll">
            <button type="button" className="game-icon-btn" onClick={() => say(q.card.word)} aria-label={t("games.listen", { word: q.card.word })}>
              <Icon name="listen" size="md" />
            </button>
            <div>
              <div style={{ font: "800 var(--text-3xl)/1.1 var(--font-display)" }}>{q.card.word}</div>
              <div style={{ color: "var(--ds-game-ink-muted)" }}>
                {q.card.ipa} · {q.card.pos}
              </div>
            </div>
          </div>
          <div className="game-options game-options-col" role="group" aria-label={t("games.climb.options")}>
            {q.options.map((o, i) => {
              const mark = q.picked ? (o.id === q.card.id ? "right" : o.id === q.picked ? "wrong" : undefined) : undefined;
              return (
                <button key={o.id} type="button" className="game-option game-spell" data-option={o.id} data-mark={mark} disabled={!!q.picked} onClick={() => pick(o)}>
                  <kbd>{i + 1}</kbd> {o.meaning}
                </button>
              );
            })}
          </div>
          {q.picked && q.picked !== q.card.id && (
            <div className="game-feedback" role="status">
              <div>
                <b>{q.card.word}</b>: {q.card.meaning}
              </div>
              {q.card.exampleEn && <div style={{ color: "var(--ds-game-ink-muted)" }}>“{q.card.exampleEn}”</div>}
              <button type="button" className="ds-btn" onClick={goOn} autoFocus>
                {t("games.next")} <Icon name="next" size="sm" />
              </button>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
