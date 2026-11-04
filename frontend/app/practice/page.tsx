"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ProgressRing } from "@/components/charts/progress-ring";
import { Waveform } from "@/components/charts/waveform";
import { IeltsPractice } from "@/components/ielts-practice";
import { RubricPanel } from "@/components/rubric-panel";
import { WordTips } from "@/components/word-tips";
import type { IeltsPart } from "@/lib/ielts-api";
import { fetchNextSentence, type PracticeSentence } from "@/lib/practice-api";
import { submitPronunciationAttempt, resolveAudioUrl, type PronunciationAttempt } from "@/lib/pronunciation-api";
import { WavRecorder } from "@/lib/wav-recorder";
import { scoreColor, scoreColorSoft } from "@/lib/score-color";
import { speakEnglish } from "@/lib/text-to-speech";
import { getLang, translate, useI18n, type MessageKey } from "@/lib/i18n";

type RecState = "idle" | "recording" | "processing" | "result" | "error";
type Mode = "shadowing" | IeltsPart;

const MODES: { id: Mode; label: MessageKey }[] = [
  { id: "shadowing", label: "common.task.shadowing" },
  { id: "part1", label: "common.task.part1" },
  { id: "part2", label: "common.task.part2" },
  { id: "part3", label: "common.task.part3" },
];

export default function PracticePage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("shadowing");
  const [sentence, setSentence] = useState<PracticeSentence | null>(null);
  const [sentenceLoading, setSentenceLoading] = useState(true);
  const [sentenceError, setSentenceError] = useState<string | null>(null);
  const [rec, setRec] = useState<RecState>("idle");
  const [recSecs, setRecSecs] = useState(0);
  const [layout, setLayout] = useState<"A" | "B">("A");
  const [result, setResult] = useState<PronunciationAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<WavRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadNextSentence() {
    setSentenceLoading(true);
    setSentenceError(null);
    try {
      const next = await fetchNextSentence();
      setSentence(next);
    } catch (err) {
      setSentenceError(err instanceof Error ? err.message : t("practice.sentenceFailed"));
    } finally {
      setSentenceLoading(false);
    }
  }

  // First sentence: sentenceLoading starts true, so the effect only sets state when the
  // request settles (no synchronous setState inside the effect).
  useEffect(() => {
    let cancelled = false;
    fetchNextSentence()
      .then((next) => {
        if (!cancelled) setSentence(next);
      })
      .catch((err) => {
        if (!cancelled) setSentenceError(err instanceof Error ? err.message : translate(getLang(), "practice.sentenceFailed"));
      })
      .finally(() => {
        if (!cancelled) setSentenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function startRecording() {
    setError(null);
    try {
      const recorder = new WavRecorder();
      await recorder.start();
      recorderRef.current = recorder;
      setRec("recording");
      setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      setError(t("common.micDenied"));
      setRec("error");
    }
  }

  async function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    const recorder = recorderRef.current;
    if (!recorder || !sentence) return;

    setRec("processing");
    try {
      const wavBlob = recorder.stop();
      const attempt = await submitPronunciationAttempt(wavBlob, sentence.text);
      setResult(attempt);
      setRec("result");
      queryClient.invalidateQueries({ queryKey: ["progress-summary"] });
      queryClient.invalidateQueries({ queryKey: ["review"] }); // new weak words
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.scoringFailed"));
      setRec("error");
    }
  }

  function toggleRecord() {
    if (rec === "idle" || rec === "error") startRecording();
    else if (rec === "recording") stopRecording();
  }

  function retryRecord() {
    if (timerRef.current) clearInterval(timerRef.current);
    setRec("idle");
    setRecSecs(0);
    setResult(null);
    setError(null);
  }

  function nextSentence() {
    if (timerRef.current) clearInterval(timerRef.current);
    setRec("idle");
    setRecSecs(0);
    setResult(null);
    setError(null);
    loadNextSentence();
  }

  const words =
    result?.wordScores.map((w) => ({
      text: w.word,
      score: Math.round(w.accuracyScore),
      color: scoreColor(w.accuracyScore),
      colorSoft: scoreColorSoft(w.accuracyScore),
      errLabel: w.errorType !== "none" ? t("practice.wordNeedsWork", { word: w.word }) : t("practice.wordGood", { word: w.word }),
    })) ?? [];

  const phonemes =
    result?.phonemeScores.map((p) => ({
      sym: p.phoneme,
      score: Math.round(p.score),
      color: scoreColor(p.score),
    })) ?? [];

  const segBtnBase: React.CSSProperties = {
    border: "none",
    cursor: "pointer",
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    padding: "6px 14px",
    borderRadius: 99,
    fontFamily: "inherit",
  };

  return (
    <AppShell width={940}>
      <div className="fade" style={{ maxWidth: 940, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", justifyContent: "safe center", minWidth: 0 }}>
          <div role="tablist" className="ds-tabs" style={{ display: "inline-flex", background: "var(--ds-surface-muted)", borderRadius: "var(--ds-radius-full)", padding: 3 }}>
            {MODES.map((m) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={mode === m.id}
                disabled={rec === "recording" || rec === "processing"}
                onClick={() => setMode(m.id)}
                style={{
                  ...segBtnBase,
                  fontSize: "var(--text-sm)",
                  padding: "8px 18px",
                  minHeight: 44,
                  whiteSpace: "nowrap",
                  background: mode === m.id ? "var(--ds-surface)" : "transparent",
                  color: mode === m.id ? "var(--ds-primary)" : "var(--ds-text-muted)",
                  boxShadow: mode === m.id ? "var(--ds-shadow-xs)" : "none",
                }}
              >
                {t(m.label)}
              </button>
            ))}
          </div>
        </div>

        {mode !== "shadowing" ? (
          // key: switching part remounts the component, so it starts fresh.
          <IeltsPractice key={mode} part={mode} />
        ) : (
          <>
            <div className="ds-card" style={{ padding: 26 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      padding: "3px 10px",
                      borderRadius: 99,
                      background: "var(--ds-info-bg)",
                      color: "var(--ds-info)",
                    }}
                  >
                    <i className="pi pi-sparkles" style={{ fontSize: "var(--text-xs)" }} />
                    {t("practice.aiSentence")}
                  </span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("practice.topicDaily")}</span>
                </div>
                <button onClick={nextSentence} disabled={sentenceLoading} className="ds-btn ds-btn-text ds-btn-sm">
                  <span>{t("practice.otherSentence")}</span>
                  <i className="pi pi-refresh" />
                </button>
              </div>

              <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
                {sentenceLoading && (
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", padding: "20px 0" }}>
                    <i className="pi pi-spinner" style={{ animation: "spin 1s linear infinite", marginRight: 8 }} />
                    {t("practice.generating")}
                  </div>
                )}
                {sentenceError && (
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)", padding: "20px 0" }}>{sentenceError}</div>
                )}
                {sentence && !sentenceLoading && !sentenceError && (
                  <>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", marginBottom: 8 }}>{t("practice.listenThenRead")}</div>
                    <div style={{ font: "600 var(--text-3xl)/1.4 var(--font-display)", color: "var(--ds-text)" }}>{sentence.text}</div>
                    <div style={{ fontSize: "var(--text-base)", color: "var(--ds-text-muted)", marginTop: 8 }}>{sentence.phonetic}</div>
                    {sentence.gloss && (
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-secondary)", marginTop: 6, fontStyle: "italic" }}>
                        {sentence.gloss}
                      </div>
                    )}
                    <button onClick={() => speakEnglish(sentence.text)} className="ds-btn ds-btn-outline ds-btn-sm" style={{ marginTop: 14 }}>
                      <i className="pi pi-volume-up" />
                      <span>{t("common.listenSample")}</span>
                    </button>
                  </>
                )}
              </div>

              <div
                style={{
                  marginTop: 20,
                  paddingTop: 20,
                  borderTop: "1px solid var(--ds-border-subtle)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div style={{ width: "100%", maxWidth: 520, height: 64, display: "grid", placeItems: "center" }}>
                  <Waveform active={rec === "recording"} />
                </div>

                {(rec === "idle" || rec === "error") && (
                  <>
                    <button
                      onClick={toggleRecord}
                      disabled={!sentence}
                      className="ds-btn ds-btn-lg"
                      style={{ borderRadius: "var(--ds-radius-full)", padding: "0 30px", height: 56 }}
                    >
                      <i className="pi pi-microphone" style={{ fontSize: "var(--text-lg)" }} />
                      <span>{t("practice.tapToSpeak")}</span>
                    </button>
                    {error ? (
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{error}</div>
                    ) : (
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
                        {t("practice.relax")}
                      </div>
                    )}
                  </>
                )}
                {rec === "recording" && (
                  <>
                    <button
                      onClick={toggleRecord}
                      className="ds-btn ds-btn-lg"
                      style={{ borderRadius: "var(--ds-radius-full)", padding: "0 30px", height: 56, animation: "recpulse 1.6s infinite" }}
                    >
                      <i className="pi pi-stop-circle" style={{ fontSize: "var(--text-lg)" }} />
                      <span>{t("practice.recordingStop", { time: `0:${String(recSecs).padStart(2, "0")}` })}</span>
                    </button>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-primary)", fontWeight: 600 }}>{t("practice.listening")}</div>
                  </>
                )}
                {rec === "processing" && (
                  <>
                    <button
                      disabled
                      className="ds-btn ds-btn-lg"
                      style={{ borderRadius: "var(--ds-radius-full)", padding: "0 30px", height: 56 }}
                    >
                      <i className="pi pi-spinner" style={{ fontSize: "var(--text-lg)", animation: "spin 1s linear infinite" }} />
                      <span>{t("practice.scoring")}</span>
                    </button>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("practice.sendingAzure")}</div>
                  </>
                )}
              </div>
            </div>

            {rec === "result" && result && (
              <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ font: "700 var(--text-lg)/1.3 var(--font-display)" }}>{t("practice.resultTitle")}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>{t("practice.layout")}</span>
                    <div style={{ display: "inline-flex", background: "var(--ds-surface-muted)", borderRadius: "var(--ds-radius-full)", padding: 3 }}>
                      <button
                        onClick={() => setLayout("A")}
                        style={{
                          ...segBtnBase,
                          background: layout === "A" ? "var(--ds-surface)" : "transparent",
                          color: layout === "A" ? "var(--ds-primary)" : "var(--ds-text-muted)",
                          boxShadow: layout === "A" ? "var(--ds-shadow-xs)" : "none",
                        }}
                      >
                        {t("practice.layoutA")}
                      </button>
                      <button
                        onClick={() => setLayout("B")}
                        style={{
                          ...segBtnBase,
                          background: layout === "B" ? "var(--ds-surface)" : "transparent",
                          color: layout === "B" ? "var(--ds-primary)" : "var(--ds-text-muted)",
                          boxShadow: layout === "B" ? "var(--ds-shadow-xs)" : "none",
                        }}
                      >
                        {t("practice.layoutB")}
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    background: "var(--ds-success-bg)",
                    border: "1px solid var(--ds-success-border)",
                    borderRadius: "var(--ds-radius-lg)",
                    color: "var(--ds-success)",
                  }}
                >
                  <i className="pi pi-check-circle" style={{ fontSize: "var(--text-lg)" }} />
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--ds-text)", flex: 1 }}>
                    {t("practice.youSaidLabel")} <b>{result.recognizedText ?? t("common.notRecognized")}</b>
                  </span>
                  <audio controls src={resolveAudioUrl(result.audioUrl)} style={{ height: 32 }} />
                </div>

                {layout === "A" ? (
                  <div className="fade" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
                    <div className="ds-card" style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
                      <div style={{ display: "flex", gap: 22 }}>
                        <div style={{ position: "relative", width: 118, height: 118 }}>
                          <ProgressRing pct={result.overallScore} color={scoreColor(result.overallScore)} size={118} strokeWidth={11} />
                          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
                            <div>
                              <div style={{ font: "700 var(--text-2xl)/1.3 var(--font-display)" }}>{Math.round(result.overallScore)}</div>
                              <div style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>{t("common.accuracy")}</div>
                            </div>
                          </div>
                        </div>
                        <div style={{ position: "relative", width: 118, height: 118 }}>
                          <ProgressRing pct={result.fluencyScore} color={scoreColor(result.fluencyScore)} size={118} strokeWidth={11} />
                          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
                            <div>
                              <div style={{ font: "700 var(--text-2xl)/1.3 var(--font-display)" }}>{Math.round(result.fluencyScore)}</div>
                              <div style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>{t("common.fluency")}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{ width: "100%", borderTop: "1px solid var(--ds-border-subtle)", paddingTop: 14 }}>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--ds-text-secondary)", marginBottom: 10 }}>
                          {t("practice.soundsToPractice")}
                        </div>
                        {phonemes.length === 0 && (
                          <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("practice.noPhonemes")}</div>
                        )}
                        {phonemes.map((p, i) => (
                          <div key={`${p.sym}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                            <span style={{ font: "700 var(--text-base)/1.3 var(--font-display)", width: 34, color: "var(--ds-text)" }}>{p.sym}</span>
                            <div style={{ flex: 1, height: 8, background: "var(--ds-surface-muted)", borderRadius: 99, overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 99, background: p.color, width: `${p.score}%` }} />
                            </div>
                            <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, width: 30, textAlign: "right", color: p.color }}>{p.score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="ds-card" style={{ padding: 26 }}>
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", marginBottom: 14 }}>{t("practice.wordByWord")}</div>
                      <div style={{ font: "600 var(--text-2xl)/1.9 var(--font-display)", display: "flex", flexWrap: "wrap", gap: "2px 4px" }}>
                        {words.map((w, i) => (
                          <span
                            key={i}
                            title={w.errLabel}
                            style={{ display: "inline-block", padding: "2px 5px", borderRadius: 6, color: w.color, background: w.colorSoft }}
                          >
                            {w.text}
                          </span>
                        ))}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 16,
                          marginTop: 20,
                          paddingTop: 16,
                          borderTop: "1px solid var(--ds-border-subtle)",
                          fontSize: "var(--text-xs)",
                          color: "var(--ds-text-muted)",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--ds-success)" }} />
                          {t("practice.good")}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--ds-warning)" }} />
                          {t("practice.fair")}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--ds-danger)" }} />
                          {t("practice.needsWork")}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="fade" style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
                    <div className="ds-card" style={{ padding: 28 }}>
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", marginBottom: 18 }}>
                        {t("practice.readEachWord")}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 12px" }}>
                        {words.map((w, i) => (
                          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                            <span style={{ font: "600 var(--text-xl)/1.3 var(--font-display)", color: w.color }}>{w.text}</span>
                            <div style={{ width: 46, height: 5, borderRadius: 99, background: w.colorSoft }}>
                              <div style={{ height: "100%", borderRadius: 99, background: w.color, width: `${w.score}%` }} />
                            </div>
                            <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: w.color }}>{w.score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div className="ds-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("practice.accuracyScore")}</span>
                          <span style={{ font: "700 var(--text-lg)/1.3 var(--font-display)", color: scoreColor(result.overallScore) }}>
                            {Math.round(result.overallScore)}
                          </span>
                        </div>
                        <div style={{ height: 9, background: "var(--ds-surface-muted)", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", background: scoreColor(result.overallScore), width: `${result.overallScore}%` }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("practice.fluencyScore")}</span>
                          <span style={{ font: "700 var(--text-lg)/1.3 var(--font-display)", color: scoreColor(result.fluencyScore) }}>
                            {Math.round(result.fluencyScore)}
                          </span>
                        </div>
                        <div style={{ height: 9, background: "var(--ds-surface-muted)", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", background: scoreColor(result.fluencyScore), width: `${result.fluencyScore}%` }} />
                        </div>
                      </div>
                      <div className="ds-card" style={{ padding: 20 }}>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--ds-text-secondary)", marginBottom: 12 }}>{t("practice.soundsShort")}</div>
                        {phonemes.map((p, i) => (
                          <div
                            key={`${p.sym}-${i}`}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "7px 0",
                              borderBottom: "1px solid var(--ds-border-subtle)",
                            }}
                          >
                            <span style={{ font: "700 var(--text-base)/1.3 var(--font-display)" }}>{p.sym}</span>
                            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: p.color }}>{p.score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {result.rubric && <RubricPanel rubric={result.rubric} grader={result.grader} />}
                <WordTips words={result.wordScores} />

                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button onClick={retryRecord} className="ds-btn ds-btn-outline">
                    <i className="pi pi-refresh" />
                    <span>{t("common.retry")}</span>
                  </button>
                  <button onClick={nextSentence} className="ds-btn">
                    <span>{t("practice.nextSentence")}</span>
                    <i className="pi pi-arrow-right" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
