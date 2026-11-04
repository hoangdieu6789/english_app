"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LANGUAGES, useI18n, type Lang } from "@/lib/i18n";

/**
 * Picks the app language. sync: also save it on the server (signed-in pages), so AI feedback,
 * model answers and word meanings follow it on every device.
 */
export function LanguageSwitcher({ sync = false, showHint = false }: { sync?: boolean; showHint?: boolean }) {
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
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ds-text-muted)" }}>
        <i className="pi pi-globe" aria-hidden />
        <span>{t("common.language")}</span>
        <select
          className="ds-input"
          value={lang}
          onChange={(e) => change(e.target.value as Lang)}
          aria-label={t("common.language")}
          style={{ height: 32, padding: "0 8px", fontSize: 13, width: "auto" }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      {showHint && <div style={{ fontSize: 12.5, color: "var(--ds-text-muted)", lineHeight: 1.5 }}>{t("common.languageHint")}</div>}
    </div>
  );
}
