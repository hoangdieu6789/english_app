"use client";

import { useI18n } from "@/lib/i18n";
import { setThemeMode, sunToday, useGeoState, useThemeMode, type ThemeMode } from "@/lib/theme";

const MODES: { mode: ThemeMode; icon: string }[] = [
  { mode: "system", icon: "pi pi-desktop" },
  { mode: "light", icon: "pi pi-sun" },
  { mode: "dark", icon: "pi pi-moon" },
  { mode: "time", icon: "pi pi-clock" },
];

/**
 * Light / Dark / System / By time (sunrise-sunset at the learner's place). compact: icon-only
 * buttons with labels for screen readers (sidebar); otherwise icon + label (settings).
 */
export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { t, locale } = useI18n();
  const mode = useThemeMode();
  const geo = useGeoState();

  let note = "";
  if (mode === "time") {
    if (geo.status === "ok") {
      const s = sunToday(geo.geo);
      const hm = (ms: number) => new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
      note = s.polar ? t(s.polar === "day" ? "common.theme.polarDay" : "common.theme.polarNight") : t("common.theme.sunNote", { rise: hm(s.rise), set: hm(s.set) });
    } else if (geo.status === "denied") {
      note = t("common.theme.noGeo");
    } else {
      note = t("common.theme.askGeo");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div role="group" aria-label={t("common.theme.label")} style={{ display: "flex", gap: 4, padding: 4, borderRadius: "var(--ds-radius-lg)", background: "var(--ds-surface-muted)", width: "fit-content", flexWrap: "wrap" }}>
        {MODES.map((m) => {
          const active = mode === m.mode;
          const label = t(`common.theme.${m.mode}`);
          return (
            <button
              key={m.mode}
              type="button"
              onClick={() => setThemeMode(m.mode)}
              aria-pressed={active}
              aria-label={compact ? label : undefined}
              title={label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minHeight: 44,
                minWidth: 44,
                justifyContent: "center",
                padding: compact ? 0 : "0 12px",
                border: "none",
                borderRadius: "var(--ds-radius-md)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                fontWeight: 700,
                background: active ? "var(--ds-surface)" : "transparent",
                color: active ? "var(--ds-primary)" : "var(--ds-text-muted)",
                boxShadow: active ? "0 2px 0 var(--ds-border)" : "none",
              }}
            >
              <i className={m.icon} aria-hidden />
              {!compact && <span>{label}</span>}
            </button>
          );
        })}
      </div>
      {note && <div style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>{note}</div>}
    </div>
  );
}
