"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { BoltMark } from "@/components/brand";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32 }}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <BoltMark size={64} />
        <div style={{ font: "800 var(--text-4xl)/1.3 var(--font-display)", color: "var(--ds-primary)" }}>404</div>
        <div style={{ font: "700 var(--text-lg)/1.3 var(--font-display)", color: "var(--ds-text)" }}>{t("auth.notFound.title")}</div>
        <div className="ds-eyebrow" style={{ color: "var(--ds-bolt)", textTransform: "none", letterSpacing: 0 }}>{t("auth.notFound.joke")}</div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("auth.notFound.text")}</p>
        <Link href="/dashboard" className="ds-btn" style={{ marginTop: 8 }}>
          {t("auth.notFound.home")}
        </Link>
      </div>
    </div>
  );
}
