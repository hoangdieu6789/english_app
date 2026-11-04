"use client";

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { WeeklyLineChart } from "@/components/charts/line-chart";
import { BandGoalForm } from "@/components/band-goal-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasMessage, useI18n, type MessageKey } from "@/lib/i18n";
import { phonemeToIpa } from "@/lib/phonemes";
import { progressQuery, type ProgressSummary } from "@/lib/progress-api";
import { goalsQuery } from "@/lib/review-api";
import { scoreColor } from "@/lib/score-color";

// All numbers come from the learner's own attempts (GET /api/progress/summary).

const WEEKS_SHOWN = 6;

const CRITERIA: { id: string; label: MessageKey }[] = [
  { id: "fluency_coherence", label: "progress.criteria.fluency_coherence" },
  { id: "lexical_resource", label: "progress.criteria.lexical_resource" },
  { id: "grammatical_range_accuracy", label: "progress.criteria.grammatical_range_accuracy" },
  { id: "pronunciation", label: "progress.criteria.pronunciation" },
];

function bandColor(band: number): string {
  if (band >= 7) return "var(--ds-success)";
  if (band >= 5) return "var(--ds-warning)";
  return "var(--ds-danger)";
}

function formatBand(b: number): string {
  return (Math.round(b * 2) / 2).toFixed(1);
}

// Monday of each of the last WEEKS_SHOWN weeks (local dates), oldest first.
function lastWeeks(): string[] {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const out: string[] = [];
  for (let i = WEEKS_SHOWN - 1; i >= 0; i--) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="ds-card" style={{ padding: 24 }}>
      <div style={{ font: "700 var(--text-base)/1.3 var(--font-display)", marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", marginBottom: 16 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", padding: "8px 0" }}>{children}</div>;
}

function Bar({ label, value, max, color, right }: { label: string; value: number; max: number; color: string; right: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 13 }}>
      <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, width: 150 }}>{label}</span>
      <div style={{ flex: 1, height: 10, background: "var(--ds-surface-muted)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 99, background: color, width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
      <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, minWidth: 64, textAlign: "right", color }}>{right}</span>
    </div>
  );
}

function StatCards({ p }: { p: ProgressSummary }) {
  const { t } = useI18n();
  const cards = [
    {
      label: t("progress.stat.streak"),
      icon: "pi pi-bolt",
      color: "var(--ds-warning)",
      value: String(p.streak),
      unit: t("progress.stat.days"),
      note: t("progress.stat.activeDays", { n: p.activeDays }),
    },
    {
      label: t("progress.stat.attempts"),
      icon: "pi pi-microphone",
      color: "var(--ds-info)",
      value: String(p.attempts),
      unit: "",
      note: t("progress.stat.today", { n: p.attemptsToday }),
    },
    {
      label: t("progress.stat.accuracy30"),
      icon: "pi pi-chart-line",
      color: "var(--ds-primary)",
      value: p.last30Days.attempts ? String(Math.round(p.last30Days.accuracy)) : "—",
      unit: p.last30Days.attempts ? "/100" : "",
      note: p.last30Days.attempts
        ? t("progress.stat.fluencyNote", { fluency: Math.round(p.last30Days.fluency), n: p.last30Days.attempts })
        : t("progress.stat.noAttempts"),
    },
    {
      label: t("progress.stat.band30"),
      icon: "pi pi-star",
      color: "var(--ds-success)",
      value: p.last30Days.banded ? formatBand(p.last30Days.band) : "—",
      unit: "",
      note: p.last30Days.banded ? t("progress.stat.bandedCount", { n: p.last30Days.banded }) : t("progress.stat.noBanded"),
    },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
      {cards.map((s) => (
        <div key={s.label} className="ds-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: s.color }}>
            <i className={s.icon} />
            <span style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{s.label}</span>
          </div>
          <div style={{ font: "700 var(--text-3xl)/1.3 var(--font-display)", marginTop: 6 }}>
            {s.value} {s.unit && <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--ds-text-muted)" }}>{s.unit}</span>}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)", marginTop: 2 }}>{s.note}</div>
        </div>
      ))}
    </div>
  );
}

export default function ProgressPage() {
  const { t, locale } = useI18n();
  const { data: p, isError, error } = useQuery(progressQuery);
  const goals = useQuery(goalsQuery);

  if (!p) {
    return (
      <AppShell>
        <div style={{ maxWidth: 1120, margin: "0 auto", fontSize: "var(--text-sm)", color: isError ? "var(--ds-danger)" : "var(--ds-text-muted)" }}>
          {isError ? t("progress.loadFailed", { error: error.message }) : t("progress.loading")}
        </div>
      </AppShell>
    );
  }

  const weeks = lastWeeks();
  const byWeek = new Map(p.weeks.map((w) => [w.start, w]));
  const accuracy = weeks.map((w) => byWeek.get(w)?.accuracy ?? null);
  const fluency = weeks.map((w) => byWeek.get(w)?.fluency ?? null);
  // Day and month in the UI locale (e.g. 03/11 in Vietnamese, 11/03 in US English).
  const weekLabels = weeks.map((w) => {
    const [y, m, d] = w.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
  });
  const taskLabel = (type: string) => {
    const key = `progress.task.${type}`;
    return hasMessage(key) ? t(key) : type;
  };
  const criteria = new Map(p.criteria.map((c) => [c.criterion, c]));
  const graded = p.graders.filter((g) => g.provider);
  const ungraded = p.graders.find((g) => !g.provider)?.attempts ?? 0;

  return (
    <AppShell>
      <div className="fade" style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <StatCards p={p} />

        <div className="ds-card" style={{ padding: 24 }}>
          <div style={{ font: "700 var(--text-base)/1.3 var(--font-display)", marginBottom: 12 }}>{t("progress.goals.title")}</div>
          {goals.data ? <BandGoalForm goals={goals.data} /> : <Empty>{t("common.loading")}</Empty>}
          <div style={{ marginTop: 16 }}>
            <ThemeSwitcher />
            <div style={{ height: 12 }} />
            <LanguageSwitcher sync showHint />
          </div>
        </div>

        <div className="ds-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div>
              <div style={{ font: "700 var(--text-base)/1.3 var(--font-display)" }}>{t("progress.weekly.title")}</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
                {t("progress.weekly.subtitle", { n: WEEKS_SHOWN })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: "var(--text-sm)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--ds-primary)" }} />
                {t("common.accuracy")}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--ds-info)" }} />
                {t("common.fluency")}
              </span>
            </div>
          </div>
          {p.weeks.length ? (
            <WeeklyLineChart weeks={weekLabels} accuracy={accuracy} fluency={fluency} />
          ) : (
            <Empty>{t("progress.weekly.empty", { n: WEEKS_SHOWN })}</Empty>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Card title={t("progress.criteria.title")} subtitle={t("progress.criteria.subtitle")}>
            {p.criteria.length ? (
              CRITERIA.map((c) => {
                const s = criteria.get(c.id);
                return s ? (
                  <Bar
                    key={c.id}
                    label={t(c.label)}
                    value={s.band}
                    max={9}
                    color={bandColor(s.band)}
                    right={t("progress.criteria.samples", { band: formatBand(s.band), n: s.samples })}
                  />
                ) : (
                  <Bar key={c.id} label={t(c.label)} value={0} max={9} color="var(--ds-border-strong)" right={t("progress.criteria.none")} />
                );
              })
            ) : (
              <Empty>{t("progress.criteria.empty")}</Empty>
            )}
          </Card>

          <Card title={t("progress.phonemes.title")} subtitle={t("progress.phonemes.subtitle")}>
            {p.hardPhonemes.length ? (
              p.hardPhonemes.map((ph) => (
                <Bar
                  key={ph.phoneme}
                  label={phonemeToIpa(ph.phoneme)}
                  value={ph.score}
                  max={100}
                  color={scoreColor(ph.score)}
                  right={t("progress.phonemes.samples", { score: Math.round(ph.score), n: ph.samples })}
                />
              ))
            ) : (
              <Empty>{t("progress.phonemes.empty")}</Empty>
            )}
          </Card>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Card title={t("progress.byTask.title")} subtitle={t("progress.byTask.subtitle")}>
            {p.byTask.length ? (
              <table style={{ width: "100%", fontSize: "var(--text-sm)", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--ds-text-muted)", fontSize: "var(--text-xs)", textAlign: "left" }}>
                    <th style={{ fontWeight: 500, paddingBottom: 8 }}>{t("progress.byTask.type")}</th>
                    <th style={{ fontWeight: 500, paddingBottom: 8, textAlign: "right" }}>{t("progress.byTask.count")}</th>
                    <th style={{ fontWeight: 500, paddingBottom: 8, textAlign: "right" }}>{t("progress.byTask.avg")}</th>
                    <th style={{ fontWeight: 500, paddingBottom: 8, textAlign: "right" }}>{t("progress.byTask.best")}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.byTask.map((row) => (
                    <tr key={row.taskType} style={{ borderTop: "1px solid var(--ds-border-subtle)" }}>
                      <td style={{ padding: "8px 0", fontWeight: 600 }}>{taskLabel(row.taskType)}</td>
                      <td style={{ textAlign: "right" }}>{row.attempts}</td>
                      <td style={{ textAlign: "right", color: row.avgBand ? bandColor(row.avgBand) : undefined }}>{row.avgBand ? formatBand(row.avgBand) : "—"}</td>
                      <td style={{ textAlign: "right", color: row.bestBand ? bandColor(row.bestBand) : undefined }}>{row.bestBand ? formatBand(row.bestBand) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>{t("progress.byTask.empty")}</Empty>
            )}
          </Card>

          <Card title={t("progress.graders.title")} subtitle={t("progress.graders.subtitle")}>
            {graded.length || ungraded ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {graded.map((g) => (
                  <div key={`${g.provider}/${g.model}`} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                    <span>
                      <b>{g.provider}</b> <span style={{ color: "var(--ds-text-muted)" }}>{g.model}</span>
                    </span>
                    <span>{t("progress.graders.count", { n: g.attempts })}</span>
                  </div>
                ))}
                {ungraded > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
                    <span>{t("progress.graders.unknown")}</span>
                    <span>{t("progress.graders.count", { n: ungraded })}</span>
                  </div>
                )}
              </div>
            ) : (
              <Empty>{t("progress.graders.empty")}</Empty>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
