"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authApi, authErrorMessage } from "@/lib/auth-api";
import { useSessionStore } from "@/lib/session-store";
import { useRedirectIfSignedIn } from "@/lib/use-redirect-if-signed-in";
import { saveLang, useI18n } from "@/lib/i18n";
import { AuthField, AuthLayout, AuthSwitch } from "@/components/auth-layout";
import { Icon } from "@/components/icon";

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
    <AuthLayout heroTitle={t("auth.register.tagline")} heroIntro={t("auth.register.intro")} title={t("auth.register.title")} subtitle={t("auth.register.subtitle")}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder={t("auth.field.passwordMin")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="ds-btn ds-btn-lg" style={{ width: "100%" }}>
          <span>{loading ? t("auth.register.submitting") : t("auth.register.submit")}</span>
          <Icon name="next" />
        </button>

        <AuthSwitch text={t("auth.register.haveAccount")} href="/login" link={t("auth.register.loginLink")} />
      </form>
    </AuthLayout>
  );
}
