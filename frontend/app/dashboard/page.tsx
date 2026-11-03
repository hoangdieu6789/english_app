"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { GoalRing } from "@/components/charts/progress-ring";
import { Sparkline } from "@/components/charts/sparkline";
import { progressQuery, type ProgressSummary } from "@/lib/progress-api";
import { scoreColor } from "@/lib/score-color";
import { speakEnglish } from "@/lib/text-to-speech";

// Everything here comes from the learner's own attempts (GET /api/progress/summary).

const DAILY_GOAL_ATTEMPTS = 10; // daily goal: answers recorded (shadowing or IELTS)

function greeting(hour: number): string {
  if (hour < 11) return "CHÀO BUỔI SÁNG";
  if (hour < 14) return "CHÀO BUỔI TRƯA";
  if (hour < 18) return "CHÀO BUỔI CHIỀU";
  return "CHÀO BUỔI TỐI";
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m ? `${m} phút ${s} giây` : `${s} giây`;
}

function formatBand(b: number): string {
  return (Math.round(b * 2) / 2).toFixed(1);
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// Monday of the current week as YYYY-MM-DD (local), to find "this week" in the summary.
function thisMonday(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function StatTile({ icon, bg, fg, label, value, note }: { icon: string; bg: string; fg: string; label: string; value: string; note: string }) {
  return (
    <div className="ds-card" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 16 }}>
      <span style={{ width: 46, height: 46, borderRadius: 12, background: bg, color: fg, display: "grid", placeItems: "center", fontSize: 20 }}>
        <i className={icon} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>{label}</div>
        <div style={{ font: "700 22px var(--font-display)" }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>{note}</div>
      </div>
    </div>
  );
}

function AccuracyTrend({ p, onDetails }: { p: ProgressSummary; onDetails: () => void }) {
  const weeks = p.weeks; // only weeks with practice, oldest first
  const current = weeks.find((w) => w.start === thisMonday());
  const prev = [...weeks].reverse().find((w) => w.start !== thisMonday());
  const delta = current && prev ? current.accuracy - prev.accuracy : null;

  let note = "Chưa có bài luyện trong 6 tuần gần đây.";
  if (weeks.length === 1) note = "Cần ít nhất 2 tuần có bài để thấy xu hướng.";
  if (weeks.length >= 2) {
    const first = weeks[0].accuracy;
    const last = weeks[weeks.length - 1].accuracy;
    note = last > first + 2 ? "Độ chính xác đang tăng 👍" : last < first - 2 ? "Độ chính xác đang giảm, thử nói chậm và rõ hơn" : "Độ chính xác khá ổn định";
  }

  return (
    <div className="ds-card" style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ font: "700 16px var(--font-display)" }}>Độ chính xác 6 tuần</div>
        <a href="#" onClick={(e) => { e.preventDefault(); onDetails(); }} style={{ fontSize: 13, fontWeight: 600 }}>
          Chi tiết <i className="pi pi-angle-right" style={{ fontSize: 11 }} />
        </a>
      </div>
      <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginBottom: 10 }}>{note}</div>
      {weeks.length >= 2 && <Sparkline data={weeks.map((w) => w.accuracy)} />}
      <div style={{ display: "flex", gap: 20, marginTop: 14 }}>
        <div>
          <div style={{ font: "700 22px var(--font-display)", color: current ? scoreColor(current.accuracy) : undefined }}>
            {current ? Math.round(current.accuracy) : "—"}
          </div>
          <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>tuần này (0–100)</div>
        </div>
        {delta != null && prev && (
          <div>
            <div style={{ font: "700 22px var(--font-display)", color: delta >= 0 ? "var(--ds-success)" : "var(--ds-danger)" }}>
              {delta >= 0 ? "+" : ""}
              {Math.round(delta)}
            </div>
            <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>điểm so với tuần {shortDate(prev.start)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: p, isError, error } = useQuery(progressQuery);

  if (!p) {
    return (
      <AppShell>
        <div style={{ maxWidth: 1120, margin: "0 auto", fontSize: 14, color: isError ? "var(--ds-danger)" : "var(--ds-text-muted)" }}>
          {isError ? `Không tải được dữ liệu. ${error.message}` : "Đang tải..."}
        </div>
      </AppShell>
    );
  }

  const done = p.attemptsToday;
  const goalPct = Math.min(100, Math.round((done / DAILY_GOAL_ATTEMPTS) * 100));
  const left = Math.max(0, DAILY_GOAL_ATTEMPTS - done);

  return (
    <AppShell>
      <div className="fade" style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
          <div
            style={{
              background: "linear-gradient(150deg,var(--ds-primary) 0%,#8f0009 100%)",
              borderRadius: "var(--ds-radius-2xl)",
              padding: 28,
              color: "#fff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: "var(--ds-shadow-md)",
            }}
          >
            <div style={{ maxWidth: "60%" }}>
              <div style={{ fontSize: 13, opacity: 0.85, letterSpacing: ".02em" }}>{greeting(new Date().getHours())}</div>
              <div style={{ font: "700 26px var(--font-display)", margin: "6px 0 10px" }}>
                {left === 0 ? "Bạn đã đạt mục tiêu hôm nay!" : "Sẵn sàng luyện nói chưa?"}
              </div>
              <div style={{ fontSize: 14, opacity: 0.9, lineHeight: 1.5 }}>
                {left === 0 ? (
                  <>Đã nói <b>{done} bài</b> hôm nay. Luyện thêm vẫn được tính vào tiến độ.</>
                ) : (
                  <>
                    Hôm nay còn <b>{left} bài</b> để đạt mục tiêu {DAILY_GOAL_ATTEMPTS} bài — nói to, sai cũng không sao cả.
                  </>
                )}
              </div>
              <button
                onClick={() => router.push("/practice")}
                className="ds-btn"
                style={{ marginTop: 16, background: "#fff", color: "var(--ds-primary)", borderColor: "#fff" }}
              >
                <i className="pi pi-microphone" />
                <span>Bắt đầu luyện nói</span>
              </button>
            </div>
            <div style={{ position: "relative", width: 136, height: 136, flex: "none" }}>
              <GoalRing pct={goalPct} />
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", lineHeight: 1.1 }}>
                <div>
                  <div style={{ font: "700 28px var(--font-display)" }}>
                    {done}/{DAILY_GOAL_ATTEMPTS}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>bài hôm nay</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 20 }}>
            <StatTile
              icon="pi pi-comments"
              bg="var(--ds-primary-50)"
              fg="var(--ds-primary)"
              label="Thời gian nói hôm nay"
              value={formatDuration(p.speakingSecondsToday)}
              note={`từ ${done} bài đã ghi âm`}
            />
            <StatTile
              icon="pi pi-star"
              bg="var(--ds-success-bg)"
              fg="var(--ds-success)"
              label="Band IELTS TB (30 ngày)"
              value={p.last30Days.banded ? formatBand(p.last30Days.band) : "—"}
              note={p.last30Days.banded ? `${p.last30Days.banded} bài IELTS có band` : "Làm một bài IELTS Part 1–3 để có band"}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="ds-card" style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ font: "700 16px var(--font-display)" }}>Từ cần luyện lại</div>
              <a href="#" onClick={(e) => { e.preventDefault(); router.push("/practice"); }} style={{ fontSize: 13, fontWeight: 600 }}>
                Luyện nói <i className="pi pi-angle-right" style={{ fontSize: 11 }} />
              </a>
            </div>
            <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginBottom: 8 }}>Từ Azure chấm sai hoặc dưới 60 điểm, 30 ngày gần đây</div>
            {p.weakWords.length ? (
              p.weakWords.map((w) => (
                <div key={w.word} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--ds-border-subtle)" }}>
                  <button
                    onClick={() => speakEnglish(w.word)}
                    title="Nghe từ này"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 9,
                      border: "none",
                      cursor: "pointer",
                      background: "var(--ds-surface-muted)",
                      display: "grid",
                      placeItems: "center",
                      color: "var(--ds-text-secondary)",
                    }}
                  >
                    <i className="pi pi-volume-up" style={{ fontSize: 14 }} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>{w.word}</div>
                  <span style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>{w.times} lần</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "3px 10px",
                      borderRadius: 99,
                      background: "var(--ds-surface-subtle)",
                      color: scoreColor(w.score),
                      minWidth: 44,
                      textAlign: "center",
                    }}
                  >
                    {Math.round(w.score)}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 13, color: "var(--ds-text-muted)", padding: "8px 0" }}>
                {p.attempts ? "Chưa có từ nào bị chấm sai trong 30 ngày qua. Tốt lắm!" : "Chưa có bài luyện nào."}
              </div>
            )}
          </div>

          <AccuracyTrend p={p} onDetails={() => router.push("/progress")} />
        </div>
      </div>
    </AppShell>
  );
}
