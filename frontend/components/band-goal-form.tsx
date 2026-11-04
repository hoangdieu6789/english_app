"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BAND_OPTIONS, saveGoals, type Goals } from "@/lib/review-api";

/**
 * Self-estimated band (used until IELTS attempts give a measured band) and target band.
 * New review words are picked between the two. Used on the welcome, Progress and Review pages.
 */
export function BandGoalForm({ goals, onSaved, compact }: { goals?: Goals; onSaved?: (g: Goals) => void; compact?: boolean }) {
  const queryClient = useQueryClient();
  const measured = goals && goals.measuredBand > 0 ? goals.measuredBand : 0;
  const [self, setSelf] = useState<string>(goals?.selfBand != null ? String(goals.selfBand) : "");
  const [target, setTarget] = useState<string>(
    goals?.targetBand != null ? String(goals.targetBand) : String(Math.min(9, Math.round(((measured || goals?.currentBand || 5) + 1) * 2) / 2)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const g = await saveGoals(self ? Number(self) : null, target ? Number(target) : null);
      queryClient.setQueryData(["goals"], g);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      onSaved?.(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được.");
    } finally {
      setSaving(false);
    }
  }

  const select = (value: string, onChange: (v: string) => void, empty: string, label: string) => (
    <select className="ds-input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} style={{ minWidth: 120 }}>
      {empty && <option value="">{empty}</option>}
      {BAND_OPTIONS.map((b) => (
        <option key={b} value={String(b)}>
          {b.toFixed(1)}
        </option>
      ))}
    </select>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)" }}>
          Band hiện tại {measured > 0 ? "(đo từ bài làm)" : "(ước lượng)"}
          {measured > 0 ? (
            <span style={{ font: "700 20px var(--font-display)", color: "var(--ds-text)", padding: "6px 0" }}>{measured.toFixed(1)}</span>
          ) : (
            select(self, setSelf, "Chưa biết", "Band hiện tại")
          )}
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)" }}>
          Band mục tiêu
          {select(target, setTarget, "", "Band mục tiêu")}
        </label>
        <button className="ds-btn" onClick={save} disabled={saving}>
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
      {!compact && (
        <div style={{ fontSize: 12.5, color: "var(--ds-text-muted)", lineHeight: 1.6 }}>
          Từ mới được chọn từ khoảng band hiện tại đến band mục tiêu, nên bạn không phải ôn từ quá dễ. Khi đã có bài IELTS được chấm,
          app dùng band đo được thay cho ước lượng.
        </div>
      )}
      {error && <div style={{ fontSize: 13, color: "var(--ds-danger)" }}>{error}</div>}
    </div>
  );
}
