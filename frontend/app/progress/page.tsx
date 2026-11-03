"use client";

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { WeeklyLineChart } from "@/components/charts/line-chart";
import { phonemeToIpa } from "@/lib/phonemes";
import { progressQuery, type ProgressSummary } from "@/lib/progress-api";
import { scoreColor } from "@/lib/score-color";

// All numbers come from the learner's own attempts (GET /api/progress/summary).

const WEEKS_SHOWN = 6;

const CRITERIA: { id: string; label: string }[] = [
  { id: "fluency_coherence", label: "Trôi chảy & mạch lạc" },
  { id: "lexical_resource", label: "Từ vựng" },
  { id: "grammatical_range_accuracy", label: "Ngữ pháp" },
  { id: "pronunciation", label: "Phát âm" },
];

const TASKS: Record<string, string> = {
  shadowing: "Shadowing",
  part1: "IELTS Part 1",
  part2: "IELTS Part 2",
  part3: "IELTS Part 3",
  full_test: "Thi thử",
};

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
      <div style={{ font: "700 17px var(--font-display)", marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginBottom: 16 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--ds-text-muted)", padding: "8px 0" }}>{children}</div>;
}

function Bar({ label, value, max, color, right }: { label: string; value: number; max: number; color: string; right: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 13 }}>
      <span style={{ fontSize: 14, fontWeight: 600, width: 150 }}>{label}</span>
      <div style={{ flex: 1, height: 10, background: "var(--ds-surface-muted)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 99, background: color, width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 64, textAlign: "right", color }}>{right}</span>
    </div>
  );
}

function StatCards({ p }: { p: ProgressSummary }) {
  const cards = [
    {
      label: "Streak",
      icon: "pi pi-bolt",
      color: "var(--ds-warning)",
      value: String(p.streak),
      unit: "ngày",
      note: `${p.activeDays} ngày đã luyện`,
    },
    {
      label: "Bài đã luyện",
      icon: "pi pi-microphone",
      color: "var(--ds-info)",
      value: String(p.attempts),
      unit: "",
      note: `hôm nay ${p.attemptsToday}`,
    },
    {
      label: "Chính xác TB (30 ngày)",
      icon: "pi pi-chart-line",
      color: "var(--ds-primary)",
      value: p.last30Days.attempts ? String(Math.round(p.last30Days.accuracy)) : "—",
      unit: p.last30Days.attempts ? "/100" : "",
      note: p.last30Days.attempts ? `trôi chảy ${Math.round(p.last30Days.fluency)} · ${p.last30Days.attempts} bài` : "chưa có bài",
    },
    {
      label: "Band IELTS TB (30 ngày)",
      icon: "pi pi-star",
      color: "var(--ds-success)",
      value: p.last30Days.banded ? formatBand(p.last30Days.band) : "—",
      unit: "",
      note: p.last30Days.banded ? `${p.last30Days.banded} bài IELTS có band` : "chưa có bài IELTS có band",
    },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
      {cards.map((s) => (
        <div key={s.label} className="ds-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: s.color }}>
            <i className={s.icon} />
            <span style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>{s.label}</span>
          </div>
          <div style={{ font: "700 30px var(--font-display)", marginTop: 6 }}>
            {s.value} {s.unit && <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ds-text-muted)" }}>{s.unit}</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--ds-text-muted)", marginTop: 2 }}>{s.note}</div>
        </div>
      ))}
    </div>
  );
}

export default function ProgressPage() {
  const { data: p, isError, error } = useQuery(progressQuery);

  if (!p) {
    return (
      <AppShell>
        <div style={{ maxWidth: 1120, margin: "0 auto", fontSize: 14, color: isError ? "var(--ds-danger)" : "var(--ds-text-muted)" }}>
          {isError ? `Không tải được tiến độ. ${error.message}` : "Đang tải tiến độ..."}
        </div>
      </AppShell>
    );
  }

  const weeks = lastWeeks();
  const byWeek = new Map(p.weeks.map((w) => [w.start, w]));
  const accuracy = weeks.map((w) => byWeek.get(w)?.accuracy ?? null);
  const fluency = weeks.map((w) => byWeek.get(w)?.fluency ?? null);
  const weekLabels = weeks.map((w) => {
    const [, m, d] = w.split("-");
    return `${d}/${m}`;
  });
  const criteria = new Map(p.criteria.map((c) => [c.criterion, c]));
  const graded = p.graders.filter((g) => g.provider);
  const ungraded = p.graders.find((g) => !g.provider)?.attempts ?? 0;

  return (
    <AppShell>
      <div className="fade" style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <StatCards p={p} />

        <div className="ds-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div>
              <div style={{ font: "700 17px var(--font-display)" }}>Chính xác &amp; trôi chảy theo tuần</div>
              <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>
                Điểm Azure trung bình (0–100), {WEEKS_SHOWN} tuần gần nhất, tuần bắt đầu thứ Hai
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--ds-primary)" }} />
                Chính xác
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--ds-info)" }} />
                Trôi chảy
              </span>
            </div>
          </div>
          {p.weeks.length ? (
            <WeeklyLineChart weeks={weekLabels} accuracy={accuracy} fluency={fluency} />
          ) : (
            <Empty>Chưa có bài luyện nào trong {WEEKS_SHOWN} tuần gần đây.</Empty>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Card title="Band IELTS theo tiêu chí" subtitle="Trung bình 90 ngày, chỉ bài chấm theo rubric v2 (0–9)">
            {p.criteria.length ? (
              CRITERIA.map((c) => {
                const s = criteria.get(c.id);
                return s ? (
                  <Bar key={c.id} label={c.label} value={s.band} max={9} color={bandColor(s.band)} right={`${formatBand(s.band)} · ${s.samples} bài`} />
                ) : (
                  <Bar key={c.id} label={c.label} value={0} max={9} color="var(--ds-border-strong)" right="chưa có" />
                );
              })
            ) : (
              <Empty>Chưa có bài nào có band. Làm một bài IELTS Part 1–3, hoặc một câu shadowing đủ 10 từ để có band phát âm.</Empty>
            )}
          </Card>

          <Card title="Top 5 âm khó nhất" subtitle="Điểm Azure trung bình theo âm, 90 ngày, âm xuất hiện ít nhất 3 lần">
            {p.hardPhonemes.length ? (
              p.hardPhonemes.map((ph) => (
                <Bar
                  key={ph.phoneme}
                  label={phonemeToIpa(ph.phoneme)}
                  value={ph.score}
                  max={100}
                  color={scoreColor(ph.score)}
                  right={`${Math.round(ph.score)} · ${ph.samples} lần`}
                />
              ))
            ) : (
              <Empty>Chưa đủ dữ liệu. Cần thêm vài bài để mỗi âm xuất hiện ít nhất 3 lần.</Empty>
            )}
          </Card>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Card title="Theo loại bài" subtitle="Số bài, band trung bình và cao nhất (rubric v2)">
            {p.byTask.length ? (
              <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--ds-text-muted)", fontSize: 12, textAlign: "left" }}>
                    <th style={{ fontWeight: 500, paddingBottom: 8 }}>Loại bài</th>
                    <th style={{ fontWeight: 500, paddingBottom: 8, textAlign: "right" }}>Số bài</th>
                    <th style={{ fontWeight: 500, paddingBottom: 8, textAlign: "right" }}>Band TB</th>
                    <th style={{ fontWeight: 500, paddingBottom: 8, textAlign: "right" }}>Cao nhất</th>
                  </tr>
                </thead>
                <tbody>
                  {p.byTask.map((t) => (
                    <tr key={t.taskType} style={{ borderTop: "1px solid var(--ds-border-subtle)" }}>
                      <td style={{ padding: "8px 0", fontWeight: 600 }}>{TASKS[t.taskType] ?? t.taskType}</td>
                      <td style={{ textAlign: "right" }}>{t.attempts}</td>
                      <td style={{ textAlign: "right", color: t.avgBand ? bandColor(t.avgBand) : undefined }}>{t.avgBand ? formatBand(t.avgBand) : "—"}</td>
                      <td style={{ textAlign: "right", color: t.bestBand ? bandColor(t.bestBand) : undefined }}>{t.bestBand ? formatBand(t.bestBand) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>Chưa có bài luyện nào.</Empty>
            )}
          </Card>

          <Card title="Nguồn chấm bài IELTS" subtitle="AI chấm trôi chảy, từ vựng, ngữ pháp; mỗi model đọc rubric hơi khác nhau">
            {graded.length || ungraded ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {graded.map((g) => (
                  <div key={`${g.provider}/${g.model}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>
                      <b>{g.provider}</b> <span style={{ color: "var(--ds-text-muted)" }}>{g.model}</span>
                    </span>
                    <span>{g.attempts} bài</span>
                  </div>
                ))}
                {ungraded > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--ds-text-muted)" }}>
                    <span>Không rõ / AI lỗi</span>
                    <span>{ungraded} bài</span>
                  </div>
                )}
              </div>
            ) : (
              <Empty>Chưa có bài IELTS nào.</Empty>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
