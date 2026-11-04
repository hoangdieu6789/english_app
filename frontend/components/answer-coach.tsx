"use client";

import { useState } from "react";
import { useFeedbackLang } from "@/lib/feedback-lang";
import { fetchSampleAnswer, improveAnswer, type ImprovedAnswer, type SampleAnswer } from "@/lib/pronunciation-api";
import { speakEnglish } from "@/lib/text-to-speech";

function Listen({ text }: { text: string }) {
  return (
    <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => speakEnglish(text)}>
      <i className="pi pi-volume-up" />
      <span>Nghe</span>
    </button>
  );
}

/** A model answer to the question at the learner's target band (cached on the server). */
export function SampleAnswerBox({ taskType, question }: { taskType: string; question: string }) {
  const [lang] = useFeedbackLang();
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
      setError(err instanceof Error ? err.message : "AI chưa viết được câu trả lời mẫu.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={load}>
        <i className="pi pi-lightbulb" />
        <span>Xem câu trả lời mẫu</span>
      </button>
    );
  }
  return (
    <div style={{ textAlign: "left", background: "var(--ds-surface-subtle)", borderRadius: "var(--ds-radius-lg)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 14 }}>Câu trả lời mẫu{sample ? ` · band ${sample.band.toFixed(1)}` : ""}</b>
        <div style={{ display: "flex", gap: 6 }}>
          {sample && <Listen text={sample.answer} />}
          <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => setOpen(false)}>
            Ẩn
          </button>
        </div>
      </div>
      {loading && (
        <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>
          <i className="pi pi-spinner" style={{ animation: "spin 1s linear infinite", marginRight: 6 }} />
          AI đang viết câu trả lời mẫu (lần đầu khoảng 10–30 giây)...
        </div>
      )}
      {error && <div style={{ fontSize: 13, color: "var(--ds-danger)" }}>{error}</div>}
      {sample && (
        <>
          <div style={{ fontSize: 15, lineHeight: 1.7 }}>{sample.answer}</div>
          {sample.phrases.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13.5 }}>
              <b style={{ fontSize: 13 }}>Cụm từ nên dùng</b>
              {sample.phrases.map((p) => (
                <div key={p.phrase}>
                  <span style={{ fontWeight: 600, color: "var(--ds-primary)" }}>{p.phrase}</span>
                  <span style={{ color: "var(--ds-text-muted)" }}> · {p.meaning}</span>
                </div>
              ))}
            </div>
          )}
          {sample.tips.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--ds-text-secondary)", lineHeight: 1.6 }}>
              {sample.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Dùng để học ý và cách diễn đạt; trả lời bằng ý của chính bạn khi luyện.</div>
        </>
      )}
    </div>
  );
}

/** The learner's answer rewritten at their target band, with the main changes. */
export function ImprovedAnswerBox({ attemptId, initial }: { attemptId: string; initial: ImprovedAnswer | null }) {
  const [lang] = useFeedbackLang();
  const [improved, setImproved] = useState<ImprovedAnswer | null>(initial && initial.lang === lang ? initial : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setImproved(await improveAnswer(attemptId, lang));
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI chưa viết lại được.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ds-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ font: "700 16px var(--font-display)" }}>Câu trả lời của bạn, bản tốt hơn</div>
          <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginTop: 3 }}>
            AI giữ ý của bạn, sửa ngữ pháp và nâng từ vựng lên band mục tiêu.
          </div>
        </div>
        {!improved && (
          <button className="ds-btn ds-btn-sm" onClick={load} disabled={loading}>
            <i className={loading ? "pi pi-spinner" : "pi pi-sparkles"} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            <span>{loading ? "AI đang viết lại..." : "Viết lại câu trả lời"}</span>
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: 13, color: "var(--ds-danger)" }}>{error}</div>}
      {improved && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: 1, fontSize: 15, lineHeight: 1.7, background: "var(--ds-surface-subtle)", borderRadius: "var(--ds-radius-lg)", padding: "12px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-text-muted)", marginBottom: 4 }}>Band {improved.band.toFixed(1)}</div>
              {improved.improved}
            </div>
            <Listen text={improved.improved} />
          </div>
          {improved.changes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {improved.changes.map((c, i) => (
                <div key={i} style={{ fontSize: 13.5, lineHeight: 1.6 }}>
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
