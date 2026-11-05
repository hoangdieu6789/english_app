"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/icon";
import { compare, hint, type DictationResult } from "@/lib/dictation";
import { playTts, saveDictation, saveToNotebook, type Lesson } from "@/lib/listening-api";
import type { LessonAudio } from "./lesson-audio";

// Dictation: line by line, the learner hears the line (the lesson audio for timed lessons,
// Azure TTS otherwise), types it, checks it and sees the word diff. Each line is saved; the
// run's average is saved at the end. Ctrl+Space plays again, Enter checks then goes on.

type Done = { segment: number; typed: string; result: DictationResult };

export function Dictation({ lesson, audio }: { lesson: Lesson; audio: LessonAudio | null }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const lines = lesson.segments;
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [shown, setShown] = useState<DictationResult | null>(null);
  const [hintOn, setHintOn] = useState(false);
  const [done, setDone] = useState<Done[]>([]);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const input = useRef<HTMLTextAreaElement>(null);
  const line = lines[i];

  async function play(slow = false, at = i) {
    const line = lines[at];
    if (!line) return;
    const timed = lesson.timed && !!audio && line.start != null && line.end != null;
    setErr("");
    setBusy(true);
    try {
      if (timed) await audio!.playRange(line.start!, line.end!, slow ? 0.75 : 1);
      else await playTts(line.text, { slow, voice: lesson.speakers?.find((s) => s.name === line.speaker)?.voice });
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("listen.err.tts"));
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  function check() {
    if (!line || shown) return;
    const r = compare(line.text, typed);
    setShown(r);
    setDone((d) => [...d, { segment: i, typed, result: r }]);
    void saveDictation(lesson.id, { segment: i, typed, accuracy: r.accuracy }).catch(() => undefined);
  }

  function next() {
    if (i + 1 >= lines.length) {
      finish();
      return;
    }
    setI(i + 1);
    setTyped("");
    setShown(null);
    setHintOn(false);
    void play(false, i + 1); // each new line plays once it is shown
  }

  function finish() {
    setFinished(true);
    audio?.pause();
    const all = done;
    if (all.length) {
      const avg = Math.round(all.reduce((a, d) => a + d.result.accuracy, 0) / all.length);
      const last = all[all.length - 1];
      void saveDictation(lesson.id, { segment: last.segment, typed: last.typed, accuracy: last.result.accuracy, done: true, runAccuracy: avg, lines: all.length })
        .then(() => qc.invalidateQueries({ queryKey: ["lessons"] }))
        .catch(() => undefined);
    }
  }

  function begin() {
    setStarted(true);
    void play(false, 0);
  }

  function restart() {
    void play(false, 0);
    setI(0);
    setTyped("");
    setShown(null);
    setHintOn(false);
    setDone([]);
    setFinished(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === " " && e.ctrlKey) {
      e.preventDefault();
      void play();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (shown) next();
      else if (typed.trim()) check();
    }
  }

  async function saveWord(word: string, context: string) {
    setSaved((s) => ({ ...s, [word]: true }));
    try {
      await saveToNotebook(word, context, lesson.id);
      void qc.invalidateQueries({ queryKey: ["notebook"] });
    } catch {
      setSaved((s) => ({ ...s, [word]: false }));
    }
  }

  if (!started) {
    return (
      <div className="ds-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        <p style={{ margin: 0 }}>{t("listen.dict.start")}</p>
        {!lesson.timed && <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("listen.dict.ttsNote")}</p>}
        {lesson.progress?.dictationBest != null && (
          <span className="ls-tag" data-tone="good">
            {t("listen.dict.done.best", { n: Math.round(lesson.progress.dictationBest) })}
          </span>
        )}
        <button type="button" className="ds-btn" onClick={begin}>
          <Icon name="keyboard" />
          <span>{t("listen.dict.startBtn")}</span>
        </button>
      </div>
    );
  }

  if (finished) {
    const avg = done.length ? Math.round(done.reduce((a, d) => a + d.result.accuracy, 0) / done.length) : 0;
    const missed = new Map<string, string>();
    for (const d of done)
      for (const tok of d.result.tokens)
        if ((tok.kind === "wrong" || tok.kind === "missing") && tok.word.length > 2) missed.set(tok.word.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, ""), lines[d.segment].text);
    return (
      <div className="ds-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ font: "700 var(--text-xl)/1.3 var(--font-display)" }}>{t("listen.dict.done.title")}</div>
        <div>{t("listen.dict.done.body", { n: avg, lines: done.length })}</div>
        {missed.size > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>{t("listen.dict.missedTitle")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[...missed].slice(0, 24).map(([w, ctx]) => (
                <button key={w} type="button" className="ls-chip" aria-pressed={!!saved[w]} disabled={!!saved[w]} onClick={() => saveWord(w, ctx)}>
                  <Icon name={saved[w] ? "check" : "bookmark"} size="sm" />
                  {t("listen.dict.saveWord", { word: w })}
                </button>
              ))}
            </div>
          </div>
        )}
        <button type="button" className="ds-btn ds-btn-outline" onClick={restart} style={{ alignSelf: "flex-start" }}>
          <Icon name="refresh" />
          <span>{t("listen.dict.again")}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="ds-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="ls-tag" data-tone="accent">
          {t("listen.dict.line", { n: i + 1, total: lines.length })}
          {line.speaker && ` · ${line.speaker}`}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => play()} disabled={busy}>
            <Icon name={busy ? "loading" : "listen"} spin={busy} />
            <span>{t("listen.dict.play")}</span>
          </button>
          <button type="button" className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => play(true)} disabled={busy}>
            <Icon name="listenSlow" />
            <span>{t("listen.dict.slow")}</span>
          </button>
        </div>
      </div>
      {hintOn && !shown && <div className="dict-hint">{hint(line.text)}</div>}
      <textarea
        ref={input}
        className="ls-textarea"
        style={{ minHeight: 90 }}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={onKey}
        placeholder={t("listen.dict.placeholder")}
        aria-label={t("listen.dict.placeholder")}
        readOnly={!!shown}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {err && <div style={{ color: "var(--ds-danger)", fontSize: "var(--text-sm)" }}>{err}</div>}
      {shown && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-live="polite">
          <div style={{ font: "700 var(--text-lg)/1.3 var(--font-display)", color: shown.accuracy >= 80 ? "var(--ds-success)" : shown.accuracy >= 50 ? "var(--ds-warning)" : "var(--ds-danger)" }}>
            {t("listen.dict.result", { n: shown.accuracy, correct: shown.correct, total: shown.total })}
          </div>
          <div className="dict-tokens">
            {shown.tokens.map((tok, k) =>
              tok.kind === "extra" ? (
                <span key={k} className="dict-tok" data-kind="extra">
                  {tok.typed}
                </span>
              ) : (
                <span key={k} className="dict-tok" data-kind={tok.kind}>
                  {tok.word}
                  {tok.kind === "wrong" && <small>{tok.typed}</small>}
                </span>
              ),
            )}
          </div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("listen.dict.legend")}</div>
          <div style={{ fontSize: "var(--text-base)" }}>
            <b>{t("listen.dict.answer")}:</b> {line.text}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {!shown ? (
          <>
            <button type="button" className="ds-btn" onClick={check} disabled={!typed.trim()}>
              <Icon name="check" />
              <span>{t("listen.dict.check")}</span>
            </button>
            {!hintOn && (
              <button type="button" className="ds-btn ds-btn-text" onClick={() => setHintOn(true)}>
                {t("listen.dict.hint")}
              </button>
            )}
            <button type="button" className="ds-btn ds-btn-text" onClick={next}>
              {t("listen.dict.skip")}
            </button>
          </>
        ) : (
          <button type="button" className="ds-btn" onClick={next}>
            <span>{i + 1 >= lines.length ? t("listen.dict.finish") : t("listen.dict.next")}</span>
            <Icon name="next" />
          </button>
        )}
      </div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("listen.dict.keys")}</div>
    </div>
  );
}
