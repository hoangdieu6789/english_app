"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LANGUAGES, useI18n, type Lang } from "@/lib/i18n";

/**
 * Picks the app language. sync: also save it on the server (signed-in pages), so AI feedback,
 * model answers and word meanings follow it on every device.
 */
export function LanguageSwitcher({ sync = false, showHint = false, hideLabel = false }: { sync?: boolean; showHint?: boolean; hideLabel?: boolean }) {
  const { lang, setLang, t } = useI18n();
  const queryClient = useQueryClient();

  async function change(next: Lang) {
    if (next === lang) return;
    await setLang(next, sync);
    // Server texts (meanings, practice sentence glosses) are per language.
    queryClient.invalidateQueries();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
        {!hideLabel && (
          <>
            <i className="pi pi-globe" aria-hidden />
            <span>{t("common.language")}</span>
          </>
        )}
        <select
          className="ds-input"
          value={lang}
          onChange={(e) => change(e.target.value as Lang)}
          aria-label={t("common.language")}
          style={{ height: 44, padding: "0 10px", fontSize: "var(--text-sm)", width: "auto", minWidth: 160 }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      {showHint && <div style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)", lineHeight: 1.5 }}>{t("common.languageHint")}</div>}
    </div>
  );
}
