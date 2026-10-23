"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/auth-api";
import { ApiError } from "@/lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.register(email, password);
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đăng ký thất bại");
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
            <div style={{ font: "700 30px/1.2 var(--font-display)" }}>Bắt đầu hành trình luyện nói của bạn</div>
            <div style={{ marginTop: 14, fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,.86)" }}>
              Tạo tài khoản miễn phí — nói thật nhiều, sai không sao, hệ thống sẽ giúp bạn tiến bộ mỗi ngày.
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
              <span>Chấm phát âm theo từng từ &amp; âm tiết</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <i className="pi pi-check-circle" />
              <span>Ôn từ vựng bằng spaced repetition</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <i className="pi pi-check-circle" />
              <span>Biểu đồ tiến độ theo tuần</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "44px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ font: "700 24px var(--font-display)", color: "var(--ds-text)" }}>Đăng ký</div>
            <div style={{ fontSize: 14, color: "var(--ds-text-muted)", marginTop: 4 }}>Tạo tài khoản mới</div>
          </div>

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

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)" }}>
              Mật khẩu / Password
            </label>
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

          {error && <p style={{ fontSize: 13, color: "var(--ds-danger)" }}>{error}</p>}

          <button type="submit" disabled={loading} className="ds-btn ds-btn-lg" style={{ width: "100%", marginTop: 4 }}>
            <span>{loading ? "Đang tạo tài khoản..." : "Tạo tài khoản"}</span>
            <i className="pi pi-arrow-right" />
          </button>

          <div style={{ textAlign: "center", fontSize: 13, color: "var(--ds-text-muted)" }}>
            Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
