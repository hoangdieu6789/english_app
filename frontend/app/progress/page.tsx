"use client";

import { AppShell } from "@/components/app-shell";
import { WeeklyLineChart } from "@/components/charts/line-chart";
import { VocabDonut } from "@/components/charts/vocab-donut";
import { HARD_PHONEMES } from "@/lib/mock/practice-data";
import { scoreColor } from "@/lib/score-color";

const WEEKS = ["Tuần 1", "Tuần 2", "Tuần 3", "Tuần 4", "Tuần 5", "Tuần 6"];
const ACCURACY = [72, 75, 78, 80, 83, 86];
const FLUENCY = [68, 70, 73, 74, 77, 82];
const VOCAB_TOTAL = 61;
const VOCAB_SEGMENTS = [
  { value: 34, color: "#16A34A", label: "Thành thạo" },
  { value: 18, color: "var(--ds-info)", label: "Đang ôn" },
  { value: 9, color: "var(--ds-border-strong)", label: "Mới" },
];

const STAT_CARDS = [
  { label: "Streak", icon: "pi pi-bolt", color: "var(--ds-warning)", value: "12", unit: "ngày" },
  { label: "Từ đã thành thạo", icon: "pi pi-check-circle", color: "var(--ds-success)", value: "34", unit: "" },
  { label: "Đang ôn", icon: "pi pi-sync", color: "var(--ds-info)", value: "18", unit: "" },
  { label: "Accuracy TB", icon: "pi pi-chart-line", color: "var(--ds-primary)", value: "86%", unit: "" },
];

export default function ProgressPage() {
  const phonemes = HARD_PHONEMES.map(([sym, score]) => ({ sym, score, color: scoreColor(score) }));

  return (
    <AppShell>
      <div className="fade" style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
          {STAT_CARDS.map((s) => (
            <div key={s.label} className="ds-card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: s.color }}>
                <i className={s.icon} />
                <span style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>{s.label}</span>
              </div>
              <div style={{ font: "700 30px var(--font-display)", marginTop: 6 }}>
                {s.value} {s.unit && <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ds-text-muted)" }}>{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="ds-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div>
              <div style={{ font: "700 17px var(--font-display)" }}>Accuracy &amp; Fluency theo tuần</div>
              <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>6 tuần gần nhất</div>
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
          <WeeklyLineChart weeks={WEEKS} accuracy={ACCURACY} fluency={FLUENCY} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="ds-card" style={{ padding: 24 }}>
            <div style={{ font: "700 17px var(--font-display)", marginBottom: 4 }}>Top 5 âm khó nhất</div>
            <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginBottom: 16 }}>Điểm trung bình theo phoneme</div>
            {phonemes.map((p) => (
              <div key={p.sym} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 13 }}>
                <span style={{ font: "700 16px var(--font-display)", width: 44 }}>{p.sym}</span>
                <div style={{ flex: 1, height: 10, background: "var(--ds-surface-muted)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 99, background: p.color, width: `${p.score}%` }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, width: 32, textAlign: "right", color: p.color }}>{p.score}</span>
              </div>
            ))}
          </div>

          <div className="ds-card" style={{ padding: 24 }}>
            <div style={{ font: "700 17px var(--font-display)", marginBottom: 4 }}>Vốn từ vựng</div>
            <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginBottom: 18 }}>Phân bố theo trạng thái</div>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ position: "relative", width: 150, height: 150, flex: "none" }}>
                <VocabDonut segments={VOCAB_SEGMENTS} total={VOCAB_TOTAL} />
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
                  <div>
                    <div style={{ font: "700 26px var(--font-display)" }}>{VOCAB_TOTAL}</div>
                    <div style={{ fontSize: 11, color: "var(--ds-text-muted)" }}>tổng từ</div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                {VOCAB_SEGMENTS.map((seg) => (
                  <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 4, background: seg.color }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{seg.label}</div>
                    </div>
                    <b>{seg.value}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
