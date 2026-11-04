import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32 }}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <div style={{ font: "800 48px var(--font-display)", color: "var(--ds-primary)" }}>404</div>
        <div style={{ font: "700 18px var(--font-display)", color: "var(--ds-text)" }}>Không tìm thấy trang này</div>
        <p style={{ fontSize: 14, color: "var(--ds-text-muted)" }}>Đường dẫn có thể đã sai hoặc trang đã được chuyển đi.</p>
        <Link href="/dashboard" className="ds-btn" style={{ marginTop: 8 }}>
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
