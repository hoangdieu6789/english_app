// Boltspeak brand: our own lightning bolt drawing (not an official logo) and the wordmark.
import { useId } from "react";
import { APP_NAME } from "@/lib/brand";

/**
 * The David Studio bolt mark: the same drawing as the tab icon (app/icon.svg, shared with the hub
 * and vim-practice). Colors come from tokens so the mark looks the same in both themes.
 */
export function BoltMark({ size = 40 }: { size?: number }) {
  const id = `bolt-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false" style={{ flex: "none", display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--ds-logo-bolt-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--ds-logo-bolt-to)" }} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="var(--ds-logo-tile)" />
      <path d="M19 3 8 18h6.5L11 29l13-16h-7l2-10z" fill={`url(#${id})`} stroke="var(--ds-logo-edge)" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/** Logo: bolt + the app name in the logo font. */
export function Brand({ size = 40 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <BoltMark size={size} />
      <span style={{ font: `700 ${size * 0.6}px/1 var(--font-logo)`, color: "var(--ds-text)", letterSpacing: 0.2 }}>{APP_NAME}</span>
    </span>
  );
}

/** A thin zig-zag bolt line (decoration only). */
export function BoltLine({ width = 160, color = "var(--ds-bolt-fill)" }: { width?: number; color?: string }) {
  return (
    <svg width={width} height="14" viewBox="0 0 160 14" aria-hidden focusable="false" preserveAspectRatio="none">
      <path d="M0 7h52l8-6-4 8 10-4-6 8 12-6h88" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
