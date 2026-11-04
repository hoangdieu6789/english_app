"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { APP_NAME } from "@/lib/brand";
import { progressQuery } from "@/lib/progress-api";
import { reviewQuery } from "@/lib/review-api";
import { authApi } from "@/lib/auth-api";
import { useSessionStore } from "@/lib/session-store";
import { useLogout } from "@/lib/use-logout";
import { setThemeMode, useResolvedDark } from "@/lib/theme";
import { Brand } from "@/components/brand";
import { Icon, type IconName } from "@/components/icon";
import { isLang, useI18n } from "@/lib/i18n";

type PageKey = "dashboard" | "practice" | "history" | "review" | "progress" | "settings";

const NAV_ITEMS: { key: PageKey; href: string; icon: IconName }[] = [
  { key: "dashboard", href: "/dashboard", icon: "home" },
  { key: "practice", href: "/practice", icon: "practice" },
  { key: "history", href: "/history", icon: "history" },
  { key: "review", href: "/review", icon: "review" },
  { key: "progress", href: "/progress", icon: "progress" },
];
// Pages reached from the account menu, not from the main nav.
const OTHER_PAGES: { key: PageKey; href: string }[] = [{ key: "settings", href: "/settings" }];

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

function Avatar({ email }: { email: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 36,
        height: 36,
        flex: "none",
        borderRadius: "50%",
        background: "var(--ds-primary-100)",
        color: "var(--ds-primary)",
        display: "grid",
        placeItems: "center",
        fontWeight: 800,
        fontSize: "var(--text-xs)",
      }}
    >
      {email ? initials(email) : "?"}
    </span>
  );
}

/** Closes a pop-up on a click outside `ref` or on Escape. */
function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}

function AccountMenu({ placement, onClose }: { placement: "up" | "down"; onClose: () => void }) {
  const { t } = useI18n();
  const logout = useLogout();
  return (
    <div id={`account-menu-${placement}`} role="menu" className={`app-menu app-menu-${placement}`}>
      <Link href="/settings" role="menuitem" className="navitem" onClick={onClose}>
        <Icon name="settings" size="md" />
        <span>{t("nav.settings")}</span>
      </Link>
      <button type="button" role="menuitem" className="navitem" onClick={logout}>
        <Icon name="logout" size="md" />
        <span>{t("nav.logout")}</span>
      </button>
    </div>
  );
}

/** Light / dark in one tap (the full choice, with System and Sun, is in Settings). */
function ThemeToggle() {
  const { t } = useI18n();
  const dark = useResolvedDark();
  const label = dark ? t("nav.toLight") : t("nav.toDark");
  return (
    <button type="button" className="app-iconbtn" onClick={() => setThemeMode(dark ? "light" : "dark")} aria-label={label} title={label}>
      <Icon name={dark ? "light" : "dark"} size="md" />
    </button>
  );
}

/**
 * The signed-in layout. Wide screens: sidebar (logo, nav, account card) and a one-line top bar.
 * Phones (< 900px): top bar (logo, streak, theme, account) and bottom tabs.
 * width: the page's content width, so the title lines up with the content.
 */
export function AppShell({ children, width = 1120 }: { children: React.ReactNode; width?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const setUser = useSessionStore((s) => s.setUser);
  const { t, lang, setLang } = useI18n();
  const [menu, setMenu] = useState<"" | "up" | "down">("");
  const sideRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => setMenu("");
  useDismiss(menu === "up", closeMenu, sideRef);
  useDismiss(menu === "down", closeMenu, topRef);

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

  if (isLoading || isError) {
    return <div style={{ padding: 24, fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("common.loading")}</div>;
  }

  const page = [...NAV_ITEMS, ...OTHER_PAGES].find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))?.key;
  const [pageTitle, pageSubtitle] = page ? [t(`nav.title.${page}`), t(`nav.sub.${page}`)] : ["", ""];
  const email = user?.email ?? "";
  const streakLabel = streak > 0 ? t("nav.streak", { n: streak }) : t("nav.noStreak");

  const streakChip = (
    <span
      title={streakLabel}
      aria-label={streakLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 36,
        fontSize: "var(--text-sm)",
        fontWeight: 700,
        padding: "0 12px",
        borderRadius: 99,
        background: streak > 0 ? "var(--ds-primary-50)" : "var(--ds-surface-muted)",
        color: streak > 0 ? "var(--ds-text)" : "var(--ds-text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ display: "inline-flex", color: streak > 0 ? "var(--ds-bolt)" : "inherit", animation: streak > 0 ? "bolt-flicker 1.2s ease-out 1" : undefined }}>
        <Icon name="streak" />
      </span>
      <span className="app-desktop-only" aria-hidden>
        {streakLabel}
      </span>
      <span className="app-mobile-only" aria-hidden>
        {streak}
      </span>
    </span>
  );

  return (
    <div className="app-root">
      <a href="#main" className="ds-skip">
        {t("nav.skip")}
      </a>

      <aside className="app-sidebar">
        <div style={{ padding: "20px 20px 8px" }}>
          <Link href="/dashboard" aria-label={APP_NAME} style={{ color: "inherit", display: "inline-flex" }}>
            <Brand size={40} />
          </Link>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)", marginTop: 6 }}>{t("nav.tagline")}</div>
        </div>

        <nav aria-label={t("nav.menu")} style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV_ITEMS.map((item) => {
            const active = item.key === page;
            return (
              <Link key={item.key} href={item.href} className="navitem" aria-current={active ? "page" : undefined}>
                <Icon name={item.icon} size="md" />
                <span>{t(`nav.${item.key}`)}</span>
                {item.key === "review" && reviewDue > 0 && <Badge n={reviewDue} />}
              </Link>
            );
          })}
        </nav>

        <div ref={sideRef} className="app-account" style={{ marginTop: "auto", padding: "12px", borderTop: "1px solid var(--ds-border-subtle)" }}>
          {menu === "up" && <AccountMenu placement="up" onClose={closeMenu} />}
          <button
            type="button"
            className="app-account-card"
            aria-haspopup="menu"
            aria-expanded={menu === "up"}
            aria-controls="account-menu-up"
            aria-label={t("nav.account")}
            onClick={() => setMenu(menu === "up" ? "" : "up")}
          >
            <Avatar email={email} />
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
              <span className="app-ellipsis" style={{ display: "block", fontWeight: 700, fontSize: "var(--text-sm)" }} title={email}>
                {email}
              </span>
              <span className="app-ellipsis" style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>
                {band > 0 ? t("nav.band30", { band: band.toFixed(1) }) : t("nav.noBand")}
              </span>
            </span>
            <Icon name={menu === "up" ? "chevronDown" : "chevronUp"} style={{ color: "var(--ds-text-muted)" }} />
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div className="app-header-inner" style={{ maxWidth: width }}>
            <Link href="/dashboard" aria-label={APP_NAME} className="app-mobile-only" style={{ color: "inherit", minHeight: 44, alignItems: "center" }}>
              <Brand size={32} />
            </Link>
            <h1 className="app-desktop-only" style={{ margin: 0, font: "700 var(--text-xl)/1.2 var(--font-display)", color: "var(--ds-text)" }}>
              {pageTitle}
            </h1>
            <div ref={topRef} style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
              {streakChip}
              <ThemeToggle />
              <button
                type="button"
                className="app-iconbtn app-mobile-only"
                aria-haspopup="menu"
                aria-expanded={menu === "down"}
                aria-controls="account-menu-down"
                aria-label={t("nav.account")}
                onClick={() => setMenu(menu === "down" ? "" : "down")}
              >
                <Icon name={menu === "down" ? "close" : "user"} size="md" />
              </button>
              {menu === "down" && <AccountMenu placement="down" onClose={closeMenu} />}
            </div>
          </div>
        </header>

        <main id="main" className="app-content" tabIndex={-1}>
          {page && (
            <div className="app-page-head" style={{ maxWidth: width }}>
              <h1 className="app-mobile-only" style={{ margin: 0, font: "700 var(--text-xl)/1.25 var(--font-display)" }}>
                {pageTitle}
              </h1>
              <p>{pageSubtitle}</p>
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
              <Icon name={item.icon} size="md" />
              <span>{t(`nav.${item.key}`)}</span>
              {item.key === "review" && reviewDue > 0 && <Badge n={reviewDue} small />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
