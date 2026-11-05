"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { phonemeToIpa } from "@/lib/phonemes";
import { phonemeTip } from "@/lib/pronunciation-tips";
import { scoreWord, type PhonemeScore, type WordScore } from "@/lib/pronunciation-api";
import { scoreColor } from "@/lib/score-color";
import { speakEnglish } from "@/lib/text-to-speech";
import { useRecorder } from "@/lib/use-recorder";
import { Icon } from "@/components/icon";

const MAX_WORDS = 8;
const WEAK = 60; // accuracy below this needs work
const MAX_WORD_SECONDS = 5;

/** The words said wrongly, weakest first (insertions are not in the expected text). */
export function weakWords(words: WordScore[]): WordScore[] {
  const seen = new Set<string>();
  return words
    .filter((w) => w.errorType !== "insertion" && (w.errorType === "mispronunciation" || w.errorType === "omission" || w.accuracyScore < WEAK))
    .sort((a, b) => a.accuracyScore - b.accuracyScore)
    .filter((w) => {
      const k = w.word.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_WORDS);
}

function Sounds({ phonemes }: { phonemes: PhonemeScore[] }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {phonemes.map((p, i) => (
        <span
          key={i}
          title={`${Math.round(p.score)}/100`}
          style={{ padding: "2px 7px", borderRadius: 7, background: "var(--ds-surface-subtle)", color: scoreColor(p.score), fontWeight: 600, fontSize: "var(--text-sm)" }}
        >
          {phonemeToIpa(p.phoneme).replace(/\//g, "")}
        </span>
      ))}
    </div>
  );
}

function WordTip({ w }: { w: WordScore }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "recording" | "scoring">("idle");
  const [tryResult, setTryResult] = useState<{ score: number; phonemes: PhonemeScore[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phonemes = w.phonemes ?? [];
  const weak = phonemes
    .map((p, i) => ({ ...p, last: i === phonemes.length - 1 }))
    .filter((p) => p.score < WEAK)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
  const recorder = useRecorder(
    MAX_WORD_SECONDS,
    (wav) => score(wav),
    (err) => {
      setError(err.message);
      setState("idle");
    },
  );

  async function score(wav: Blob) {
    setState("scoring");
    try {
      const r = await scoreWord(w.word, wav);
      setTryResult(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tips.scoringFailed"));
    } finally {
      setState("idle");
    }
  }

  async function toggleRecording() {
    setError(null);
    if (state === "recording") {
      try {
        const wav = recorder.stop();
        if (wav) score(wav);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("common.noAudio"));
        setState("idle");
      }
      return;
    }
    try {
      await recorder.start();
      setState("recording");
    } catch {
      setError(t("tips.micDenied"));
    }
  }

  return (
    <div style={{ borderBottom: "1px solid var(--ds-border-subtle)", padding: "10px 0" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, border: "none", background: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
      >
        <span style={{ font: "600 var(--text-base)/1.3 var(--font-display)", color: scoreColor(w.accuracyScore), minWidth: 110 }}>{w.word}</span>
        <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
          {w.errorType === "omission"
            ? t("tips.omitted")
            : weak.length > 0
              ? t("tips.soundsToFix", { sounds: weak.map((p) => phonemeToIpa(p.phoneme)).join(" ") })
              : `${Math.round(w.accuracyScore)}/100`}
        </span>
        <Icon name={open ? "chevronUp" : "chevronDown"} style={{ color: "var(--ds-text-muted)" }} />
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 0 4px" }}>
          {phonemes.length > 0 && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
              <span>{t("tips.correctSounds")}</span>
              <Sounds phonemes={phonemes} />
            </div>
          )}
          {weak.map((p, i) => (
            <div key={i} style={{ fontSize: "var(--text-sm)", lineHeight: 1.6, color: "var(--ds-text-secondary)" }}>
              <b style={{ color: scoreColor(p.score) }}>{phonemeToIpa(p.phoneme)}</b> ({Math.round(p.score)}/100): {phonemeTip(t, p.phoneme, p.last)}
            </div>
          ))}
          {weak.length === 0 && w.errorType === "omission" && (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-secondary)" }}>{t("tips.omittedHint")}</div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => speakEnglish(w.word)}>
              <Icon name="listen" />
              <span>{t("common.listenSample")}</span>
            </button>
            <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => speakEnglish(w.word, 0.55)}>
              <Icon name="listenSlow" />
              <span>{t("common.listenSlow")}</span>
            </button>
            <button className="ds-btn ds-btn-sm" onClick={toggleRecording} disabled={state === "scoring"}>
              <Icon name={state === "recording" ? "stop" : state === "scoring" ? "loading" : "record"} spin={state === "scoring"} />
              <span>{state === "recording" ? t("tips.stop", { secs: MAX_WORD_SECONDS - recorder.secs }) : state === "scoring" ? t("tips.scoring") : t("tips.retry")}</span>
            </button>
            {tryResult && (
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: "var(--text-sm)" }}>
                <b style={{ color: scoreColor(tryResult.score) }}>{Math.round(tryResult.score)}/100</b>
                {tryResult.score >= 80 ? t("tips.good") : tryResult.score > Math.round(w.accuracyScore) ? t("tips.better") : t("tips.tryAgain")}
                {tryResult.phonemes.length > 0 && <Sounds phonemes={tryResult.phonemes} />}
              </span>
            )}
          </div>
          {error && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

/** Pronunciation tips: the words said wrongly, which sound was off, how to say it, and a retry. */
export function WordTips({ words }: { words: WordScore[] }) {
  const { t } = useI18n();
  const list = weakWords(words);
  if (list.length === 0) return null;
  return (
    <div className="ds-card" style={{ padding: 20 }}>
      <div style={{ font: "700 var(--text-base)/1.3 var(--font-display)" }}>{t("tips.title")}</div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", margin: "4px 0 6px" }}>
        {t("tips.intro", { count: list.length })}
      </div>
      {list.map((w, i) => (
        <WordTip key={`${w.word}-${i}`} w={w} />
      ))}
    </div>
  );
}
