"use client";

// Wizard-world scenery for the games, drawn as small SVGs. Colors come from CSS classes using
// the --ds-game-* tokens (globals.css), so nothing here holds a raw color. Original drawings:
// a generic castle, a wizard with a pointed hat and a wand, a paper lantern and a tower.

export function Castle({ flip = false }: { flip?: boolean }) {
  return (
    <svg className="game-castle" viewBox="0 0 120 90" style={flip ? { transform: "scaleX(-1)" } : undefined} aria-hidden focusable="false">
      <path className="castle-wall" d="M0 90V52h10v-8h8v8h10V30l9-18 9 18v22h12V40h8v-6h8v6h8v12h10V24l10-20 10 20v66z" />
      <rect className="castle-window" x="34" y="36" width="5" height="8" rx="2.5" />
      <rect className="castle-window" x="94" y="34" width="5" height="9" rx="2.5" />
      <rect className="castle-window castle-window-2" x="62" y="56" width="5" height="8" rx="2.5" />
      <rect className="castle-window" x="12" y="62" width="5" height="7" rx="2.5" />
    </svg>
  );
}

/** The player's wizard; wandRef marks the wand tip (where spells start). */
export function Wizard({ wandRef, casting = false }: { wandRef?: React.Ref<HTMLSpanElement>; casting?: boolean }) {
  return (
    <span className="game-wizard" data-casting={casting || undefined}>
      <svg viewBox="0 0 60 80" aria-hidden focusable="false">
        <path className="wiz-robe" d="M14 80l8-40h16l8 40z" />
        <circle className="wiz-face" cx="30" cy="36" r="7" />
        <path className="wiz-hat" d="M17 31h26l-9-4L28 2l-4 25z" />
        <circle className="wiz-star" cx="27" cy="20" r="1.6" />
        <circle className="wiz-star" cx="31" cy="26" r="1.2" />
        <path className="wiz-beard" d="M24 40q6 14 12 0z" />
        <path className="wiz-wand" d="M38 52l14-22" />
        <circle className="wiz-tip" cx="52" cy="30" r="2.6" />
      </svg>
      <span ref={wandRef} className="game-wand-tip" aria-hidden />
    </span>
  );
}

/** A floating paper lantern with a word on it (Lantern Catch). */
export function LanternShape() {
  return (
    <svg className="game-lantern-svg" viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden focusable="false">
      <path className="lantern-body" d="M14 10Q50 0 86 10Q100 35 86 60Q50 70 14 60Q0 35 14 10z" />
      <path className="lantern-rib" d="M30 6Q24 35 30 65M50 3v64M70 6Q76 35 70 65" />
      <rect className="lantern-cap" x="38" y="0" width="24" height="5" rx="2" />
      <rect className="lantern-cap" x="38" y="65" width="24" height="5" rx="2" />
    </svg>
  );
}

/** A tall tower with one lit window per band of levels (Tower Climb). */
export function Tower({ level, levels }: { level: number; levels: number }) {
  const floors = 10;
  const lit = Math.ceil((level / levels) * floors);
  return (
    <svg className="game-tower" viewBox="0 0 60 220" aria-hidden focusable="false">
      <path className="tower-roof" d="M8 40L30 2l22 38z" />
      <rect className="tower-wall" x="12" y="40" width="36" height="180" />
      {Array.from({ length: floors }, (_, i) => {
        const y = 200 - i * 17;
        return <rect key={i} className={i < lit ? "tower-window tower-window-lit" : "tower-window"} x="26" y={y} width="8" height="10" rx="4" />;
      })}
    </svg>
  );
}
