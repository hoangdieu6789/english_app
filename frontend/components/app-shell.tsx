"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { progressQuery } from "@/lib/progress-api";
import { reviewQuery } from "@/lib/review-api";
import { authApi } from "@/lib/auth-api";
import { useSessionStore } from "@/lib/session-store";
import { LanguageSwitcher } from "@/components/language-switcher";
import { isLang, useI18n } from "@/lib/i18n";

type NavKey = "dashboard" | "practice" | "history" | "review" | "progress";

// badge: a small count next to the label (real counts only: words due for review).
const NAV_ITEMS: { key: NavKey; href: string; icon: string; badge?: string }[] = [
  { key: "dashboard", href: "/dashboard", icon: "pi pi-home" },
  { key: "practice", href: "/practice", icon: "pi pi-microphone" },
  { key: "history", href: "/history", icon: "pi pi-history" },
  { key: "review", href: "/review", icon: "pi pi-book" },
  { key: "progress", href: "/progress", icon: "pi pi-chart-line" },
];

function initials(email: string) {
  const name = email.split("@")[0];
  return name.slice(0, 2).toUpperCase();
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const setUser = useSessionStore((s) => s.setUser);
  const { t, lang, setLang } = useI18n();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    retry: false,
  });
  // Real streak from the learner's attempts (same request as the Progress page).
  const progress = useQuery({ ...progressQuery, enabled: !!data });
  const streak = progress.data?.streak ?? 0;
  const band = progress.data?.last30Days.band ?? 0;
  const review = useQuery({ ...reviewQuery, enabled: !!data });
  const reviewDue = review.data?.dueCount ?? 0;

  useEffect(() => {
    if (data) setUser(data);
    if (isError) router.replace("/login");
  }, [data, isError, router, setUser]);

  // The language saved on the server wins (set on another device or at sign-up).
  const serverLang = data?.lang;
  useEffect(() => {
    if (isLang(serverLang) && serverLang !== lang) setLang(serverLang);
    // Only when the server value arrives or changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverLang]);

  async function handleLogout() {
    await authApi.logout().catch(() => {});
    setUser(null);
    router.push("/login");
  }

  if (isLoading || isError) {
    return <div style={{ padding: 24, fontSize: 14, color: "var(--ds-text-muted)" }}>{t("common.loading")}</div>;
  }

  const page = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))?.key;
  const [pageTitle, pageSubtitle] = page ? [t(`nav.title.${page}`), t(`nav.sub.${page}`)] : ["", ""];

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
          {NAV_ITEMS.map((nav) => {
            const item = nav.key === "review" && reviewDue > 0 ? { ...nav, badge: String(reviewDue) } : nav;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
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
                <span>{t(`nav.${item.key}`)}</span>
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
              <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>
                {band > 0 ? t("nav.band30", { band: band.toFixed(1) }) : t("nav.noBand")}
              </div>
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
            <span>{t("nav.logout")}</span>
          </button>
          <div style={{ padding: "10px 12px 0" }}>
            <LanguageSwitcher sync />
          </div>
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
              {streak > 0 ? t("nav.streak", { n: streak }) : t("nav.noStreak")}
            </span>
          </div>
        </header>

        <div style={{ flex: 1, overflow: "auto", padding: 28 }}>{children}</div>
      </main>
    </div>
  );
}
