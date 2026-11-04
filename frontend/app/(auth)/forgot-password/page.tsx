"use client";

import { useState } from "react";
import { authApi, authErrorMessage } from "@/lib/auth-api";
import { AuthCard } from "@/components/auth-card";

export default function ForgotPasswordPage() {
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
      setError(authErrorMessage(err, "reset"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Quên mật khẩu" subtitle="Nhập email đăng ký, chúng tôi gửi link đặt lại mật khẩu (dùng được 30 phút).">
      {sent ? (
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ds-text-secondary)" }}>
          Nếu <b>{email}</b> đã đăng ký, link đặt lại mật khẩu đã được gửi tới email đó. Kiểm tra cả hộp thư rác.
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)" }}>Email</label>
            <input
              className="ds-input"
              type="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <p style={{ fontSize: 13, color: "var(--ds-danger)" }}>{error}</p>}
          <button type="submit" disabled={loading} className="ds-btn ds-btn-lg" style={{ width: "100%" }}>
            <span>{loading ? "Đang gửi..." : "Gửi link đặt lại"}</span>
          </button>
        </form>
      )}
    </AuthCard>
  );
}
