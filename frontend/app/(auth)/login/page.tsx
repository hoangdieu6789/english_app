"use client";

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
  return <p style={{ fontSize: 13, color: "var(--ds-success)" }}>{t("auth.login.resetDone")}</p>;
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
        padding: 32,
        background: "linear-gradient(160deg,#fff7f5 0%,#fdeef0 100%)",
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
          background: "radial-gradient(circle at 70% 70%,rgba(185,0,14,.10),transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <div
        className="fade"
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
          style={{
            padding: "44px 40px",
            display: "flex",
            flexDirection: "column",
            gap: 22,
            background: "linear-gradient(165deg,var(--ds-primary) 0%,#8f0009 100%)",
            color: "#fff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 11,
                background: "rgba(255,255,255,.16)",
                display: "grid",
                placeItems: "center",
                backdropFilter: "blur(4px)",
              }}
            >
              <i className="pi pi-microphone" style={{ fontSize: 22 }} />
            </span>
            <span style={{ font: "700 24px var(--font-display)", letterSpacing: ".01em" }}>SpeakUp</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <div style={{ font: "700 30px/1.2 var(--font-display)" }}>{t("auth.brand.tagline")}</div>
            <div style={{ marginTop: 14, fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,.86)" }}>
              {t("auth.brand.intro")}
            </div>
          </div>
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              fontSize: 14,
              color: "rgba(255,255,255,.9)",
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

        <form onSubmit={handleSubmit} style={{ padding: "44px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ font: "700 24px var(--font-display)", color: "var(--ds-text)" }}>{t("auth.login.title")}</div>
            <div style={{ fontSize: 14, color: "var(--ds-text-muted)", marginTop: 4 }}>
              {t("auth.login.subtitle")}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)" }}>{t("auth.field.email")}</label>
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
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)" }}>
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
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
          {error && <p style={{ fontSize: 13, color: "var(--ds-danger)" }}>{error}</p>}

          <button type="submit" disabled={loading} className="ds-btn ds-btn-lg" style={{ width: "100%", marginTop: 4 }}>
            <span>{loading ? t("auth.login.submitting") : t("auth.login.submit")}</span>
            <i className="pi pi-arrow-right" />
          </button>

          <div style={{ textAlign: "center", fontSize: 13, color: "var(--ds-text-muted)" }}>
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
