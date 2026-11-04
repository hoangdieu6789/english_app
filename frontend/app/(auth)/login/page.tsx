"use client";

import { BoltMark } from "@/components/brand";
import { APP_NAME } from "@/lib/brand";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi, authErrorMessage } from "@/lib/auth-api";
import { useSessionStore } from "@/lib/session-store";
import { useRedirectIfSignedIn } from "@/lib/use-redirect-if-signed-in";
import { saveLang, useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";

// After a password reset the reset page sends the learner here with ?reset=1.
function ResetNotice() {
  const { t } = useI18n();
  if (!useSearchParams().has("reset")) return null;
  return <p style={{ fontSize: "var(--text-sm)", color: "var(--ds-success)" }}>{t("auth.login.resetDone")}</p>;
}

export default function LoginPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const setUser = useSessionStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useRedirectIfSignedIn();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await authApi.login(email, password, remember);
      setUser(user);
      // Store the language picked on this page on the account.
      await saveLang(lang);
      router.replace("/dashboard");
    } catch (err) {
      setError(authErrorMessage(err, "login", t));
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
            <div style={{ font: "700 var(--text-3xl)/1.2 var(--font-display)" }}>{t("auth.brand.tagline")}</div>
            <div style={{ marginTop: 14, fontSize: "var(--text-base)", lineHeight: 1.6, color: "var(--ds-hero-text-muted)" }}>
              {t("auth.brand.intro")}
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
            <div style={{ font: "700 var(--text-xl)/1.3 var(--font-display)", color: "var(--ds-text)" }}>{t("auth.login.title")}</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", marginTop: 4 }}>
              {t("auth.login.subtitle")}
            </div>
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)" }}>
            <label
              style={{ display: "flex", gap: 7, alignItems: "center", color: "var(--ds-text-secondary)" }}
              title={t("auth.login.rememberHint")}
            >
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ accentColor: "var(--ds-primary)", width: 15, height: 15 }}
              />
              {t("auth.login.remember")}
            </label>
            <Link href="/forgot-password">{t("auth.login.forgot")}</Link>
          </div>

          <Suspense fallback={null}>
            <ResetNotice />
          </Suspense>
          {error && <p style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{error}</p>}

          <button type="submit" disabled={loading} className="ds-btn ds-btn-lg" style={{ width: "100%", marginTop: 4 }}>
            <span>{loading ? t("auth.login.submitting") : t("auth.login.submit")}</span>
            <i className="pi pi-arrow-right" />
          </button>

          <div style={{ textAlign: "center", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
            {t("auth.login.noAccount")} <Link href="/register">{t("auth.login.registerLink")}</Link>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <LanguageSwitcher />
          </div>
        </form>
      </div>
    </div>
  );
}
