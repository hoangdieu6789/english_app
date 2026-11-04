"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { fetchSampleAnswer, improveAnswer, type ImprovedAnswer, type SampleAnswer } from "@/lib/pronunciation-api";
import { speakEnglish } from "@/lib/text-to-speech";

function Listen({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => speakEnglish(text)}>
      <i className="pi pi-volume-up" />
      <span>{t("common.listen")}</span>
    </button>
  );
}

/** A model answer to the question at the learner's target band (cached on the server). */
export function SampleAnswerBox({ taskType, question }: { taskType: string; question: string }) {
  const { lang, t } = useI18n();
  const [sample, setSample] = useState<SampleAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    setOpen(true);
    if (sample) return;
    setLoading(true);
    setError(null);
    try {
      setSample(await fetchSampleAnswer(taskType, question, lang));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("coach.sampleFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={load}>
        <i className="pi pi-lightbulb" />
        <span>{t("coach.showSample")}</span>
      </button>
    );
  }
  return (
    <div style={{ textAlign: "left", background: "var(--ds-surface-subtle)", borderRadius: "var(--ds-radius-lg)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: "var(--text-sm)" }}>{t("coach.sampleTitle")}
          {sample ? t("coach.sampleBand", { band: sample.band.toFixed(1) }) : ""}</b>
        <div style={{ display: "flex", gap: 6 }}>
          {sample && <Listen text={sample.answer} />}
          <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => setOpen(false)}>
            {t("common.hide")}
          </button>
        </div>
      </div>
      {loading && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
          <i className="pi pi-spinner" style={{ animation: "spin 1s linear infinite", marginRight: 6 }} />
          {t("coach.sampleLoading")}
        </div>
      )}
      {error && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{error}</div>}
      {sample && (
        <>
          <div style={{ fontSize: "var(--text-base)", lineHeight: 1.7 }}>{sample.answer}</div>
          {sample.phrases.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-sm)" }}>
              <b style={{ fontSize: "var(--text-sm)" }}>{t("coach.phrases")}</b>
              {sample.phrases.map((p) => (
                <div key={p.phrase}>
                  <span style={{ fontWeight: 600, color: "var(--ds-primary)" }}>{p.phrase}</span>
                  <span style={{ color: "var(--ds-text-muted)" }}> · {p.meaning}</span>
                </div>
              ))}
            </div>
          )}
          {sample.tips.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--text-sm)", color: "var(--ds-text-secondary)", lineHeight: 1.6 }}>
              {sample.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
          <div style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>{t("coach.sampleNote")}</div>
        </>
      )}
    </div>
  );
}

/** The learner's answer rewritten at their target band, with the main changes. */
export function ImprovedAnswerBox({ attemptId, initial }: { attemptId: string; initial: ImprovedAnswer | null }) {
  const { lang, t } = useI18n();
  const [improved, setImproved] = useState<ImprovedAnswer | null>(initial && initial.lang === lang ? initial : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setImproved(await improveAnswer(attemptId, lang));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("coach.improveFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ds-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ font: "700 var(--text-base)/1.3 var(--font-display)" }}>{t("coach.improvedTitle")}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", marginTop: 3 }}>
            {t("coach.improvedHint")}
          </div>
        </div>
        {!improved && (
          <button className="ds-btn ds-btn-sm" onClick={load} disabled={loading}>
            <i className={loading ? "pi pi-spinner" : "pi pi-sparkles"} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            <span>{loading ? t("coach.improving") : t("coach.improve")}</span>
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{error}</div>}
      {improved && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: 1, fontSize: "var(--text-base)", lineHeight: 1.7, background: "var(--ds-surface-subtle)", borderRadius: "var(--ds-radius-lg)", padding: "12px 14px" }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--ds-text-muted)", marginBottom: 4 }}>{t("coach.band", { band: improved.band.toFixed(1) })}</div>
              {improved.improved}
            </div>
            <Listen text={improved.improved} />
          </div>
          {improved.changes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {improved.changes.map((c, i) => (
                <div key={i} style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>
                  {c.original && (
                    <>
                      <span style={{ textDecoration: "line-through", color: "var(--ds-danger)" }}>{c.original}</span>
                      {" → "}
                    </>
                  )}
                  <b style={{ color: "var(--ds-success)" }}>{c.improved}</b>
                  <div style={{ color: "var(--ds-text-muted)" }}>{c.reason}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
