"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi, authErrorMessage } from "@/lib/auth-api";
import { useSessionStore } from "@/lib/session-store";
import { useRedirectIfSignedIn } from "@/lib/use-redirect-if-signed-in";
import { saveLang, useI18n } from "@/lib/i18n";
import { AuthField, AuthLayout, AuthSwitch } from "@/components/auth-layout";
import { Icon } from "@/components/icon";

// After a password reset the reset page sends the learner here with ?reset=1.
function ResetNotice() {
  const { t } = useI18n();
  if (!useSearchParams().has("reset")) return null;
  return <p role="status" style={{ margin: 0, padding: "10px 14px", borderRadius: "var(--ds-radius-lg)", background: "var(--ds-success-bg)", fontSize: "var(--text-sm)", color: "var(--ds-success)" }}>{t("auth.login.resetDone")}</p>;
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
    <AuthLayout heroTitle={t("auth.brand.tagline")} heroIntro={t("auth.brand.intro")} title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Suspense fallback={null}>
          <ResetNotice />
        </Suspense>

        <AuthField
          id="email"
          label={t("auth.field.email")}
          type="email"
          autoComplete="email"
          required
          placeholder={t("auth.field.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          id="password"
          label={t("auth.field.password")}
          aside={
            <Link href="/forgot-password" className="ds-tap" style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
              {t("auth.login.forgot")}
            </Link>
          }
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <label className="auth-check" title={t("auth.login.rememberHint")}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>{t("auth.login.remember")}</span>
        </label>

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="ds-btn ds-btn-lg" style={{ width: "100%" }}>
          <span>{loading ? t("auth.login.submitting") : t("auth.login.submit")}</span>
          <Icon name="next" />
        </button>

        <AuthSwitch text={t("auth.login.noAccount")} href="/register" link={t("auth.login.registerLink")} />
      </form>
    </AuthLayout>
  );
}
