"use client";

import { BoltMark } from "@/components/brand";
import { APP_NAME } from "@/lib/brand";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi, authErrorMessage } from "@/lib/auth-api";
import { useSessionStore } from "@/lib/session-store";
import { useRedirectIfSignedIn } from "@/lib/use-redirect-if-signed-in";
import { saveLang, useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function RegisterPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const setUser = useSessionStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useRedirectIfSignedIn();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // The API signs the new learner in, so go straight into the app.
      setUser(await authApi.register(email, password));
      // Store the language picked on this page on the new account.
      await saveLang(lang);
      router.replace("/welcome");
    } catch (err) {
      setError(authErrorMessage(err, "register", t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "var(--ds-auth-pad)",
        background: "var(--ds-auth-bg)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: -40,
          right: -60,
          width: 520,
          height: 320,
          background: "var(--ds-auth-glow)",
          pointerEvents: "none",
        }}
      />
      <div
        className="fade ds-auth-split"
        style={{
          width: "100%",
          maxWidth: 820,
          display: "grid",
          gridTemplateColumns: "1.05fr .95fr",
          background: "var(--ds-surface)",
          border: "1px solid var(--ds-border)",
          borderRadius: "var(--ds-radius-2xl)",
          boxShadow: "var(--ds-shadow-lg)",
          overflow: "hidden",
        }}
      >
        <div
          className="ds-auth-hero"
          style={{
            padding: "44px 40px",
            display: "flex",
            flexDirection: "column",
            gap: 22,
            background: "var(--ds-hero-bg)",
            color: "var(--ds-hero-text)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BoltMark size={44} />
            <span style={{ font: "700 var(--text-2xl)/1 var(--font-logo)" }}>{APP_NAME}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <div style={{ font: "700 var(--text-3xl)/1.2 var(--font-display)" }}>{t("auth.register.tagline")}</div>
            <div style={{ marginTop: 14, fontSize: "var(--text-base)", lineHeight: 1.6, color: "var(--ds-hero-text-muted)" }}>
              {t("auth.register.intro")}
            </div>
          </div>
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              fontSize: "var(--text-sm)",
              color: "var(--ds-hero-text-muted)",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <i className="pi pi-check-circle" />
              <span>{t("auth.brand.feature1")}</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <i className="pi pi-check-circle" />
              <span>{t("auth.brand.feature2")}</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <i className="pi pi-check-circle" />
              <span>{t("auth.brand.feature3")}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="ds-auth-form" style={{ padding: "44px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ font: "700 var(--text-xl)/1.3 var(--font-display)", color: "var(--ds-text)" }}>{t("auth.register.title")}</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", marginTop: 4 }}>{t("auth.register.subtitle")}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--ds-text-secondary)" }}>{t("auth.field.email")}</label>
            <input
              className="ds-input"
              type="email"
              required
              placeholder={t("auth.field.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--ds-text-secondary)" }}>
              {t("auth.field.password")}
            </label>
            <input
              className="ds-input"
              type="password"
              required
              minLength={8}
              placeholder={t("auth.field.passwordMin")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{error}</p>}

          <button type="submit" disabled={loading} className="ds-btn ds-btn-lg" style={{ width: "100%", marginTop: 4 }}>
            <span>{loading ? t("auth.register.submitting") : t("auth.register.submit")}</span>
            <i className="pi pi-arrow-right" />
          </button>

          <div style={{ textAlign: "center", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
            {t("auth.register.haveAccount")} <Link href="/login">{t("auth.register.loginLink")}</Link>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <LanguageSwitcher />
          </div>
        </form>
      </div>
    </div>
  );
}
