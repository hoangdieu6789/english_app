"use client";

import { useState } from "react";
import { authApi, authErrorMessage } from "@/lib/auth-api";
import { AuthCard } from "@/components/auth-card";
import { useI18n } from "@/lib/i18n";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err, "reset", t));
    } finally {
      setLoading(false);
    }
  }

  // The sent message shows the email in bold: split the text around {email}.
  const [sentBefore, sentAfter = ""] = t("auth.forgot.sent").split("{email}");

  return (
    <AuthCard title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")}>
      {sent ? (
        <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.6, color: "var(--ds-text-secondary)" }}>
          {sentBefore}
          <b>{email}</b>
          {sentAfter}
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
          {error && <p style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{error}</p>}
          <button type="submit" disabled={loading} className="ds-btn ds-btn-lg" style={{ width: "100%" }}>
            <span>{loading ? t("auth.forgot.submitting") : t("auth.forgot.submit")}</span>
          </button>
        </form>
      )}
    </AuthCard>
  );
}
