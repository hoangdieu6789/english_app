"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { useI18n } from "@/lib/i18n";
import { goalsQuery } from "@/lib/review-api";
import {
  AI_KINDS,
  IMPORT_KINDS,
  deleteLesson,
  generateLesson,
  importLesson,
  lessonsQuery,
  type ImportFields,
  type LessonKind,
  type LessonSource,
  type LessonSummary,
} from "@/lib/listening-api";
import { fmtTime } from "@/components/listening/lesson-audio";

// Listening library (LISTEN-001): one tab per source. AI: make a lesson (kind, topic, band).
// VOA and Mine: add a lesson (audio file, audio link or YouTube link, and a transcript).

const SOURCES: LessonSource[] = ["ai", "voa", "mine"];
const TAB_KEY = "speakup.listen.tab";
const VOA_URL = "https://learningenglish.voanews.com/";
const BANDS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];

export default function ListenPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<LessonSource>("ai");
  useEffect(() => {
    const saved = localStorage.getItem(TAB_KEY) as LessonSource | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the tab is read once from the browser
    if (saved && SOURCES.includes(saved)) setTab(saved);
  }, []);
  function pick(s: LessonSource) {
    setTab(s);
    localStorage.setItem(TAB_KEY, s);
  }

  return (
    <AppShell width={980}>
      <div className="fade" style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "safe center", minWidth: 0 }}>
          <div role="tablist" aria-label={t("listen.tabs")} className="ls-seg">
            {SOURCES.map((s) => (
              <button key={s} type="button" role="tab" id={`tab-${s}`} aria-controls="lesson-panel" aria-selected={tab === s} onClick={() => pick(s)}>
                <Icon name={s === "ai" ? "ai" : s === "voa" ? "headphones" : "upload"} size="sm" />
                {t(`listen.tab.${s}`)}
              </button>
            ))}
          </div>
        </div>
        <div id="lesson-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <p style={{ margin: 0, color: "var(--ds-text-muted)", textAlign: "center" }}>{t(`listen.tabHint.${tab}`)}</p>
          <Library key={tab} source={tab} />
        </div>
      </div>
    </AppShell>
  );
}

function Library({ source }: { source: LessonSource }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({
    ...lessonsQuery(source),
    // Poll while an AI lesson is being made.
    refetchInterval: (query) => (query.state.data?.lessons.some((l) => l.status === "pending") ? 5000 : false),
  });
  const lessons = q.data?.lessons ?? [];

  async function remove(l: LessonSummary) {
    if (!window.confirm(t("listen.confirmDelete", { title: l.title }))) return;
    try {
      await deleteLesson(l.id);
      void qc.invalidateQueries({ queryKey: ["lessons", source] });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t("listen.err.delete"));
    }
  }

  return (
    <>
      {source === "ai" ? <NewLessonForm canGenerate={q.data?.canGenerate ?? true} /> : <ImportForm source={source} />}
      {q.isError && <div style={{ color: "var(--ds-danger)" }}>{t("listen.err.load")}</div>}
      {q.isLoading && <div style={{ color: "var(--ds-text-muted)" }}>{t("common.loading")}</div>}
      {q.data && lessons.length === 0 && <div style={{ color: "var(--ds-text-muted)", textAlign: "center", padding: 20 }}>{t(`listen.empty.${source}`)}</div>}
      <div className="ls-grid">
        {lessons.map((l) => (
          <LessonCard key={l.id} l={l} onDelete={() => remove(l)} />
        ))}
      </div>
    </>
  );
}

function LessonCard({ l, onDelete }: { l: LessonSummary; onDelete: () => void }) {
  const { t } = useI18n();
  const body = (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span className="ls-tag" data-tone="accent">
          {t(`listen.kind.${l.kind}`)}
        </span>
        {l.band > 0 && <span className="ls-tag">Band {l.band.toFixed(1)}</span>}
        {l.status === "pending" && (
          <span className="ls-tag" data-tone="warn">
            <Icon name="loading" size="sm" spin /> {t("listen.status.pending")}
          </span>
        )}
        {l.status === "failed" && (
          <span className="ls-tag" data-tone="bad">
            {t("listen.status.failed")}
          </span>
        )}
      </div>
      <div style={{ font: "700 var(--text-lg)/1.3 var(--font-display)" }}>{l.title}</div>
      <div className="ls-meta">
        {l.durationSec > 0 && <span>{fmtTime(l.durationSec)}</span>}
        {l.lines > 0 && <span>{t("listen.lines", { n: l.lines })}</span>}
        {l.progress?.listenedAt && <span>{t("listen.listened")}</span>}
        {l.progress?.dictationBest != null && <span>{t("listen.best", { n: Math.round(l.progress.dictationBest) })}</span>}
      </div>
      {l.status === "failed" && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{t("listen.err.failedLesson", { error: l.error })}</div>}
      {l.credit && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("listen.credit", { credit: l.credit })}</div>}
    </>
  );
  return (
    <div style={{ position: "relative" }}>
      {l.status === "ready" ? (
        <Link href={`/listen/${l.id}`} className="ds-card ls-lesson" aria-label={`${t("listen.open")}: ${l.title}`}>
          {body}
        </Link>
      ) : (
        <div className="ds-card ls-lesson">{body}</div>
      )}
      {l.canDelete && (
        <button type="button" className="ls-round" onClick={onDelete} aria-label={t("listen.delete")} title={t("listen.delete")} style={{ position: "absolute", top: 10, right: 10 }}>
          <Icon name="trash" size="sm" />
        </button>
      )}
    </div>
  );
}

function NewLessonForm({ canGenerate }: { canGenerate: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const goals = useQuery(goalsQuery);
  const [kind, setKind] = useState<LessonKind>("podcast");
  const [topic, setTopic] = useState("");
  const [band, setBand] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const myBand = band ?? Math.min(8, Math.max(4, Math.round((goals.data?.currentBand ?? 5.5) * 2) / 2));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await generateLesson(kind, topic, myBand);
      setTopic("");
      void qc.invalidateQueries({ queryKey: ["lessons", "ai"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("listen.err.generate"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ds-card" onSubmit={submit} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ font: "700 var(--text-base)/1.3 var(--font-display)" }}>{t("listen.new.title")}</div>
      <div role="radiogroup" aria-label={t("listen.new.kind")} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {AI_KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className="ls-chip" onClick={() => setKind(k)}>
            {t(`listen.kind.${k}`)}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "end" }}>
        <label className="ls-field">
          {t("listen.new.topic")}
          <input className="ds-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("listen.new.topicPh")} maxLength={80} />
        </label>
        <label className="ls-field">
          {t("listen.new.band")}
          <select className="ls-select" value={myBand} onChange={(e) => setBand(Number(e.target.value))}>
            {BANDS.map((b) => (
              <option key={b} value={b}>
                {b.toFixed(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="ds-btn" disabled={busy || !canGenerate}>
          <Icon name={busy ? "loading" : "ai"} spin={busy} />
          <span>{busy ? t("listen.new.making") : t("listen.new.submit")}</span>
        </button>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", flex: 1, minWidth: 200 }}>{canGenerate ? t("listen.new.hint") : t("listen.new.off")}</span>
      </div>
      {err && <div style={{ color: "var(--ds-danger)", fontSize: "var(--text-sm)" }}>{err}</div>}
    </form>
  );
}

const EMPTY = (source: "voa" | "mine"): ImportFields => ({
  source,
  kind: source === "voa" ? "news" : "other",
  title: "",
  transcript: "",
  audioUrl: "",
  videoUrl: "",
  sourceUrl: "",
  file: null,
});

function ImportForm({ source }: { source: "voa" | "mine" }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [f, setF] = useState<ImportFields>(EMPTY(source));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof ImportFields>(k: K, v: ImportFields[K]) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.file && !f.audioUrl.trim() && !f.videoUrl.trim()) {
      setErr(t("listen.add.needAudio"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await importLesson(f);
      setF(EMPTY(source));
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["lessons", source] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("listen.err.import"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="ds-card" style={{ padding: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="ds-btn" onClick={() => setOpen(true)}>
          <Icon name="upload" />
          <span>{t("listen.add.title")}</span>
        </button>
        {source === "voa" && (
          <a className="ds-btn ds-btn-outline" href={VOA_URL} target="_blank" rel="noopener noreferrer">
            <Icon name="externalLink" />
            <span>{t("listen.add.voaOpen")}</span>
          </a>
        )}
        <span style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", flex: 1, minWidth: 200 }}>{t(source === "voa" ? "listen.add.voaNote" : "listen.add.mineNote")}</span>
      </div>
    );
  }

  return (
    <form className="ds-card" onSubmit={submit} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ font: "700 var(--text-base)/1.3 var(--font-display)" }}>{t("listen.add.title")}</div>
        <button type="button" className="ls-round" onClick={() => setOpen(false)} aria-label={t("common.close")}>
          <Icon name="close" />
        </button>
      </div>
      {source === "voa" && <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("listen.add.voaSteps")}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "end" }}>
        <label className="ls-field">
          {t("listen.add.titleField")}
          <input className="ds-input" required value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={120} />
        </label>
        <label className="ls-field">
          {t("listen.add.kind")}
          <select className="ls-select" value={f.kind} onChange={(e) => set("kind", e.target.value as LessonKind)}>
            {IMPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`listen.kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="ls-field">
        {t("listen.add.file")}
        <input className="ds-input" type="file" accept=".mp3,.m4a,.wav,.ogg,.webm,.aac,audio/*" onChange={(e) => set("file", e.target.files?.[0] ?? null)} />
      </label>
      <label className="ls-field">
        {t("listen.add.audioUrl")}
        <input className="ds-input" type="url" inputMode="url" value={f.audioUrl} onChange={(e) => set("audioUrl", e.target.value)} placeholder="https://…/story.mp3" />
      </label>
      {source === "mine" && (
        <label className="ls-field">
          {t("listen.add.videoUrl")}
          <input className="ds-input" type="url" inputMode="url" value={f.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
        </label>
      )}
      <label className="ls-field">
        {t("listen.add.sourceUrl")}
        <input className="ds-input" type="url" inputMode="url" value={f.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder={source === "voa" ? "https://learningenglish.voanews.com/a/…" : "https://…"} />
      </label>
      <label className="ls-field">
        {t("listen.add.transcript")}
        <textarea className="ls-textarea" value={f.transcript} onChange={(e) => set("transcript", e.target.value)} maxLength={20000} />
        <span style={{ fontWeight: 400, color: "var(--ds-text-muted)" }}>{t("listen.add.transcriptHint")}</span>
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="ds-btn" disabled={busy}>
          <Icon name={busy ? "loading" : "upload"} spin={busy} />
          <span>{busy ? t("listen.add.adding") : t("listen.add.submit")}</span>
        </button>
        {err && <span style={{ color: "var(--ds-danger)", fontSize: "var(--text-sm)" }}>{err}</span>}
      </div>
    </form>
  );
}
