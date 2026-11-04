"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi, authErrorMessage } from "@/lib/auth-api";
import { AuthCard } from "@/components/auth-card";
import { useI18n } from "@/lib/i18n";

function ResetPasswordForm() {
  const router = useRouter();
  const { t } = useI18n();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("auth.reset.mismatch"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      router.replace("/login?reset=1");
    } catch (err) {
      setError(authErrorMessage(err, "reset", t));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>
        {t("auth.reset.missingToken")}
      </p>
    );
  }
  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--ds-text-secondary)" }}>{t("auth.reset.newPassword")}</label>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--ds-text-secondary)" }}>{t("auth.reset.confirmPassword")}</label>
        <input className="ds-input" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && <p style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{error}</p>}
      <button type="submit" disabled={loading} className="ds-btn ds-btn-lg" style={{ width: "100%" }}>
        <span>{loading ? t("common.saving") : t("auth.reset.submit")}</span>
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const { t } = useI18n();
  return (
    <AuthCard title={t("auth.reset.title")} subtitle={t("auth.reset.subtitle")}>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
