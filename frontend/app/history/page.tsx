"use client";

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { BoltMark } from "@/components/brand";
import { fetchHistory, type HistoryItem } from "@/lib/pronunciation-api";
import { scoreColor } from "@/lib/score-color";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, taskLabel } from "@/lib/task-labels";

const FILTERS = ["", "part1", "part2", "part3", "shadowing"];

function Score({ a }: { a: HistoryItem }) {
  const { t } = useI18n();
  if (a.gradingStatus === "pending") return <span style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>{t("history.pending")}</span>;
  if (a.band != null)
    return (
      <span style={{ font: "700 var(--text-lg)/1.3 var(--font-display)", color: "var(--ds-primary)" }}>
        {a.band.toFixed(1)}
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--ds-text-muted)", marginLeft: 4 }}>band</span>
      </span>
    );
  return (
    <span style={{ font: "700 var(--text-lg)/1.3 var(--font-display)", color: scoreColor(a.overallScore) }}>
      {Math.round(a.overallScore)}
      <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--ds-text-muted)", marginLeft: 4 }}>/100</span>
    </span>
  );
}

// Every speaking attempt of the learner, newest first; open one to see the full result again.
export default function HistoryPage() {
  const { t, locale } = useI18n();
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
              {f ? taskLabel(t, f) : t("history.all")} ({f ? (counts[f] ?? 0) : total})
            </button>
          ))}
        </div>

        <div className="ds-card" style={{ padding: "6px 22px" }}>
          {q.isLoading && <div style={{ padding: "18px 0", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("common.loading")}</div>}
          {q.isError && <div style={{ padding: "18px 0", fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{t("history.err.load")}</div>}
          {q.data && attempts.length === 0 && (
            <div style={{ padding: "28px 0", textAlign: "center", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <BoltMark size={40} />
              <div className="ds-eyebrow" style={{ color: "var(--ds-bolt)", textTransform: "none", letterSpacing: 0 }}>{t("history.emptyJoke")}</div>
              <span>{t("history.empty")}</span>
              <Link href="/practice" className="ds-tap" style={{ color: "var(--ds-primary)", fontWeight: 600 }}>
                {t("history.practiceNow")}
              </Link>
            </div>
          )}
          {attempts.map((a) => (
            <Link
              key={a.id}
              href={`/history/${a.id}`}
              style={{ display: "flex", gap: 16, alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--ds-border-subtle)", color: "inherit", textDecoration: "none" }}
            >
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>
                  <span style={{ padding: "1px 8px", borderRadius: 99, background: "var(--ds-primary-50)", color: "var(--ds-primary)", fontWeight: 600 }}>
                    {taskLabel(t, a.taskType)}
                  </span>
                  <span>{formatDateTime(a.createdAt, locale)}</span>
                  {a.topic && <span>· {a.topic}</span>}
                </div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.taskType === "shadowing" ? a.referenceText : (a.taskPrompt ?? "").split("\n")[0]}
                </div>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.recognizedText || t("common.notRecognized")}
                </div>
              </div>
              <Score a={a} />
              <i className="pi pi-angle-right" style={{ color: "var(--ds-text-muted)" }} />
            </Link>
          ))}
          {q.hasNextPage && (
            <div style={{ padding: "14px 0", textAlign: "center" }}>
              <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                {q.isFetchingNextPage ? t("common.loading") : t("common.loadMore")}
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
