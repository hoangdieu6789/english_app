"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/auth-api";
import { useSessionStore } from "@/lib/session-store";

const NAV_ITEMS = [
  { key: "dashboard", href: "/dashboard", label: "Trang chủ", icon: "pi pi-home" },
  { key: "practice", href: "/practice", label: "Luyện nói", icon: "pi pi-microphone" },
  { key: "review", href: "/review", label: "Ôn từ", icon: "pi pi-book", badge: "5" },
  { key: "progress", href: "/progress", label: "Tiến độ", icon: "pi pi-chart-line" },
];

const TITLES: Record<string, [string, string]> = {
  "/dashboard": ["Trang chủ", "Tổng quan việc học của bạn hôm nay"],
  "/practice": ["Luyện nói · Practice", "Chấm phát âm theo phương pháp shadowing"],
  "/review": ["Ôn từ · Review", "Ôn lại những từ còn yếu bằng spaced repetition"],
  "/progress": ["Tiến độ · Progress", "Theo dõi accuracy, fluency và vốn từ theo thời gian"],
};

function initials(email: string) {
  const name = email.split("@")[0];
  return name.slice(0, 2).toUpperCase();
}

export function AppShell({ children, streak = 12 }: { children: React.ReactNode; streak?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const setUser = useSessionStore((s) => s.setUser);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    retry: false,
  });

  useEffect(() => {
    if (data) setUser(data);
    if (isError) router.replace("/login");
  }, [data, isError, router, setUser]);

  async function handleLogout() {
    await authApi.logout().catch(() => {});
    setUser(null);
    router.push("/login");
  }

  if (isLoading || isError) {
    return <div style={{ padding: 24, fontSize: 14, color: "var(--ds-text-muted)" }}>Đang tải...</div>;
  }

  const [pageTitle, pageSubtitle] = TITLES[pathname] ?? ["", ""];

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <aside
        style={{
          width: 248,
          flex: "none",
          background: "var(--ds-surface)",
          borderRight: "1px solid var(--ds-border)",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div
          style={{
            padding: "22px 20px",
            display: "flex",
            alignItems: "center",
            gap: 11,
            borderBottom: "1px solid var(--ds-border-subtle)",
          }}
        >
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "var(--ds-primary)",
              display: "grid",
              placeItems: "center",
              boxShadow: "var(--ds-shadow-sm)",
            }}
          >
            <i className="pi pi-microphone" style={{ color: "#fff", fontSize: 18 }} />
          </span>
          <span style={{ font: "700 21px var(--font-display)", color: "var(--ds-primary)" }}>SpeakUp</span>
        </div>

        <nav style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.key}
                href={item.href}
                className="navitem"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "10px 13px",
                  borderRadius: "var(--ds-radius-lg)",
                  fontSize: 14.5,
                  fontWeight: active ? 600 : 500,
                  width: "100%",
                  background: active ? "var(--ds-primary-50)" : "none",
                  color: active ? "var(--ds-primary)" : "var(--ds-text-secondary)",
                }}
              >
                <i className={item.icon} style={{ fontSize: 17, width: 20 }} />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    style={{
                      marginLeft: "auto",
                      background: "var(--ds-primary)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      minWidth: 19,
                      height: 19,
                      borderRadius: 99,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 5px",
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", padding: "16px 14px", borderTop: "1px solid var(--ds-border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: 8, borderRadius: "var(--ds-radius-lg)" }}>
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "var(--ds-primary-100)",
                color: "var(--ds-primary)",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {user ? initials(user.email) : "?"}
            </span>
            <div style={{ lineHeight: 1.3, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ds-text)" }}>{user?.email ?? ""}</div>
              <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Trình độ: Intermediate</div>
            </div>
          </div>
          <button
            className="navitem"
            onClick={handleLogout}
            style={{
              width: "100%",
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 11,
              padding: "9px 12px",
              border: "none",
              background: "none",
              borderRadius: "var(--ds-radius-lg)",
              cursor: "pointer",
              color: "var(--ds-text-muted)",
              fontSize: 14,
              fontFamily: "inherit",
            }}
          >
            <i className="pi pi-sign-out" style={{ width: 20 }} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            height: 66,
            flex: "none",
            background: "linear-gradient(90deg,#fff 0%,var(--ds-primary-50) 60%,var(--ds-primary-100) 100%)",
            borderBottom: "1px solid var(--ds-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 28px",
            position: "sticky",
            top: 0,
            zIndex: 5,
          }}
        >
          <div>
            <div style={{ font: "700 20px var(--font-display)", color: "var(--ds-text)" }}>{pageTitle}</div>
            <div style={{ fontSize: 12.5, color: "var(--ds-text-muted)" }}>{pageSubtitle}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 99,
                background: "var(--ds-warning-bg)",
                color: "var(--ds-warning)",
              }}
            >
              <i className="pi pi-bolt" />
              {streak} ngày streak
            </span>
            <button
              style={{
                width: 40,
                height: 40,
                border: "1px solid var(--ds-border)",
                background: "#fff",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                color: "var(--ds-text-secondary)",
                position: "relative",
              }}
            >
              <i className="pi pi-bell" />
              <span
                style={{
                  position: "absolute",
                  top: 8,
                  right: 9,
                  width: 7,
                  height: 7,
                  background: "var(--ds-primary)",
                  borderRadius: "50%",
                  border: "1.5px solid #fff",
                }}
              />
            </button>
          </div>
        </header>

        <div style={{ flex: 1, overflow: "auto", padding: 28 }}>{children}</div>
      </main>
    </div>
  );
}
