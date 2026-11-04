"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";

// A small centred card for the password pages (same look as the login page's form side).
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 32,
        background: "var(--ds-auth-bg)",
      }}
    >
      <div className="ds-card fade" style={{ width: "100%", maxWidth: 420, padding: 36, display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ font: "700 var(--text-lg)/1.3 var(--font-display)", color: "var(--ds-text)" }}>{title}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", marginTop: 4 }}>{subtitle}</div>
        </div>
        {children}
        <div style={{ textAlign: "center", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
          <Link href="/login">{t("auth.card.backToLogin")}</Link>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
