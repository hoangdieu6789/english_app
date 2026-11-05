"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BoltMark } from "@/components/brand";
import { Icon, type IconName } from "@/components/icon";
import { ARC_FRAMES, Lightning, STRIKE_FRAMES, loadLightning } from "@/components/lightning-fx";
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

// Password reveal with the "Lightning VFX" animation (components/lightning-fx.tsx): an electric
// bolt strikes the field from above, then an arc runs across it and the password is uncovered
// behind the arc (hide: the arc runs again and wipes the text away). The input keeps its dots
// underneath; an overlay with the text is clipped. Timings match the CSS (pw-*).
const SHOW_MS = 1050;
const HIDE_MS = 700;
const MAX_FX_CHARS = 32; // longer values would scroll inside the input: plain toggle

/**
 * A labelled input row (label above, optional link on the right of the label).
 * Password fields get a bolt show/hide button and a Caps Lock warning.
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
  const [fx, setFx] = useState<"" | "show" | "hide">("");
  const [run, setRun] = useState(0); // restarts the CSS animations on a quick second click
  const timer = useRef<number | undefined>(undefined);
  const [caps, setCaps] = useState(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = String(input.value ?? "");

  async function toggle() {
    window.clearTimeout(timer.current);
    // While a sweep runs, the state the learner sees is where that sweep is going.
    const next = !(fx ? fx === "show" : shown);
    const plain = !value || value.length > MAX_FX_CHARS || matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The animation file loads on first use (preloaded on focus); if it fails, plain toggle.
    const ready = plain ? false : await loadLightning().then(() => true, () => false);
    if (!ready) {
      setFx("");
      setShown(next);
      return;
    }
    // The input keeps showing dots; an overlay with the text is uncovered behind the bolt.
    setShown(false);
    setFx(next ? "show" : "hide");
    setRun((r) => r + 1);
    timer.current = window.setTimeout(() => {
      setShown(next);
      setFx("");
    }, next ? SHOW_MS : HIDE_MS);
  }

  const isPassword = type === "password";
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"));
  const pressed = fx ? fx === "show" : shown;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <label htmlFor={id} style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--ds-text-secondary)" }}>
          {label}
        </label>
        {aside}
      </div>
      {isPassword ? (
        <div className="auth-pw" data-fx={fx || undefined}>
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
          {fx && (
            <span key={run} className="auth-pw-fx" aria-hidden>
              <span className="auth-pw-text">{value}</span>
              {fx === "show" && <Lightning frames={STRIKE_FRAMES} className="pw-strike" />}
              <Lightning frames={ARC_FRAMES} delay={fx === "show" ? 330 : 0} stretch className="pw-arc" />
            </span>
          )}
          <button
            type="button"
            className="auth-pw-toggle"
            onClick={toggle}
            onPointerEnter={() => void loadLightning().catch(() => {})}
            onFocus={() => void loadLightning().catch(() => {})}
            aria-pressed={pressed}
            aria-controls={id}
            aria-label={pressed ? t("auth.field.hidePassword") : t("auth.field.showPassword")}
            title={pressed ? t("auth.field.hidePassword") : t("auth.field.showPassword")}
          >
            <span className="auth-pw-icons" data-shown={pressed || undefined}>
              <Icon name="show" size="md" />
              <Icon name="hide" size="md" />
            </span>
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
