"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/icon";
import { playTts, saveToNotebook, type Lesson } from "@/lib/listening-api";
import type { LessonAudio } from "./lesson-audio";

// The transcript of a lesson: the line being heard is lit (timed lessons) and scrolled into
// view; the button of a line plays it (timed: the lesson audio, else Azure TTS). Selecting a
// word or phrase, or tapping a word, opens the save bar (Save to notebook, with the line as
// context). Phrases the AI listed are underlined.

type Pick = { text: string; context: string };

const MAX_WORDS = 6;

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** The words and spaces of a line with their character offset. */
function splitWords(text: string): { w: string; at: number }[] {
  const out: { w: string; at: number }[] = [];
  let at = 0;
  for (const w of text.split(/(\s+)/)) {
    if (w) out.push({ w, at });
    at += w.length;
  }
  return out;
}

export function Transcript({ lesson, audio, hidden }: { lesson: Lesson; audio: LessonAudio | null; hidden: boolean }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const time = audio?.time ?? 0;
  const started = !!audio && (audio.playing || time > 0);
  const active = lesson.timed && started ? lesson.segments.findIndex((s) => s.start != null && s.end != null && time >= s.start && time < s.end) : -1;

  // Keep the line being heard in view (only when it leaves the screen; no jumping).
  useEffect(() => {
    if (active < 0 || !audio?.playing) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-line="${active}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 140 || r.bottom > window.innerHeight - 120) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    }
  }, [active, audio?.playing]);

  // Where the phrases the AI listed appear in each line (character ranges), to underline them.
  const phraseRanges = useMemo(
    () =>
      lesson.segments.map((s) => {
        const low = s.text.toLowerCase();
        const out: [number, number][] = [];
        for (const p of lesson.phrases ?? []) {
          const k = p.toLowerCase();
          for (let at = low.indexOf(k); at >= 0 && k; at = low.indexOf(k, at + k.length)) out.push([at, at + k.length]);
        }
        return out;
      }),
    [lesson.segments, lesson.phrases],
  );

  function onSelect() {
    if (hidden) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !box.current) return;
    const anchor = sel.anchorNode?.parentElement?.closest<HTMLElement>("[data-line]");
    if (!anchor || !box.current.contains(anchor)) return;
    const text = clean(sel.toString());
    if (!text || text.split(" ").length > MAX_WORDS) return;
    setPick({ text, context: lesson.segments[Number(anchor.dataset.line)]?.text ?? "" });
  }

  function playLine(i: number) {
    const s = lesson.segments[i];
    if (lesson.timed && audio && s.start != null) audio.seek(s.start, true);
    else void playTts(s.text).catch(() => undefined);
  }

  return (
    <>
      <div ref={box} className="ls-transcript" data-hidden={hidden || undefined} onMouseUp={onSelect} onTouchEnd={() => setTimeout(onSelect, 0)} aria-label={t("listen.transcript")}>
        {lesson.segments.map((s, i) => {
          const prev = lesson.segments[i - 1];
          const showSpeaker = s.speaker && s.speaker !== prev?.speaker;
          return (
            <div key={i} className="ls-line" data-line={i} data-active={i === active || undefined}>
              <button type="button" className="ls-line-play" onClick={() => playLine(i)} aria-label={t("listen.playLine")} title={t("listen.playLine")}>
                <Icon name="play" size="sm" />
              </button>
              <div className="ls-line-text">
                {showSpeaker && <span className="ls-speaker">{s.speaker}</span>}
                {splitWords(s.text).map(({ w, at }, j) =>
                  /^\s+$/.test(w) ? (
                    w
                  ) : (
                    <span
                      key={j}
                      className="ls-word"
                      data-phrase={phraseRanges[i].some(([a, b]) => at < b && at + w.length > a) || undefined}
                      onClick={() => {
                        if (hidden) return;
                        const sel = window.getSelection();
                        if (sel && !sel.isCollapsed) return; // a selection is handled on mouseup
                        const text = clean(w);
                        if (text) setPick({ text, context: s.text });
                      }}
                    >
                      {w}
                    </span>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
      {pick && <SaveBar key={`${pick.text}|${pick.context}`} pick={pick} lessonId={lesson.id} onClose={() => setPick(null)} />}
    </>
  );
}

/** Saves a picked word or phrase; shows the meaning once it is looked up. */
export function SaveBar({ pick, lessonId, onClose }: { pick: Pick; lessonId: string; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [text, setText] = useState(pick.text);

  async function save() {
    setState("saving");
    try {
      const r = await saveToNotebook(text, pick.context, lessonId);
      setMsg(r.lookedUp ? t("listen.save.saved", { word: r.card.word, meaning: r.card.meaning }) : t("listen.save.savedNoMeaning", { word: r.card.word }));
      setState("done");
      void qc.invalidateQueries({ queryKey: ["notebook"] });
      void qc.invalidateQueries({ queryKey: ["review"] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("notebook.err.save"));
      setState("error");
    }
  }

  return (
    <div className="ls-savebar" role="region" aria-live="polite">
      {state === "done" ? (
        <>
          <Icon name="done" />
          <span style={{ flex: 1, minWidth: 180 }}>{msg}</span>
          <Link href="/review#notebook" className="ds-btn ds-btn-outline ds-btn-sm">
            {t("listen.save.open")}
          </Link>
        </>
      ) : (
        <>
          <input className="ds-input" value={text} onChange={(e) => setText(e.target.value)} aria-label={t("notebook.add.label")} style={{ flex: 1, minWidth: 140 }} maxLength={60} />
          <button type="button" className="ds-btn ds-btn-sm" onClick={save} disabled={state === "saving" || !clean(text)}>
            <Icon name={state === "saving" ? "loading" : "bookmark"} spin={state === "saving"} />
            <span>{state === "saving" ? t("listen.save.saving") : t("listen.save.button", { text: clean(text) })}</span>
          </button>
          {state === "error" && <span style={{ color: "var(--ds-danger)", fontSize: "var(--text-sm)" }}>{msg}</span>}
        </>
      )}
      <button type="button" className="ls-round" onClick={onClose} aria-label={t("listen.save.cancel")} title={t("listen.save.cancel")}>
        <Icon name="close" />
      </button>
    </div>
  );
}
