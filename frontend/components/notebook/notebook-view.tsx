"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/icon";
import { useRecorder } from "@/lib/use-recorder";
import { scoreColor } from "@/lib/score-color";
import { removeReviewWord } from "@/lib/review-api";
import {
  gradeSentence,
  notebookQuery,
  playTts,
  saveToNotebook,
  sentencesQuery,
  speakSentence,
  type NotebookCard,
  type NotebookSentence,
  type SpeakResult,
} from "@/lib/listening-api";

// The word notebook (LISTEN-001): every card of the learner (saved words and phrases, new
// words, words said wrongly). A card shows the meaning, IPA, Azure pronunciation and the
// example; the learner writes their own sentence, the AI grades it (a pass replaces the
// example), and they can read it aloud for an Azure pronunciation score.

type Filter = "all" | "saved" | "vocab" | "pronunciation";
const FILTERS: Filter[] = ["all", "saved", "vocab", "pronunciation"];
const FILTER_LABEL = { all: "notebook.filter.all", saved: "notebook.filter.saved", vocab: "notebook.filter.vocab", pronunciation: "notebook.filter.pron" } as const;
const MAX_SPEAK_SECONDS = 15;

export function NotebookView() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery(notebookQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [add, setAdd] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState("");
  const cards = useMemo(() => q.data?.cards ?? [], [q.data]);
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return cards.filter((c) => (filter === "all" || c.kind === filter) && (!s || c.word.includes(s) || c.meaning.toLowerCase().includes(s)));
  }, [cards, filter, search]);

  async function addWord(e: React.FormEvent) {
    e.preventDefault();
    if (!add.trim()) return;
    setAdding(true);
    setAddMsg("");
    try {
      const r = await saveToNotebook(add);
      setAdd("");
      setOpen(r.card.id);
      setAddMsg(r.lookedUp ? t("listen.save.saved", { word: r.card.word, meaning: r.card.meaning }) : t("listen.save.savedNoMeaning", { word: r.card.word }));
      void qc.invalidateQueries({ queryKey: ["notebook"] });
      void qc.invalidateQueries({ queryKey: ["review"] });
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : t("notebook.err.save"));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <form className="ds-card" onSubmit={addWord} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <label className="ls-field" htmlFor="nb-add">
          {t("notebook.add.label")}
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input id="nb-add" className="ds-input" value={add} onChange={(e) => setAdd(e.target.value)} placeholder={t("notebook.add.placeholder")} maxLength={60} style={{ flex: 1, minWidth: 180 }} />
          <button type="submit" className="ds-btn" disabled={adding || !add.trim()}>
            <Icon name={adding ? "loading" : "bookmark"} spin={adding} />
            <span>{adding ? t("notebook.add.saving") : t("notebook.add.button")}</span>
          </button>
        </div>
        {addMsg && (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-secondary)" }} aria-live="polite">
            {addMsg}
          </div>
        )}
      </form>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div role="radiogroup" aria-label={t("notebook.filter")} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} className="ls-chip" onClick={() => setFilter(f)}>
              {t(FILTER_LABEL[f])}
            </button>
          ))}
        </div>
        <input className="ds-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("notebook.search")} aria-label={t("notebook.search")} style={{ flex: 1, minWidth: 160 }} />
      </div>

      {q.isLoading && <div style={{ color: "var(--ds-text-muted)" }}>{t("common.loading")}</div>}
      {q.isError && <div style={{ color: "var(--ds-danger)" }}>{t("notebook.err.load")}</div>}
      {q.data && cards.length === 0 && <div style={{ color: "var(--ds-text-muted)", textAlign: "center", padding: 20 }}>{t("notebook.empty")}</div>}
      {q.data && cards.length > 0 && shown.length === 0 && <div style={{ color: "var(--ds-text-muted)", textAlign: "center", padding: 20 }}>{t("notebook.noMatch")}</div>}
      {q.data && cards.length > 0 && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("notebook.count", { n: shown.length })}</div>}

      <div className="nb-list">
        {shown.map((c) => (
          <NotebookItem key={c.id} card={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} passScore={q.data?.passScore ?? 7} />
        ))}
      </div>
    </div>
  );
}

function NotebookItem({ card, open, onToggle, passScore }: { card: NotebookCard; open: boolean; onToggle: () => void; passScore: number }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const tone = card.kind === "saved" ? "accent" : card.kind === "pronunciation" ? "warn" : undefined;

  async function relookup() {
    setBusy(true);
    try {
      await saveToNotebook(card.word, card.context, card.lessonId);
      void qc.invalidateQueries({ queryKey: ["notebook"] });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("notebook.confirmRemove", { word: card.word }))) return;
    await removeReviewWord(card.id);
    void qc.invalidateQueries({ queryKey: ["notebook"] });
    void qc.invalidateQueries({ queryKey: ["review"] });
  }

  return (
    <div className="ds-card nb-item">
      <button type="button" className="nb-head" onClick={onToggle} aria-expanded={open} aria-label={open ? t("notebook.close") : t("notebook.open", { word: card.word })}>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="nb-word">{card.word}</span>
            <span className="ls-tag" data-tone={tone}>
              {t(`notebook.kind.${card.kind}`)}
            </span>
            {card.exampleMine && (
              <span className="ls-tag" data-tone="good">
                <Icon name="pen" size="sm" />
              </span>
            )}
          </span>
          <span className="nb-mean">{card.meaning || t("notebook.noMeaning")}</span>
        </span>
        <Icon name={open ? "chevronUp" : "chevronDown"} />
      </button>
      {open && (
        <div className="nb-body">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingTop: 10 }}>
            {card.ipa && <span style={{ color: "var(--ds-text-muted)" }}>{card.ipa}</span>}
            {card.pos && <i style={{ color: "var(--ds-text-muted)" }}>{card.pos}</i>}
            {card.band > 0 && <span className="ls-tag">Band {card.band.toFixed(1)}</span>}
            <span style={{ flex: 1 }} />
            <button type="button" className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => void playTts(card.word).catch(() => undefined)}>
              <Icon name="listen" />
              <span>{t("notebook.listen")}</span>
            </button>
            <button type="button" className="ls-round" onClick={() => void playTts(card.word, { slow: true }).catch(() => undefined)} aria-label={t("notebook.listenSlow")} title={t("notebook.listenSlow")}>
              <Icon name="listenSlow" />
            </button>
          </div>
          {card.meaning ? (
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>{card.meaning}</div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ color: "var(--ds-text-muted)" }}>{t("notebook.noMeaning")}</span>
              <button type="button" className="ds-btn ds-btn-outline ds-btn-sm" onClick={relookup} disabled={busy}>
                <Icon name={busy ? "loading" : "refresh"} spin={busy} />
                <span>{t("notebook.retryLookup")}</span>
              </button>
            </div>
          )}
          {card.exampleEn && (
            <div className="nb-box">
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: card.exampleMine ? "var(--ds-success)" : "var(--ds-text-muted)" }}>
                {card.exampleMine ? t("notebook.exampleMine", { score: card.exampleScore ?? "" }) : t("notebook.example")}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <button type="button" className="ls-line-play" onClick={() => void playTts(card.exampleEn).catch(() => undefined)} aria-label={t("notebook.listenExample")} title={t("notebook.listenExample")} style={{ marginTop: -10 }}>
                  <Icon name="listen" size="sm" />
                </button>
                <span>{card.exampleEn}</span>
              </div>
            </div>
          )}
          {card.context && (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
              <b>{t("notebook.context")}:</b> “{card.context}”
              {card.lessonId && card.lessonTitle && (
                <>
                  {" · "}
                  <Link href={`/listen/${card.lessonId}`} style={{ color: "var(--ds-primary)" }}>
                    {t("notebook.fromLesson", { title: card.lessonTitle })}
                  </Link>
                </>
              )}
            </div>
          )}
          <SentencePractice card={card} passScore={passScore} />
          <button type="button" className="ds-btn ds-btn-text" onClick={remove} style={{ alignSelf: "flex-start", color: "var(--ds-text-muted)" }}>
            <Icon name="trash" />
            <span>{t("notebook.remove")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function SentencePractice({ card, passScore }: { card: NotebookCard; passScore: number }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const history = useQuery(sentencesQuery(card.id));
  const [text, setText] = useState("");
  const [grading, setGrading] = useState(false);
  const [err, setErr] = useState("");
  const [last, setLast] = useState<NotebookSentence | null>(null);

  async function grade(e: React.FormEvent) {
    e.preventDefault();
    setGrading(true);
    setErr("");
    try {
      const s = await gradeSentence(card.id, text);
      setLast(s);
      if (s.accepted) setText("");
      void qc.invalidateQueries({ queryKey: ["notebook"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("notebook.err.grade"));
    } finally {
      setGrading(false);
    }
  }

  const past = (history.data?.sentences ?? []).filter((s) => s.id !== last?.id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <form onSubmit={grade} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label className="ls-field" htmlFor={`nb-write-${card.id}`}>
          {t("notebook.write.title")}
        </label>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("notebook.write.hint", { word: card.word, n: passScore })}</span>
        <textarea
          id={`nb-write-${card.id}`}
          className="ls-textarea"
          style={{ minHeight: 80 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("notebook.write.placeholder", { word: card.word })}
          maxLength={300}
        />
        <button type="submit" className="ds-btn" disabled={grading || text.trim().split(/\s+/).length < 3} style={{ alignSelf: "flex-start" }}>
          <Icon name={grading ? "loading" : "ai"} spin={grading} />
          <span>{grading ? t("notebook.write.grading") : t("notebook.write.submit")}</span>
        </button>
        {err && <div style={{ color: "var(--ds-danger)", fontSize: "var(--text-sm)" }}>{err}</div>}
      </form>
      {last && <SentenceResult s={last} />}
      {past.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 44, display: "flex", alignItems: "center" }}>{t("notebook.history")}</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {past.map((s) => (
              <SentenceResult key={s.id} s={s} compact />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function SentenceResult({ s, compact = false }: { s: NotebookSentence; compact?: boolean }) {
  const { t } = useI18n();
  const v = s.verdict;
  return (
    <div className="nb-box" aria-live={compact ? undefined : "polite"}>
      <div style={{ fontWeight: 700, color: s.accepted ? "var(--ds-success)" : "var(--ds-warning)" }}>
        {s.accepted ? t("notebook.verdict.passed", { score: s.score }) : t("notebook.verdict.notPassed", { score: s.score })}
      </div>
      <div>“{s.text}”</div>
      {!compact && (
        <div className="nb-checks">
          {(["usesTarget", "meaningOk", "grammarOk", "natural"] as const).map((k) => (
            <span key={k} className="ls-tag" data-tone={v[k] ? "good" : "bad"}>
              <Icon name={v[k] ? "check" : "close"} size="sm" />
              {t(`notebook.check.${k}`)}
            </span>
          ))}
        </div>
      )}
      {v.corrected && v.corrected !== s.text && (
        <div>
          <b>{t("notebook.verdict.corrected")}:</b> {v.corrected}
        </div>
      )}
      {v.feedback && <div style={{ color: "var(--ds-text-secondary)", fontSize: "var(--text-sm)" }}>{v.feedback}</div>}
      <ReadAloud sentence={s} />
    </div>
  );
}

function ReadAloud({ sentence }: { sentence: NotebookSentence }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"idle" | "recording" | "scoring" | "error">("idle");
  const [res, setRes] = useState<SpeakResult | null>(null);
  const [err, setErr] = useState("");
  const recorder = useRecorder(MAX_SPEAK_SECONDS, (wav) => score(wav), (e) => fail(e.message));

  function fail(m: string) {
    setErr(m);
    setPhase("error");
  }

  async function score(wav: Blob) {
    setPhase("scoring");
    try {
      setRes(await speakSentence(sentence.id, wav));
      setPhase("idle");
    } catch (e) {
      fail(e instanceof Error ? e.message : t("common.scoringFailed"));
    }
  }

  async function start() {
    setErr("");
    try {
      await recorder.start();
      setPhase("recording");
    } catch {
      fail(t("common.micDenied"));
    }
  }

  function stop() {
    try {
      const wav = recorder.stop();
      if (wav) void score(wav);
    } catch (e) {
      fail(e instanceof Error ? e.message : t("common.noAudio"));
    }
  }

  const pron = res?.score ?? sentence.pronScore;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {phase === "recording" ? (
          <button type="button" className="ds-btn ds-btn-sm" onClick={stop} style={{ animation: "recpulse 1.6s infinite" }}>
            <Icon name="stop" />
            <span>{t("notebook.speak.stop", { n: MAX_SPEAK_SECONDS - recorder.secs })}</span>
          </button>
        ) : (
          <button type="button" className="ds-btn ds-btn-outline ds-btn-sm" onClick={start} disabled={phase === "scoring"}>
            <Icon name={phase === "scoring" ? "loading" : "record"} spin={phase === "scoring"} />
            <span>{phase === "scoring" ? t("notebook.speak.scoring") : t("notebook.speak")}</span>
          </button>
        )}
        <button type="button" className="ls-round" onClick={() => void playTts(sentence.text).catch(() => undefined)} aria-label={t("notebook.listenExample")} title={t("notebook.listenExample")}>
          <Icon name="listen" />
        </button>
        {pron != null && <span style={{ fontWeight: 700, color: scoreColor(pron) }}>{t("notebook.speak.result", { n: Math.round(pron) })}</span>}
      </div>
      {phase === "recording" && recorder.quiet && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-warning)" }}>{t("notebook.speak.quiet")}</div>}
      {phase === "error" && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{err}</div>}
      {res?.words && res.words.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {res.words
            .filter((w) => w.errorType !== "insertion")
            .map((w, i) => (
              <span key={i} title={`${Math.round(w.accuracyScore)}/100`} style={{ color: w.errorType === "omission" ? "var(--ds-text-muted)" : scoreColor(w.accuracyScore), fontWeight: 600 }}>
                {w.word}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
