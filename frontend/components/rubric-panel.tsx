import type { RubricResult } from "@/lib/pronunciation-api";
import { SCORE_AMBER, SCORE_GREEN, SCORE_RED } from "@/lib/score-color";

// Learner-facing names for the IELTS criteria and the Pronunciation features
// (backend/internal/rubric/criteria/*.md).
const CRITERION_LABELS: Record<string, string> = {
  fluency_coherence: "Trôi chảy & mạch lạc",
  lexical_resource: "Từ vựng",
  grammatical_range_accuracy: "Ngữ pháp",
  pronunciation: "Phát âm",
};

const PRONUNCIATION_LABELS: Record<string, string> = {
  "P-01": "Phát âm từ & âm",
  "P-02": "Ngắt cụm từ",
  "P-03": "Nhịp điệu",
  "P-04": "Ngữ điệu & trọng âm",
  "P-05": "Nối âm",
  "P-06": "Độ dễ hiểu",
};

const REASON_LABELS: Record<string, string> = {
  insufficient_speech: "chưa đủ dữ liệu",
  no_acoustic_data: "không có dữ liệu âm thanh",
  grader_unavailable: "chưa cấu hình AI chấm",
  not_returned: "AI chưa chấm được",
  invalid_band: "AI chưa chấm được",
  not_in_task: "bài đọc theo câu mẫu không chấm tiêu chí này",
  off_topic: "lạc đề",
  memorised_response: "bài nói học thuộc",
};

const TASK_LABELS: Record<string, string> = {
  shadowing: "Đọc theo câu mẫu",
  part1: "Part 1",
  part2: "Part 2",
  part3: "Part 3",
  full_test: "Full test",
};

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

export function RubricPanel({ rubric }: { rubric: RubricResult }) {
  const pron = rubric.pronunciation;
  const overall = rubric.overall;
  const scored = overall.band > 0;
  const rows = [
    ...rubric.criteria.map((c) => ({ id: c.id, band: c.band })),
    ...(pron?.assessed && pron.band ? [{ id: pron.id, band: pron.band }] : []),
  ];
  const mispronounced = pron?.mispronounced_words ?? [];

  return (
    <div className="ds-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ font: "700 16px var(--font-display)" }}>Chấm theo bộ tiêu chí</div>
          <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>
            IELTS Speaking · {TASK_LABELS[rubric.task_type] ?? rubric.task_type} · v{rubric.version}
          </div>
        </div>
        {scored ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ font: "700 26px var(--font-display)", color: bandColor(overall.band), lineHeight: 1.1 }}>
                {formatBand(overall.band)}
              </div>
              <div style={{ fontSize: 11, color: "var(--ds-text-muted)" }}>
                {overall.provisional ? "band tạm tính" : "band tổng"}
              </div>
            </div>
            {overall.cefr && (
              <span
                title="Ước lượng, chưa hiệu chỉnh"
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
          <span style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Chưa đủ dữ liệu để chấm</span>
        )}
      </div>

      {rubric.summary && <div style={{ fontSize: 14, color: "var(--ds-text)", lineHeight: 1.6 }}>{rubric.summary}</div>}

      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, width: 160, color: "var(--ds-text-secondary)" }}>{CRITERION_LABELS[r.id] ?? r.id}</span>
              <Bar pct={(r.band / 9) * 100} color={bandColor(r.band)} />
              <span style={{ fontSize: 12, fontWeight: 600, width: 30, textAlign: "right", color: bandColor(r.band) }}>{r.band}/9</span>
            </div>
          ))}
        </div>
      )}

      {pron && (
        <div style={{ borderTop: "1px solid var(--ds-border-subtle)", paddingTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)", marginBottom: 10 }}>
            Phát âm: đo được {pron.coverage} đặc điểm
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
                <span>{PRONUNCIATION_LABELS[it.code] ?? it.code}</span>
                <span style={{ fontWeight: 600, whiteSpace: "nowrap", marginLeft: 8, color: it.measured && it.band ? bandColor(it.band) : undefined }}>
                  {it.measured && it.band ? `${it.band}/9` : "chưa đo"}
                </span>
              </div>
            ))}
          </div>
          {mispronounced.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--ds-text-secondary)" }}>
              Từ phát âm sai: <span style={{ fontWeight: 600, color: "var(--ds-danger)" }}>{mispronounced.join(", ")}</span>
            </div>
          )}
          {pron.tone_issues && pron.tone_issues.length > 0 && (
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--ds-text-secondary)" }}>
              {pron.tone_issues.map((t) => (
                <li key={t.segment_id}>
                  “{t.quote}”: nên {t.expected === "rise" ? "lên" : "xuống"} giọng ở cuối câu
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rubric.criteria.some((c) => (c.issues ?? []).length > 0) && (
        <div style={{ borderTop: "1px solid var(--ds-border-subtle)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)" }}>Lỗi cần sửa</div>
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

      {rubric.not_assessed.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>
          Chưa chấm:{" "}
          {rubric.not_assessed
            .map((n) => `${CRITERION_LABELS[n.id] ?? n.id} (${REASON_LABELS[n.reason] ?? n.reason})`)
            .join(", ")}
        </div>
      )}
    </div>
  );
}
