"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi, authErrorMessage } from "@/lib/auth-api";
import { AuthCard } from "@/components/auth-card";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Hai mật khẩu chưa giống nhau.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      router.replace("/login?reset=1");
    } catch (err) {
      setError(authErrorMessage(err, "reset"));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p style={{ fontSize: 14, color: "var(--ds-danger)" }}>
        Link thiếu mã đặt lại. Hãy mở đúng link trong email, hoặc yêu cầu link mới ở trang Quên mật khẩu.
      </p>
    );
  }
  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)" }}>Mật khẩu mới</label>
        <input
          className="ds-input"
          type="password"
          required
          minLength={8}
          placeholder="Tối thiểu 8 ký tự"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)" }}>Nhập lại mật khẩu mới</label>
        <input className="ds-input" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && <p style={{ fontSize: 13, color: "var(--ds-danger)" }}>{error}</p>}
      <button type="submit" disabled={loading} className="ds-btn ds-btn-lg" style={{ width: "100%" }}>
        <span>{loading ? "Đang lưu..." : "Đặt mật khẩu mới"}</span>
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Đặt lại mật khẩu" subtitle="Đặt mật khẩu mới; bạn sẽ được đăng xuất khỏi mọi thiết bị.">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
