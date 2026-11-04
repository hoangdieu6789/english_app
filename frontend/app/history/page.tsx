"use client";

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { fetchHistory, type HistoryItem } from "@/lib/pronunciation-api";
import { scoreColor } from "@/lib/score-color";
import { formatDateTime, taskLabel } from "@/lib/task-labels";

const FILTERS = ["", "part1", "part2", "part3", "shadowing"];

function Score({ a }: { a: HistoryItem }) {
  if (a.gradingStatus === "pending") return <span style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>đang chấm...</span>;
  if (a.band != null)
    return (
      <span style={{ font: "700 18px var(--font-display)", color: "var(--ds-primary)" }}>
        {a.band.toFixed(1)}
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ds-text-muted)", marginLeft: 4 }}>band</span>
      </span>
    );
  return (
    <span style={{ font: "700 18px var(--font-display)", color: scoreColor(a.overallScore) }}>
      {Math.round(a.overallScore)}
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ds-text-muted)", marginLeft: 4 }}>/100</span>
    </span>
  );
}

// Every speaking attempt of the learner, newest first; open one to see the full result again.
export default function HistoryPage() {
  const [type, setType] = useState("");
  const q = useInfiniteQuery({
    queryKey: ["history", type],
    queryFn: ({ pageParam }) => fetchHistory(type, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const attempts = q.data?.pages.flatMap((p) => p.attempts) ?? [];
  const counts = q.data?.pages[0]?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <AppShell>
      <div className="fade" style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button
              key={f || "all"}
              onClick={() => setType(f)}
              className={type === f ? "ds-btn ds-btn-sm" : "ds-btn ds-btn-outline ds-btn-sm"}
              aria-pressed={type === f}
            >
              {f ? taskLabel(f) : "Tất cả"} ({f ? (counts[f] ?? 0) : total})
            </button>
          ))}
        </div>

        <div className="ds-card" style={{ padding: "6px 22px" }}>
          {q.isLoading && <div style={{ padding: "18px 0", fontSize: 14, color: "var(--ds-text-muted)" }}>Đang tải...</div>}
          {q.isError && <div style={{ padding: "18px 0", fontSize: 14, color: "var(--ds-danger)" }}>Không tải được lịch sử. Thử tải lại trang.</div>}
          {q.data && attempts.length === 0 && (
            <div style={{ padding: "28px 0", textAlign: "center", fontSize: 14, color: "var(--ds-text-muted)" }}>
              Chưa có bài nói nào. <Link href="/practice" style={{ color: "var(--ds-primary)", fontWeight: 600 }}>Luyện nói ngay</Link>
            </div>
          )}
          {attempts.map((a) => (
            <Link
              key={a.id}
              href={`/history/${a.id}`}
              style={{ display: "flex", gap: 16, alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--ds-border-subtle)", color: "inherit", textDecoration: "none" }}
            >
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--ds-text-muted)" }}>
                  <span style={{ padding: "1px 8px", borderRadius: 99, background: "var(--ds-primary-50)", color: "var(--ds-primary)", fontWeight: 600 }}>
                    {taskLabel(a.taskType)}
                  </span>
                  <span>{formatDateTime(a.createdAt)}</span>
                  {a.topic && <span>· {a.topic}</span>}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.taskType === "shadowing" ? a.referenceText : (a.taskPrompt ?? "").split("\n")[0]}
                </div>
                <div style={{ fontSize: 13, color: "var(--ds-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.recognizedText || "(không nhận diện được)"}
                </div>
              </div>
              <Score a={a} />
              <i className="pi pi-angle-right" style={{ color: "var(--ds-text-muted)" }} />
            </Link>
          ))}
          {q.hasNextPage && (
            <div style={{ padding: "14px 0", textAlign: "center" }}>
              <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                {q.isFetchingNextPage ? "Đang tải..." : "Xem thêm"}
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
