"use client";

import { useState } from "react";
import Link from "next/link";
import { BoltMark } from "@/components/brand";
import { Icon, type IconName } from "@/components/icon";
import { LanguageSwitcher } from "@/components/language-switcher";
import { APP_NAME } from "@/lib/brand";
import { useI18n, type MessageKey } from "@/lib/i18n";

const FEATURES: { icon: IconName; key: MessageKey }[] = [
  { icon: "record", key: "auth.brand.feature1" },
  { icon: "review", key: "auth.brand.feature2" },
  { icon: "progress", key: "auth.brand.feature3" },
];

/**
 * The signed-out pages (sign in, sign up, forgot / reset password): one card with the brand
 * panel on the left and the form on the right; on phones the form comes first under a short
 * brand header. The language picker sits in the page's top-right corner.
 */
export function AuthLayout({
  heroTitle,
  heroIntro,
  title,
  subtitle,
  children,
}: {
  heroTitle: string;
  heroIntro: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="auth-page">
      <div className="auth-lang">
        <LanguageSwitcher />
      </div>

      <div className="auth-card fade">
        <aside className="auth-hero">
          <span className="auth-storm" aria-hidden />
          <span className="auth-flash" aria-hidden />
          <Link href="/login" aria-label={APP_NAME} className="auth-logo" style={{ display: "inline-flex", alignItems: "center", gap: 12, color: "inherit" }}>
            <span className="auth-strike">
              <BoltMark size={44} />
            </span>
            <span style={{ font: "700 var(--text-2xl)/1 var(--font-logo)" }}>{APP_NAME}</span>
          </Link>
          <div className="auth-hero-body">
            <h1 style={{ margin: 0, font: "700 var(--text-3xl)/1.2 var(--font-display)" }}>{heroTitle}</h1>
            <p style={{ margin: "12px 0 0", fontSize: "var(--text-base)", lineHeight: 1.6, color: "var(--ds-hero-text-muted)" }}>{heroIntro}</p>
            <ul className="auth-features">
              {FEATURES.map((f) => (
                <li key={f.key}>
                  <span className="auth-feature-icon">
                    <Icon name={f.icon} size="md" />
                  </span>
                  <span>{t(f.key)}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="auth-form">
          <div>
            <h2 style={{ margin: 0, font: "700 var(--text-2xl)/1.25 var(--font-display)", color: "var(--ds-text)" }}>{title}</h2>
            <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", lineHeight: 1.5 }}>{subtitle}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * A labelled input row (label above, optional link on the right of the label).
 * Password fields get a show/hide button and a Caps Lock warning.
 */
export function AuthField({
  id,
  label,
  aside,
  type,
  ...input
}: { id: string; label: string; aside?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const isPassword = type === "password";
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <label htmlFor={id} style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--ds-text-secondary)" }}>
          {label}
        </label>
        {aside}
      </div>
      {isPassword ? (
        <div className="auth-pw">
          <input
            id={id}
            className="ds-input"
            type={shown ? "text" : "password"}
            onKeyDown={onKey}
            onKeyUp={onKey}
            onBlur={() => setCaps(false)}
            aria-describedby={caps ? `${id}-caps` : undefined}
            {...input}
          />
          <button
            type="button"
            className="auth-pw-toggle"
            onClick={() => setShown((v) => !v)}
            aria-pressed={shown}
            aria-controls={id}
            aria-label={shown ? t("auth.field.hidePassword") : t("auth.field.showPassword")}
            title={shown ? t("auth.field.hidePassword") : t("auth.field.showPassword")}
          >
            <Icon name={shown ? "hide" : "show"} size="md" />
          </button>
        </div>
      ) : (
        <input id={id} className="ds-input" type={type} {...input} />
      )}
      {isPassword && caps && (
        <span id={`${id}-caps`} role="status" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--ds-warning)" }}>
          <Icon name="capsLock" />
          {t("auth.field.capsLock")}
        </span>
      )}
    </div>
  );
}

/** Centered line under the submit button ("No account yet? Sign up"). */
export function AuthSwitch({ text, href, link }: { text: string; href: string; link: string }) {
  return (
    <p style={{ margin: 0, textAlign: "center", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>
      {text}{" "}
      <Link href={href} className="ds-tap" style={{ fontWeight: 700 }}>
        {link}
      </Link>
    </p>
  );
}
