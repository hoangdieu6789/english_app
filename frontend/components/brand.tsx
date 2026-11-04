// Boltspeak brand: our own lightning bolt drawing (not an official logo) and the wordmark.
import { APP_NAME } from "@/lib/brand";

/** The bolt mark. size in px; the tile is drawn in CSS colors, so it follows the theme. */
export function BoltMark({ size = 40, tile = true }: { size?: number; tile?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false" style={{ flex: "none", display: "block" }}>
      {tile && <rect x="1" y="1" width="46" height="46" rx="13" fill="var(--ds-logo-tile)" />}
      <path
        d="M27.5 5 12 27.2h10.2L18.6 43 36 19.6H25.3L29.7 5z"
        fill="var(--ds-bolt-fill)"
        stroke={tile ? "var(--ds-logo-tile)" : "var(--ds-bolt)"}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
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
