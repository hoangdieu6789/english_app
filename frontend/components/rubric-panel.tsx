"use client";

import { hasMessage, useI18n, type MessageKey } from "@/lib/i18n";
import type { PronunciationAttempt, RubricResult } from "@/lib/pronunciation-api";
import { SCORE_AMBER, SCORE_GREEN, SCORE_RED } from "@/lib/score-color";

// Learner-facing names for the IELTS criteria and the Pronunciation features
// (backend/internal/rubric/criteria/*.md), with a fallback to the raw id.
function label(t: (key: MessageKey) => string, prefix: string, id: string) {
  const key = `${prefix}.${id}`;
  return hasMessage(key) ? t(key) : id;
}

// IELTS bands: 7–9 good, 5–6 competent, 1–4 needs work.
function bandColor(band: number) {
  if (band >= 7) return SCORE_GREEN;
  if (band >= 5) return SCORE_AMBER;
  return SCORE_RED;
}

function formatBand(band: number) {
  return Number.isInteger(band) ? `${band}.0` : band.toFixed(1);
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 8, background: "var(--ds-surface-muted)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 99, background: color, width: `${pct}%` }} />
    </div>
  );
}

const LLM_CRITERIA = ["fluency_coherence", "lexical_resource", "grammatical_range_accuracy"];

// pendingSecs: set while the AI is still grading FC/LR/GRA in the background (seconds waited).
export function RubricPanel({
  rubric,
  grader,
  pendingSecs,
}: {
  rubric: RubricResult;
  grader?: PronunciationAttempt["grader"];
  pendingSecs?: number;
}) {
  const { t } = useI18n();
  const criterion = (id: string) => label(t, "rubric.criterion", id);
  const pending = pendingSecs != null;
  const pron = rubric.pronunciation;
  const overall = rubric.overall;
  const ielts = rubric.task_type !== "shadowing";
  const missing = overall.missing ?? [];
  // The rubric averages over the criteria it could assess. For an IELTS part a band from fewer
  // than 3 of the 4 criteria (e.g. a too-short answer: Pronunciation only) is not shown as an
  // overall band; with one missing it is shown as provisional. CEFR only for a complete band.
  const scored = overall.band > 0 && (!ielts || !overall.provisional || missing.length <= 1);
  const showCefr = !!overall.cefr && !overall.provisional;
  const bandLabel = !ielts
    ? t("rubric.bandPronunciation")
    : overall.provisional
      ? t("rubric.bandProvisional", { missing: missing.map(criterion).join(", ") })
      : t("rubric.bandOverall");
  const rows: { id: string; band: number | null }[] = [
    ...rubric.criteria.map((c) => ({ id: c.id, band: c.band })),
    ...(pending ? LLM_CRITERIA.filter((id) => !rubric.criteria.some((c) => c.id === id)).map((id) => ({ id, band: null })) : []),
    ...(pron?.assessed && pron.band ? [{ id: pron.id, band: pron.band }] : []),
  ];
  const notAssessed = pending ? rubric.not_assessed.filter((n) => !LLM_CRITERIA.includes(n.id)) : rubric.not_assessed;
  const mispronounced = pron?.mispronounced_words ?? [];

  return (
    <div className="ds-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ font: "700 16px var(--font-display)" }}>{t("rubric.title")}</div>
          <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>
            IELTS Speaking · {label(t, "rubric.task", rubric.task_type)} · v{rubric.version}
          </div>
          <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }} title={t("rubric.graderNote")}>
            {pending
              ? t("rubric.graderPending", { secs: pendingSecs })
              : grader
              ? t("rubric.gradedBy", { grader: `${grader.provider}${grader.model ? ` · ${grader.model}` : ""}` })
              : rubric.task_type === "shadowing"
                ? t("rubric.gradedByCode")
                : t("rubric.notGraded")}
          </div>
        </div>
        {pending ? (
          <div style={{ textAlign: "right", fontSize: 13, color: "var(--ds-text-muted)" }}>
            <i className="pi pi-spinner" style={{ animation: "spin 1s linear infinite", marginRight: 6 }} />
            {t("rubric.pendingOverall")}
          </div>
        ) : scored ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ font: "700 26px var(--font-display)", color: bandColor(overall.band), lineHeight: 1.1 }}>
                {formatBand(overall.band)}
              </div>
              <div style={{ fontSize: 11, color: "var(--ds-text-muted)" }}>
                {bandLabel}
              </div>
            </div>
            {showCefr && (
              <span
                title={t("rubric.cefrTitle")}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 99,
                  background: "var(--ds-surface-subtle)",
                  color: bandColor(overall.band),
                }}
              >
                ~{overall.cefr}
              </span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 13, color: "var(--ds-text-muted)", textAlign: "right", maxWidth: 220 }}>
            {ielts && overall.band > 0 ? t("rubric.noOverall") : t("rubric.noData")}
          </span>
        )}
      </div>

      {rubric.summary && <div style={{ fontSize: 14, color: "var(--ds-text)", lineHeight: 1.6 }}>{rubric.summary}</div>}

      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {rows.map((r) =>
            r.band == null ? (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, width: 160, color: "var(--ds-text-secondary)" }}>{criterion(r.id)}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 99, background: "var(--ds-surface-muted)", overflow: "hidden" }}>
                  <div style={{ width: "35%", height: "100%", background: "var(--ds-border-strong)", animation: "recpulse 1.6s infinite" }} />
                </div>
                <span style={{ fontSize: 12, width: 30, textAlign: "right", color: "var(--ds-text-muted)" }}>
                  <i className="pi pi-spinner" style={{ fontSize: 11, animation: "spin 1s linear infinite" }} />
                </span>
              </div>
            ) : (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, width: 160, color: "var(--ds-text-secondary)" }}>{criterion(r.id)}</span>
                <Bar pct={(r.band / 9) * 100} color={bandColor(r.band)} />
                <span style={{ fontSize: 12, fontWeight: 600, width: 30, textAlign: "right", color: bandColor(r.band) }}>{r.band}/9</span>
              </div>
            ),
          )}
        </div>
      )}

      {pron && (
        <div style={{ borderTop: "1px solid var(--ds-border-subtle)", paddingTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)", marginBottom: 10 }}>
            {t("rubric.pronunciationCoverage", { coverage: pron.coverage })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
            {pron.items.map((it) => (
              <div
                key={it.code}
                title={it.note}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12.5,
                  padding: "6px 10px",
                  borderRadius: "var(--ds-radius-md)",
                  background: "var(--ds-surface-subtle)",
                  color: it.measured ? "var(--ds-text)" : "var(--ds-text-muted)",
                }}
              >
                <span>{label(t, "rubric.feature", it.code)}</span>
                <span style={{ fontWeight: 600, whiteSpace: "nowrap", marginLeft: 8, color: it.measured && it.band ? bandColor(it.band) : undefined }}>
                  {it.measured && it.band ? `${it.band}/9` : t("rubric.notMeasured")}
                </span>
              </div>
            ))}
          </div>
          {mispronounced.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--ds-text-secondary)" }}>
              {t("rubric.mispronounced")} <span style={{ fontWeight: 600, color: "var(--ds-danger)" }}>{mispronounced.join(", ")}</span>
            </div>
          )}
          {pron.tone_issues && pron.tone_issues.length > 0 && (
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--ds-text-secondary)" }}>
              {pron.tone_issues.map((ti) => (
                <li key={ti.segment_id}>{t(ti.expected === "rise" ? "rubric.toneRise" : "rubric.toneFall", { quote: ti.quote })}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rubric.criteria.some((c) => (c.issues ?? []).length > 0) && (
        <div style={{ borderTop: "1px solid var(--ds-border-subtle)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)" }}>{t("rubric.issuesTitle")}</div>
          {rubric.criteria.flatMap((c) =>
            (c.issues ?? []).map((is, i) => (
              <div key={`${c.id}-${i}`} style={{ fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600, color: "var(--ds-danger)" }}>{is.quote}</span>
                {" → "}
                <span style={{ fontWeight: 600, color: "var(--ds-success)" }}>{is.correction}</span>
                <span style={{ color: "var(--ds-text-muted)" }}> · {is.code}</span>
                <div style={{ color: "var(--ds-text-secondary)" }}>{is.explanation}</div>
              </div>
            )),
          )}
        </div>
      )}

      {notAssessed.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>
          {t("rubric.notAssessed")}{" "}
          {notAssessed
            .map((n) => `${criterion(n.id)} (${label(t, "rubric.reason", n.reason)})`)
            .join(", ")}
        </div>
      )}
    </div>
  );
}
