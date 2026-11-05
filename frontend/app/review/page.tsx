"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BoltMark } from "@/components/brand";
import { BandGoalForm } from "@/components/band-goal-form";
import { useI18n, type MessageKey, type Params } from "@/lib/i18n";
import { phonemeToIpa } from "@/lib/phonemes";
import {
  addNewWords,
  goalsQuery,
  gradeReviewWord,
  removeReviewWord,
  reviewQuery,
  submitReviewAttempt,
  type ReviewAttempt,
  type ReviewWord,
} from "@/lib/review-api";
import { scoreColor } from "@/lib/score-color";
import { speakEnglish } from "@/lib/text-to-speech";
import { useRecorder } from "@/lib/use-recorder";
import { Icon } from "@/components/icon";
import { NotebookView } from "@/components/notebook/notebook-view";

// A word is a short recording; stop by itself after a few seconds.
const MAX_WORD_SECONDS = 5;
const NEW_WORDS_PER_BATCH = 10;

type Phase = "ready" | "recording" | "scoring" | "result" | "error";

type T = (key: MessageKey, params?: Params) => string;

const RATINGS: { q: 1 | 3 | 4 | 5; label: MessageKey; color: string }[] = [
  { q: 1, label: "review.rating.forgot", color: "var(--ds-danger)" },
  { q: 3, label: "review.rating.hard", color: "var(--ds-warning)" },
  { q: 4, label: "review.rating.good", color: "var(--ds-primary)" },
  { q: 5, label: "review.rating.easy", color: "var(--ds-success)" },
];

function nextReviewText(t: T, w: ReviewWord): string {
  if (w.intervalDays <= 0) return t("review.next.minutes");
  if (w.intervalDays === 1) return t("review.next.tomorrow");
  return t("review.next.days", { n: w.intervalDays });
}

function dueText(t: T, locale: string, iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  if (mins < 60) return t("review.due.minutes", { n: Math.max(mins, 1) });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("review.due.hours", { n: hours });
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "numeric" });
}

// Two kinds of spaced-repetition cards (SM-2 on the backend):
// - pronunciation: a word the learner said wrongly; Azure scores each try and schedules it.
// - vocab: a new word for the learner's band range; the learner reveals the meaning and
//   rates how well they remembered it (saying it aloud is scored but does not schedule it).
// Two tabs: Due today (the spaced-repetition queue) and Notebook (every card, with the
// learner's own sentences). /review#notebook opens the notebook.
export default function ReviewPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"due" | "notebook">("due");
  useEffect(() => {
    const read = () => setTab(window.location.hash === "#notebook" ? "notebook" : "due");
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  function pick(next: "due" | "notebook") {
    setTab(next);
    history.replaceState(null, "", next === "notebook" ? "#notebook" : window.location.pathname);
  }
  return (
    <AppShell width={720}>
      <div className="fade" style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "safe center", minWidth: 0 }}>
          <div role="tablist" aria-label={t("notebook.tabs")} className="ls-seg">
            {(["due", "notebook"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => pick(k)}>
                <Icon name={k === "due" ? "refresh" : "notebook"} size="sm" />
                {t(k === "due" ? "notebook.tab.due" : "notebook.tab.all")}
              </button>
            ))}
          </div>
        </div>
        {tab === "due" ? <DueReview /> : <NotebookView />}
      </div>
    </AppShell>
  );
}

function DueReview() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery(reviewQuery);
  const goals = useQuery(goalsQuery);
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<ReviewAttempt | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [editGoals, setEditGoals] = useState(false);

  const current = data?.due[0];
  const recorder = useRecorder(
    MAX_WORD_SECONDS,
    (wav) => score(wav),
    (err) => fail(err.message),
  );

  function fail(message: string) {
    setError(message);
    setPhase("error");
  }

  function resetCard() {
    setResult(null);
    setRevealed(false);
    setPhase("ready");
  }

  async function startRecording() {
    setError(null);
    try {
      await recorder.start();
      setPhase("recording");
    } catch {
      fail(t("common.micDenied"));
    }
  }

  function stopRecording() {
    try {
      const wav = recorder.stop();
      if (wav) score(wav);
    } catch (err) {
      fail(err instanceof Error ? err.message : t("common.noAudio"));
    }
  }

  async function score(wav: Blob) {
    if (!current) return;
    setPhase("scoring");
    try {
      setResult(await submitReviewAttempt(current.id, wav));
      setPhase("result");
    } catch (err) {
      fail(err instanceof Error ? err.message : t("common.scoringFailed"));
    }
  }

  function next() {
    resetCard();
    setDone((n) => n + 1);
    queryClient.invalidateQueries({ queryKey: ["review"] });
  }

  async function rate(q: 1 | 3 | 4 | 5) {
    if (!current) return;
    try {
      await gradeReviewWord(current.id, q);
      next();
    } catch (err) {
      fail(err instanceof Error ? err.message : t("review.err.saveShort"));
    }
  }

  async function remove() {
    if (!current) return;
    try {
      await removeReviewWord(current.id);
      resetCard();
      queryClient.invalidateQueries({ queryKey: ["review"] });
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    } catch (err) {
      fail(err instanceof Error ? err.message : t("review.err.removeShort"));
    }
  }

  async function addWords() {
    setAdding(true);
    setAddMsg(null);
    try {
      const added = await addNewWords(NEW_WORDS_PER_BATCH);
      setAddMsg(t("review.added", { n: added.length, words: added.map((w) => w.word).join(", ") }));
      queryClient.invalidateQueries({ queryKey: ["review"] });
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : t("review.err.addWordsShort"));
    } finally {
      setAdding(false);
    }
  }

  const word = result?.word ?? current;
  const isVocab = current != null && current.kind !== "pronunciation"; // vocab and saved cards: self-rated
  const g = goals.data;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* New words for the learner's band range */}
        <div className="ds-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ font: "700 var(--text-base)/1.3 var(--font-display)" }}>{t("review.newWords.title")}</div>
              {g && (
                <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", marginTop: 3 }}>
                  {t("review.goal.status", {
                    band: g.currentBand.toFixed(1),
                    source: t(g.measuredBand > 0 ? "review.goal.measured" : g.selfBand != null ? "review.goal.estimated" : "review.goal.default"),
                    target: g.targetBand != null ? g.targetBand.toFixed(1) : t("review.goal.notSet"),
                    from: (g.bandFrom + 0.5).toFixed(1),
                    to: g.bandTo.toFixed(1),
                    n: g.remaining,
                  })}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => setEditGoals((v) => !v)}>
                {editGoals ? t("common.close") : t("review.goal.change")}
              </button>
              <button className="ds-btn ds-btn-sm" onClick={addWords} disabled={adding || !g || g.remaining === 0}>
                {adding ? t("review.addingWords") : t("review.addWords", { n: NEW_WORDS_PER_BATCH })}
              </button>
            </div>
          </div>
          {g && (editGoals || g.targetBand == null) && (
            <BandGoalForm goals={g} compact={g.targetBand != null} onSaved={() => setEditGoals(false)} />
          )}
          {addMsg && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-secondary)" }}>{addMsg}</div>}
        </div>

        {data && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
            <span>
              {data.dueCount > 0 ? t("review.dueCount", { n: data.dueCount }) : t("review.noneDue")}
              {done > 0 && t("review.doneCount", { n: done })}
            </span>
            <span>{t("review.total", { n: data.total })}</span>
          </div>
        )}

        <div className="ds-card" style={{ padding: 32, minHeight: 300, display: "flex", flexDirection: "column", gap: 16 }}>
          {isLoading && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("common.loading")}</div>}
          {isError && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{t("review.err.load")}</div>}

          {data && !word && (
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", margin: "auto 0" }}>
              <BoltMark size={44} />
              <div style={{ font: "700 var(--text-lg)/1.3 var(--font-display)" }}>{data.total === 0 ? t("review.empty.title") : t("review.allDone.title")}</div>
              {data.total > 0 && <div className="ds-eyebrow" style={{ color: "var(--ds-bolt)", textTransform: "none", letterSpacing: 0 }}>{t("review.allDone.joke")}</div>}
              <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", maxWidth: 460, lineHeight: 1.6 }}>
                {data.total === 0
                  ? t("review.empty.body")
                  : t("review.allDone.body", { when: data.upcoming[0] ? dueText(t, locale, data.upcoming[0].dueAt) : t("review.dueLater") })}
              </div>
              <button className="ds-btn" onClick={() => router.push("/practice")}>
                <Icon name="record" />
                <span>{t("review.practice")}</span>
              </button>
            </div>
          )}

          {word && current && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>
                <span
                  style={{
                    padding: "2px 9px",
                    borderRadius: 99,
                    fontWeight: 600,
                    background: isVocab ? "var(--ds-primary-50)" : "var(--ds-warning-bg)",
                    color: isVocab ? "var(--ds-primary)" : "var(--ds-warning)",
                  }}
                >
                  {current.kind === "saved"
                    ? t("review.badge.saved")
                    : isVocab
                      ? t("review.badge.vocab", { band: current.vocab?.band.toFixed(1) ?? "" })
                      : t("review.badge.pron", { n: current.misses })}
                </span>
                <span>
                  {word.reps > 0 ? t("review.streak", { n: word.reps }) : word.lapses > 0 ? t("review.lapses", { n: word.lapses }) : t("review.newCard")}
                </span>
              </div>

              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                <div style={{ font: "700 var(--text-4xl)/1.3 var(--font-display)", color: "var(--ds-text)" }}>{current.word}</div>
                {current.vocab?.ipa && <div style={{ fontSize: "var(--text-base)", color: "var(--ds-text-muted)" }}>{current.vocab.ipa}</div>}
                <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => speakEnglish(current.word)}>
                  <Icon name="listen" />
                  <span>{t("common.listenSample")}</span>
                </button>
              </div>

              {isVocab && current.vocab && !revealed && (
                <button className="ds-btn ds-btn-lg" onClick={() => setRevealed(true)}>
                  <span>{t("review.reveal")}</span>
                </button>
              )}
              {isVocab && current.vocab && revealed && (
                <div style={{ background: "var(--ds-surface-subtle)", borderRadius: "var(--ds-radius-lg)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: "var(--text-base)" }}>
                    <i style={{ color: "var(--ds-text-muted)" }}>{current.vocab.pos}</i> · <b>{current.vocab.meaning}</b>
                  </div>
                  <div style={{ fontSize: "var(--text-sm)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <button
                      onClick={() => speakEnglish(current.vocab!.exampleEn)}
                      title={t("review.listenExample")}
                      aria-label={t("review.listenExample")}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ds-primary)", padding: 0 }}
                    >
                      <Icon name="listen" />
                    </button>
                    <span>{current.vocab.exampleEn}</span>
                  </div>
                  {current.vocab.exampleTranslation && (
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{current.vocab.exampleTranslation}</div>
                  )}
                </div>
              )}

              {/* Saying the word: scheduled by Azure for pronunciation cards, practice only for vocab cards. */}
              {(!isVocab || revealed) && phase === "ready" && (
                <button
                  onClick={startRecording}
                  className={isVocab ? "ds-btn ds-btn-outline" : "ds-btn ds-btn-lg"}
                  style={{ alignSelf: "center", borderRadius: "var(--ds-radius-full)", padding: "0 24px" }}
                >
                  <Icon name="record" />
                  <span>{isVocab ? t("review.sayToScore") : t("review.pressAndSay", { word: current.word })}</span>
                </button>
              )}
              {phase === "recording" && (
                <button
                  onClick={stopRecording}
                  className="ds-btn ds-btn-lg"
                  style={{ alignSelf: "center", borderRadius: "var(--ds-radius-full)", padding: "0 28px", animation: "recpulse 1.6s infinite" }}
                >
                  <Icon name="stop" />
                  <span>{t("review.stop", { n: MAX_WORD_SECONDS - recorder.secs })}</span>
                </button>
              )}
              {phase === "recording" && recorder.quiet && (
                <div style={{ textAlign: "center", fontSize: "var(--text-sm)", color: "var(--ds-warning)" }}>{t("review.quiet")}</div>
              )}
              {phase === "scoring" && (
                <div style={{ textAlign: "center", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
                  <Icon name="loading" spin style={{ marginRight: 6 }} />
                  {t("review.scoring")}
                </div>
              )}
              {phase === "error" && (
                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{error}</div>
                  <button className="ds-btn ds-btn-outline" onClick={() => setPhase("ready")}>
                    {t("common.retry")}
                  </button>
                </div>
              )}
              {phase === "result" && result && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                  <div style={{ font: "700 var(--text-2xl)/1.3 var(--font-display)", color: scoreColor(result.score) }}>
                    {Math.round(result.score)}/100{!isVocab && ` · ${result.passed ? t("review.passed") : t("review.notPassed")}`}
                  </div>
                  {result.phonemes.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                      {result.phonemes.map((p, i) => (
                        <span
                          key={i}
                          title={`${Math.round(p.score)}/100`}
                          style={{ padding: "3px 8px", borderRadius: 8, background: "var(--ds-surface-subtle)", color: scoreColor(p.score), fontWeight: 600, fontSize: "var(--text-sm)" }}
                        >
                          {phonemeToIpa(p.phoneme)}
                        </span>
                      ))}
                    </div>
                  )}
                  {!isVocab && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{nextReviewText(t, result.word)}</div>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="ds-btn ds-btn-outline" onClick={() => setPhase("ready")}>
                      <Icon name="refresh" />
                      <span>{t("review.again")}</span>
                    </button>
                    {!isVocab && (
                      <button className="ds-btn" onClick={next}>
                        <span>{t("review.nextCard")}</span>
                        <Icon name="next" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isVocab && revealed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("review.howWell")}</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    {RATINGS.map((r) => (
                      <button key={r.q} onClick={() => rate(r.q)} className="ds-btn ds-btn-outline" style={{ color: r.color, borderColor: r.color }}>
                        {t(r.label)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {phase === "ready" && (
                <button
                  onClick={remove}
                  style={{ alignSelf: "center", border: "none", background: "none", cursor: "pointer", fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}
                >
                  {isVocab ? t("review.removeVocab") : t("review.removePron")}
                </button>
              )}
            </>
          )}
        </div>

        {data && data.upcoming.length > 0 && (
          <div className="ds-card" style={{ padding: 22 }}>
            <div style={{ font: "700 var(--text-base)/1.3 var(--font-display)", marginBottom: 8 }}>{t("review.upcoming")}</div>
            {data.upcoming.map((w) => (
              <div key={w.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--ds-border-subtle)", fontSize: "var(--text-sm)" }}>
                <span style={{ flex: 1, fontWeight: 600 }}>
                  {w.word}
                  {w.vocab && <span style={{ fontWeight: 400, color: "var(--ds-text-muted)" }}> · {w.vocab.meaning}</span>}
                </span>
                <span style={{ color: "var(--ds-text-muted)", fontSize: "var(--text-xs)" }}>{w.kind === "vocab" ? t("review.kind.vocab") : w.kind === "saved" ? t("review.kind.saved") : t("review.kind.pron")}</span>
                <span style={{ color: "var(--ds-text-muted)", minWidth: 110, textAlign: "right" }}>{dueText(t, locale, w.dueAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
