"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { DECK_KEY, DECKS, SOUND_KEY, isDeck, lastAnswers, type Answer, type DeckId, type GameCard } from "@/lib/games/core";
import { saveResult, type GameDeck, type GameId } from "@/lib/games-api";
import { speakEnglish } from "@/lib/text-to-speech";
import { sfx, unlock } from "@/lib/games/sfx";
import { FxLayer } from "./fx";

// Shared frame of every vocabulary game: deck picker and start screen, HUD (score, combo,
// hearts or time), pause / sound / quit, saving the result and the end screen with the words
// to learn. Games draw their board and report through useGame(). Motion runs in a JS loop
// (useGameLoop) so that with prefers-reduced-motion items stay in place and only the timers run.

export type Hud = { score: number; combo: number; hearts?: number; maxHearts?: number; timeLeft?: number; timeMax?: number; extra?: string };

export type Finish = {
  score: number;
  answers: Answer[]; // one per question asked (a word can come twice)
  missed: GameCard[]; // words to show on the end screen
  level?: number; // Level Climb
  deck?: GameDeck["deck"];
};

type GameCtx = {
  paused: boolean;
  reduced: boolean; // prefers-reduced-motion: no falling or floating motion
  sound: boolean;
  say: (word: string) => void;
  setHud: (h: Hud) => void;
  finish: (f: Finish) => void;
};

const Ctx = createContext<GameCtx | null>(null);

export function useGame(): GameCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGame outside GameFrame");
  return c;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Calls tick(dt in ms, capped at 100) every frame while running. */
export function useGameLoop(tick: (dt: number) => void, running: boolean) {
  const ref = useRef(tick);
  useEffect(() => {
    ref.current = tick;
  });
  useEffect(() => {
    if (!running) return;
    let id = 0;
    let last = performance.now();
    const loop = (now: number) => {
      ref.current(Math.min(100, now - last));
      last = now;
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [running]);
}

// Deck and sound choices live in localStorage (per device); read them as an external store so
// the first render (server) uses the defaults and the client follows the saved value.
const STORE_EVENT = "speakup-games-store";
function subscribeStore(cb: () => void) {
  window.addEventListener(STORE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(STORE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function useStored(key: string, fallback: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(subscribeStore, () => localStorage.getItem(key) ?? fallback, () => fallback);
  const set = useCallback(
    (v: string) => {
      localStorage.setItem(key, v);
      window.dispatchEvent(new Event(STORE_EVENT));
    },
    [key],
  );
  return [value, set];
}

/** Reports the end of a game once, when over becomes true. */
export function useReportEnd(over: boolean, f: Finish) {
  const { finish } = useGame();
  const sent = useRef(false);
  useEffect(() => {
    if (over && !sent.current) {
      sent.current = true;
      finish(f);
    }
  });
}

const DECK_LABEL: Record<DeckId, MessageKey> = {
  mine: "games.deck.mine",
  "band-4": "games.deck.band4",
  "band-5": "games.deck.band5",
  "band-6": "games.deck.band6",
  "band-7": "games.deck.band7",
  "band-8": "games.deck.band8",
};

function DeckPicker({ value, onChange, myWords }: { value: DeckId; onChange: (d: DeckId) => void; myWords?: number }) {
  const { t } = useI18n();
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 700, marginBottom: 8 }}>{t("games.deck.title")}</legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {DECKS.map((d) => (
          <label key={d} className="game-deck" data-on={d === value || undefined}>
            <input type="radio" name="deck" value={d} checked={d === value} onChange={() => onChange(d)} />
            {t(DECK_LABEL[d])}
            {d === "mine" && myWords != null && <span style={{ color: "var(--ds-text-muted)" }}> · {myWords}</span>}
          </label>
        ))}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
        {t(value === "mine" ? "games.deck.mineHint" : "games.deck.bandHint")}
      </p>
    </fieldset>
  );
}

function HudBar({ hud, paused, sound, onPause, onSound, onQuit }: { hud: Hud; paused: boolean; sound: boolean; onPause: () => void; onSound: () => void; onQuit: () => void }) {
  const { t } = useI18n();
  return (
    <div className="game-hud">
      <span className="game-chip" aria-label={t("games.hud.score")}>
        <Icon name="band" size="sm" /> {hud.score}
      </span>
      {hud.combo > 1 && (
        <span key={hud.combo} className="game-chip game-combo" data-hot={hud.combo >= 5 || undefined}>
          ×{hud.combo}
        </span>
      )}
      {hud.extra && <span className="game-chip">{hud.extra}</span>}
      {hud.maxHearts != null && (
        <span className="game-chip" aria-label={t("games.hud.hearts", { n: hud.hearts ?? 0 })}>
          {Array.from({ length: hud.maxHearts }, (_, i) => (
            <span key={i} className="game-heart" data-lost={i >= (hud.hearts ?? 0) || undefined} aria-hidden>
              ♥
            </span>
          ))}
        </span>
      )}
      {hud.timeMax != null && (
        <span className="game-time" role="timer" aria-label={t("games.hud.time", { n: Math.ceil((hud.timeLeft ?? 0) / 1000) })}>
          <span style={{ width: `${Math.max(0, Math.min(1, (hud.timeLeft ?? 0) / hud.timeMax)) * 100}%` }} />
        </span>
      )}
      <span style={{ flex: 1 }} />
      <button type="button" className="game-icon-btn" onClick={onSound} aria-pressed={sound} aria-label={t(sound ? "games.soundOff" : "games.soundOn")}>
        <Icon name={sound ? "listen" : "mute"} size="md" />
      </button>
      <button type="button" className="game-icon-btn" onClick={onPause} aria-pressed={paused} aria-label={t(paused ? "games.resume" : "games.pause")}>
        <Icon name={paused ? "play" : "pause"} size="md" />
      </button>
      <button type="button" className="game-icon-btn" onClick={onQuit} aria-label={t("games.quit")}>
        <Icon name="close" size="md" />
      </button>
    </div>
  );
}

export function WordList({ cards }: { cards: GameCard[] }) {
  const { t } = useI18n();
  if (!cards.length) return null;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
      {cards.map((c) => (
        <li key={c.id} className="game-word-row">
          <button type="button" className="game-icon-btn" onClick={() => speakEnglish(c.word)} aria-label={t("games.listen", { word: c.word })}>
            <Icon name="listen" size="md" />
          </button>
          <div style={{ minWidth: 0 }}>
            <div>
              <b>{c.word}</b> <span style={{ color: "var(--ds-text-muted)" }}>{c.ipa}</span>
            </div>
            <div style={{ color: "var(--ds-text-secondary)", fontSize: "var(--text-sm)" }}>{c.meaning}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

type Phase = { k: "setup" } | { k: "loading" } | { k: "play"; deck: GameDeck; run: number } | { k: "saving" } | { k: "over"; f: Finish; best?: number; newBest?: boolean; total: number; correct: number } | { k: "error"; msg: string };

export function GameFrame({
  game,
  howTo,
  best,
  myWords,
  load,
  children,
}: {
  game: GameId;
  howTo: MessageKey[];
  best?: number;
  myWords?: number;
  /** deck = null for games without a deck choice (Level Climb). */
  load: (deck: DeckId | null) => Promise<GameDeck>;
  children: (deck: GameDeck) => React.ReactNode;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const reduced = usePrefersReducedMotion();
  const withDeck = game !== "level-climb";
  const [storedDeck, setStoredDeck] = useStored(DECK_KEY, "mine");
  const deckId: DeckId = isDeck(storedDeck) ? storedDeck : "mine";
  const [soundPref, setSoundPref] = useStored(SOUND_KEY, "on");
  const sound = soundPref !== "off";
  const [phase, setPhase] = useState<Phase>({ k: "setup" });
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<Hud>({ score: 0, combo: 0 });
  const started = useRef(0);
  const finishRef = useRef<(f: Finish) => void>(() => {});
  const runRef = useRef(0);

  const start = useCallback(async () => {
    unlock(); // audio needs a user gesture
    setPhase({ k: "loading" });
    try {
      const deck = await load(withDeck ? deckId : null);
      started.current = performance.now();
      setHud({ score: 0, combo: 0 });
      setPaused(false);
      runRef.current += 1;
      setPhase({ k: "play", deck, run: runRef.current });
    } catch (e) {
      setPhase({ k: "error", msg: e instanceof Error ? e.message : t("games.err.deck") });
    }
  }, [load, withDeck, deckId, t]);

  const finish = useCallback(
    async (f: Finish) => {
      if (phase.k !== "play") return;
      const deck = f.deck ?? phase.deck.deck;
      const answers = lastAnswers(f.answers);
      const correct = f.answers.filter((a) => a.correct).length;
      if (sound) sfx.gameOver();
      setPhase({ k: "saving" });
      let best: number | undefined;
      let newBest = false;
      try {
        if (f.answers.length > 0) {
          const r = await saveResult({
            game,
            deck,
            score: f.score,
            correct,
            total: f.answers.length,
            durationMs: Math.round(performance.now() - started.current),
            level: f.level,
            answers,
          });
          best = r.best;
          newBest = r.newBest;
          void qc.invalidateQueries({ queryKey: ["games"] });
          void qc.invalidateQueries({ queryKey: ["review"] });
        }
      } catch {
        // The result could not be saved: still show it.
      }
      setPhase({ k: "over", f, best, newBest, total: f.answers.length, correct });
    },
    [phase, game, qc, sound],
  );
  useEffect(() => {
    finishRef.current = finish;
  });

  const quit = useCallback(() => {
    // The game reports its answers through the finish it registered (see useQuit).
    window.dispatchEvent(new CustomEvent("game:quit"));
  }, []);

  // Keys: Esc quits, P pauses.
  useEffect(() => {
    if (phase.k !== "play") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") quit();
      else if ((e.key === "p" || e.key === "P") && !(e.target instanceof HTMLInputElement)) setPaused((p) => !p);
    };
    const onHidden = () => document.hidden && setPaused(true);
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [phase.k, quit]);

  const say = useCallback((word: string) => sound && speakEnglish(word), [sound]);
  const toggleSound = () => setSoundPref(sound ? "off" : "on");
  const pickDeck = (d: DeckId) => setStoredDeck(d);

  if (phase.k === "play") {
    return (
      <Ctx.Provider value={{ paused, reduced, sound, say, setHud, finish: (f) => void finishRef.current(f) }}>
        <div className="game-stage" data-game={game}>
          <HudBar hud={hud} paused={paused} sound={sound} onPause={() => setPaused((p) => !p)} onSound={toggleSound} onQuit={quit} />
          <FxLayer sound={sound} reduced={reduced}>
            <div className="game-board game-world" key={phase.run} aria-hidden={paused || undefined}>
              {children(phase.deck)}
            </div>
          </FxLayer>
          {paused && (
            <div className="game-overlay" role="dialog" aria-modal="true" aria-label={t("games.paused")}>
              <div className="ds-card" style={{ padding: 24, textAlign: "center", display: "grid", gap: 12 }}>
                <div style={{ font: "800 var(--text-xl)/1.2 var(--font-display)" }}>{t("games.paused")}</div>
                <button type="button" className="ds-btn ds-btn-lg" autoFocus onClick={() => setPaused(false)}>
                  <Icon name="play" size="md" /> {t("games.resume")}
                </button>
                <button type="button" className="ds-btn ds-btn-outline" onClick={quit}>
                  {t("games.quit")}
                </button>
              </div>
            </div>
          )}
        </div>
      </Ctx.Provider>
    );
  }

  if (phase.k === "over") {
    const { f } = phase;
    return (
      <div className="ds-card fade" style={{ padding: 24, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ font: "800 var(--text-3xl)/1 var(--font-display)" }}>{f.score}</div>
          <div style={{ color: "var(--ds-text-secondary)" }}>
            {t("games.end.correct", { n: phase.correct, total: phase.total })}
            {phase.best != null && <> · {phase.newBest ? <b style={{ color: "var(--ds-success)" }}>{t("games.end.newBest")}</b> : t("games.end.best", { n: phase.best })}</>}
          </div>
        </div>
        {f.missed.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>{t("games.end.learn", { n: f.missed.length })}</div>
            <WordList cards={f.missed} />
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("games.end.reviewNote")}</p>
          </div>
        ) : (
          phase.total > 0 && <p style={{ margin: 0 }}>{t("games.end.perfect")}</p>
        )}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="ds-btn ds-btn-lg" onClick={() => void start()} autoFocus>
            <Icon name="refresh" size="md" /> {t("games.again")}
          </button>
          {withDeck && (
            <button type="button" className="ds-btn ds-btn-lg ds-btn-outline" onClick={() => setPhase({ k: "setup" })}>
              {t("games.changeDeck")}
            </button>
          )}
          <Link href="/games" className="ds-btn ds-btn-lg ds-btn-outline">
            <Icon name="back" size="md" /> {t("games.backToGames")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-card" style={{ padding: 24, display: "grid", gap: 20 }}>
      <ol style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 6, color: "var(--ds-text-secondary)" }}>
        {howTo.map((k) => (
          <li key={k}>{t(k)}</li>
        ))}
      </ol>
      {withDeck && <DeckPicker value={deckId} onChange={pickDeck} myWords={myWords} />}
      {phase.k === "error" && (
        <p role="alert" style={{ margin: 0, color: "var(--ds-danger)" }}>
          {phase.msg}
        </p>
      )}
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="ds-btn ds-btn-lg" onClick={() => void start()} disabled={phase.k === "loading" || phase.k === "saving"}>
          {phase.k === "loading" ? <Icon name="loading" size="md" spin /> : <Icon name="play" size="md" />}
          {t(phase.k === "loading" ? "games.loading" : "games.start")}
        </button>
        {best != null && best > 0 && <span style={{ color: "var(--ds-text-muted)" }}>{t("games.end.best", { n: best })}</span>}
      </div>
      {phase.k === "loading" && <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("games.loadingHint")}</p>}
    </div>
  );
}

/** Runs onQuit when the learner quits (✕, Esc, or Quit in the pause dialog). */
export function useQuit(onQuit: () => void) {
  const ref = useRef(onQuit);
  useEffect(() => {
    ref.current = onQuit;
  });
  useEffect(() => {
    const h = () => ref.current();
    window.addEventListener("game:quit", h);
    return () => window.removeEventListener("game:quit", h);
  }, []);
}
