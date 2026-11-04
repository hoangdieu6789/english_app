"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { progressQuery } from "@/lib/progress-api";
import { reviewQuery } from "@/lib/review-api";
import { authApi } from "@/lib/auth-api";
import { useSessionStore } from "@/lib/session-store";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Brand, BoltMark } from "@/components/brand";
import { isLang, useI18n } from "@/lib/i18n";

type NavKey = "dashboard" | "practice" | "history" | "review" | "progress";

const NAV_ITEMS: { key: NavKey; href: string; icon: string }[] = [
  { key: "dashboard", href: "/dashboard", icon: "pi pi-home" },
  { key: "practice", href: "/practice", icon: "pi pi-microphone" },
  { key: "history", href: "/history", icon: "pi pi-history" },
  { key: "review", href: "/review", icon: "pi pi-book" },
  { key: "progress", href: "/progress", icon: "pi pi-chart-line" },
];

function initials(email: string) {
  return email.split("@")[0].slice(0, 2).toUpperCase();
}

function Badge({ n, small = false }: { n: number; small?: boolean }) {
  return (
    <span
      style={{
        marginLeft: small ? 0 : "auto",
        position: small ? "absolute" : "static",
        top: 2,
        right: "calc(50% - 26px)",
        background: "var(--ds-primary)",
        color: "var(--ds-primary-contrast)",
        fontSize: "var(--text-xs)",
        fontWeight: 800,
        minWidth: small ? 22 : 24,
        height: small ? 22 : 24,
        borderRadius: 99,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 6px",
      }}
    >
      {n}
    </span>
  );
}

/**
 * The signed-in layout. Wide screens: sidebar (logo, nav, account, theme, language).
 * Phones (< 900px): top bar (logo, streak, account menu) and bottom tabs.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const setUser = useSessionStore((s) => s.setUser);
  const { t, lang, setLang } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

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
    return <div style={{ padding: 24, fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("common.loading")}</div>;
  }

  const page = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))?.key;
  const [pageTitle, pageSubtitle] = page ? [t(`nav.title.${page}`), t(`nav.sub.${page}`)] : ["", ""];

  const streakChip = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: "var(--text-sm)",
        fontWeight: 700,
        padding: "6px 12px",
        borderRadius: 99,
        background: streak > 0 ? "var(--ds-primary-50)" : "var(--ds-surface-muted)",
        color: streak > 0 ? "var(--ds-text)" : "var(--ds-text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={streak > 0 ? { animation: "bolt-flicker 1.2s ease-out 1" } : undefined}>
        <BoltMark size={20} tile={false} />
      </span>
      {streak > 0 ? t("nav.streak", { n: streak }) : t("nav.noStreak")}
    </span>
  );

  const account = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 8 }}>
        <span
          aria-hidden
          style={{
            width: 40,
            height: 40,
            flex: "none",
            borderRadius: "50%",
            background: "var(--ds-primary-100)",
            color: "var(--ds-primary)",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: "var(--text-sm)",
          }}
        >
          {user ? initials(user.email) : "?"}
        </span>
        <div style={{ lineHeight: 1.35, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--ds-text)", overflowWrap: "anywhere" }}>{user?.email ?? ""}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>
            {band > 0 ? t("nav.band30", { band: band.toFixed(1) }) : t("nav.noBand")}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 8px 0" }}>
        <ThemeSwitcher compact />
        <LanguageSwitcher sync />
        <button className="navitem" onClick={handleLogout} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
          <i className="pi pi-sign-out" aria-hidden style={{ width: 20 }} />
          <span>{t("nav.logout")}</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="app-root">
      <a href="#main" className="ds-skip">
        {t("nav.skip")}
      </a>

      <aside className="app-sidebar">
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--ds-border-subtle)" }}>
          <Link href="/dashboard" aria-label="SpeakUp" style={{ color: "inherit", display: "inline-flex" }}>
            <Brand size={40} />
          </Link>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)", marginTop: 8 }}>{t("nav.tagline")}</div>
        </div>

        <nav aria-label={t("nav.menu")} style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV_ITEMS.map((item) => {
            const active = item.key === page;
            return (
              <Link key={item.key} href={item.href} className="navitem" aria-current={active ? "page" : undefined}>
                <i className={item.icon} aria-hidden style={{ fontSize: 18, width: 20 }} />
                <span>{t(`nav.${item.key}`)}</span>
                {item.key === "review" && reviewDue > 0 && <Badge n={reviewDue} />}
              </Link>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", padding: "14px 12px 18px", borderTop: "1px solid var(--ds-border-subtle)" }}>{account}</div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <Link href="/dashboard" aria-label="SpeakUp" className="app-mobile-only" style={{ color: "inherit", minHeight: 44, alignItems: "center" }}>
            <Brand size={32} />
          </Link>
          <div className="app-desktop-only" style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, font: "700 var(--text-2xl)/1.2 var(--font-display)", color: "var(--ds-text)" }}>{pageTitle}</h1>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{pageSubtitle}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {streakChip}
            <button
              type="button"
              className="app-mobile-only ds-btn ds-btn-outline ds-btn-sm"
              aria-expanded={menuOpen}
              aria-controls="account-menu"
              aria-label={t("nav.account")}
              onClick={() => setMenuOpen((v) => !v)}
              style={{ padding: "0 12px" }}
            >
              <i className={menuOpen ? "pi pi-times" : "pi pi-user"} aria-hidden />
            </button>
          </div>
        </header>

        {menuOpen && (
          <div id="account-menu" className="app-mobile-only ds-card" style={{ flexDirection: "column", margin: "8px 14px 0", padding: 12 }}>
            {account}
          </div>
        )}

        <main id="main" className="app-content" tabIndex={-1}>
          {page && (
            <div className="app-mobile-only" style={{ flexDirection: "column", marginBottom: 14 }}>
              <h1 style={{ margin: 0, font: "700 var(--text-xl)/1.25 var(--font-display)" }}>{pageTitle}</h1>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{pageSubtitle}</div>
            </div>
          )}
          {children}
        </main>
      </div>

      <nav className="app-bottomnav" aria-label={t("nav.menu")}>
        {NAV_ITEMS.map((item) => {
          const active = item.key === page;
          return (
            <Link key={item.key} href={item.href} aria-current={active ? "page" : undefined}>
              <i className={item.icon} aria-hidden />
              <span>{t(`nav.${item.key}`)}</span>
              {item.key === "review" && reviewDue > 0 && <Badge n={reviewDue} small />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
