"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32 }}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <div style={{ font: "800 48px var(--font-display)", color: "var(--ds-primary)" }}>404</div>
        <div style={{ font: "700 18px var(--font-display)", color: "var(--ds-text)" }}>{t("auth.notFound.title")}</div>
        <p style={{ fontSize: 14, color: "var(--ds-text-muted)" }}>{t("auth.notFound.text")}</p>
        <Link href="/dashboard" className="ds-btn" style={{ marginTop: 8 }}>
          {t("auth.notFound.home")}
        </Link>
      </div>
    </div>
  );
}
