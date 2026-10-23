"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { GoalRing } from "@/components/charts/progress-ring";
import { Sparkline } from "@/components/charts/sparkline";
import { REVIEW, REVIEW_TAGS } from "@/lib/mock/practice-data";

const GOAL_PCT = 60;
const ACCURACY_TREND = [72, 75, 78, 80, 83, 86];

export default function DashboardPage() {
  const router = useRouter();
  const dueWords = REVIEW.slice(0, 4);

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
              <div style={{ fontSize: 13, opacity: 0.85, letterSpacing: ".02em" }}>CHÀO BUỔI SÁNG</div>
              <div style={{ font: "700 26px var(--font-display)", margin: "6px 0 10px" }}>
                Sẵn sàng luyện nói chưa?
              </div>
              <div style={{ fontSize: 14, opacity: 0.9, lineHeight: 1.5 }}>
                Hôm nay bạn còn <b>2 hoạt động</b> — nói to, sai cũng không sao cả.
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
              <GoalRing pct={GOAL_PCT} />
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", lineHeight: 1.1 }}>
                <div>
                  <div style={{ font: "700 28px var(--font-display)" }}>{GOAL_PCT}%</div>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>mục tiêu ngày</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 20 }}>
            <div className="ds-card" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <span
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  background: "var(--ds-info-bg)",
                  color: "var(--ds-info)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 20,
                }}
              >
                <i className="pi pi-volume-up" />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Nghe hôm nay</div>
                <div style={{ font: "700 22px var(--font-display)" }}>
                  18 <span style={{ fontSize: 14, color: "var(--ds-text-muted)", fontWeight: 500 }}>/ 30 phút</span>
                </div>
              </div>
            </div>
            <div className="ds-card" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <span
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  background: "var(--ds-primary-50)",
                  color: "var(--ds-primary)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 20,
                }}
              >
                <i className="pi pi-comments" />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Nói hôm nay</div>
                <div style={{ font: "700 22px var(--font-display)" }}>
                  12 <span style={{ fontSize: 14, color: "var(--ds-text-muted)", fontWeight: 500 }}>/ 20 phút</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="ds-card" style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ font: "700 16px var(--font-display)" }}>Cần ôn hôm nay</div>
              <a href="#" onClick={(e) => { e.preventDefault(); router.push("/review"); }} style={{ fontSize: 13, fontWeight: 600 }}>
                Ôn ngay <i className="pi pi-angle-right" style={{ fontSize: 11 }} />
              </a>
            </div>
            {dueWords.map((w) => {
              const tag = REVIEW_TAGS[w.tag];
              return (
                <div
                  key={w.word}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--ds-border-subtle)",
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 9,
                      background: "var(--ds-surface-muted)",
                      display: "grid",
                      placeItems: "center",
                      color: "var(--ds-text-secondary)",
                    }}
                  >
                    <i className="pi pi-volume-up" style={{ fontSize: 14 }} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{w.word}</div>
                    <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>{w.options[w.correct]}</div>
                  </div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "3px 10px",
                      borderRadius: 99,
                      background: tag.bg,
                      color: tag.fg,
                    }}
                  >
                    {tag.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="ds-card" style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ font: "700 16px var(--font-display)" }}>Độ chính xác 6 tuần</div>
              <a href="#" onClick={(e) => { e.preventDefault(); router.push("/progress"); }} style={{ fontSize: 13, fontWeight: 600 }}>
                Chi tiết <i className="pi pi-angle-right" style={{ fontSize: 11 }} />
              </a>
            </div>
            <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginBottom: 10 }}>
              Accuracy trung bình đang tăng đều 👍
            </div>
            <Sparkline data={ACCURACY_TREND} />
            <div style={{ display: "flex", gap: 20, marginTop: 14 }}>
              <div>
                <div style={{ font: "700 22px var(--font-display)", color: "var(--ds-success)" }}>+14%</div>
                <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>so với tháng trước</div>
              </div>
              <div>
                <div style={{ font: "700 22px var(--font-display)" }}>86%</div>
                <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>tuần này</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
