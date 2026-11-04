"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { progressQuery } from "@/lib/progress-api";
import { scoreColor } from "@/lib/score-color";
import { speakEnglish } from "@/lib/text-to-speech";

// Words the learner said wrongly in their own recordings (Azure word scores, last 30 days).
// Vocabulary review with spaced repetition is planned (phase 3); until then this page shows
// only real data and links to speaking practice.
export default function ReviewPage() {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery(progressQuery);
  const words = data?.weakWords ?? [];

  return (
    <AppShell>
      <div className="fade" style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="ds-card" style={{ padding: 22 }}>
          <div style={{ font: "700 16px var(--font-display)", marginBottom: 4 }}>Từ cần luyện lại</div>
          <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginBottom: 10 }}>
            Từ bạn nói chưa đúng trong các bài đã luyện (Azure chấm sai hoặc dưới 60 điểm, 30 ngày gần đây). Nghe mẫu, rồi
            luyện lại trong câu ở phần Luyện nói.
          </div>

          {isLoading && <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Đang tải...</div>}
          {isError && <div style={{ fontSize: 13, color: "var(--ds-danger)" }}>Không tải được danh sách. Thử tải lại trang.</div>}
          {!isLoading && !isError && words.length === 0 && (
            <div style={{ fontSize: 14, color: "var(--ds-text-muted)", padding: "12px 0" }}>
              Chưa có từ nào cần luyện lại. Luyện vài câu Shadowing hoặc một bài IELTS, các từ bạn nói chưa đúng sẽ hiện ở đây.
            </div>
          )}

          {words.map((w) => (
            <div
              key={w.word}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--ds-border-subtle)" }}
            >
              <button
                onClick={() => speakEnglish(w.word)}
                title="Nghe phát âm mẫu"
                aria-label={`Nghe phát âm mẫu: ${w.word}`}
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
              <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 15 }}>{w.word}</div>
              <span style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>sai {w.times} lần</span>
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
          ))}

          <button className="ds-btn" style={{ marginTop: 16 }} onClick={() => router.push("/practice")}>
            <i className="pi pi-microphone" />
            <span>Luyện nói</span>
          </button>
        </div>

        <div style={{ fontSize: 12, color: "var(--ds-text-muted)", textAlign: "center" }}>
          Ôn từ vựng theo lịch nhắc lại (spaced repetition) đang được làm.
        </div>
      </div>
    </AppShell>
  );
}
