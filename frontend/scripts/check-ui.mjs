#!/usr/bin/env node
// UI checks (docs/design-system.md): text contrast >= 4.5:1 in light and dark, no raw colors
// and no raw px font sizes in app/ and components/. Run: node scripts/check-ui.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const css = readFileSync(join(root, "app/globals.css"), "utf8");

function block(selector) {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const end = css.indexOf("\n}", start);
  const vars = {};
  for (const m of css.slice(start, end).matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}
const light = block(":root");
const dark = { ...light, ...block(".dark") };

function hex(theme, name) {
  let v = theme[name];
  for (let i = 0; v && v.startsWith("var(") && i < 5; i++) v = theme[v.slice(4, -1)];
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} is not a hex color: ${v}`);
  return v;
}
function lum(h) {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [text, background, minimum]: every text color on every surface it is used on.
const SURFACES = ["--ds-surface", "--ds-surface-subtle", "--ds-surface-muted"];
const TEXTS = ["--ds-text", "--ds-text-secondary", "--ds-text-muted", "--ds-primary", "--ds-success", "--ds-warning", "--ds-danger", "--ds-info", "--ds-bolt", "--ds-house-fc", "--ds-house-lr", "--ds-house-gra", "--ds-house-pron"];
const PAIRS = [];
for (const t of TEXTS) for (const s of SURFACES) PAIRS.push([t, s, 4.5]);
PAIRS.push(
  ["--ds-primary", "--ds-primary-50", 4.5], // active nav item
  ["--ds-text", "--ds-primary-50", 4.5], // streak chip
  ["--ds-primary-contrast", "--ds-primary", 4.5], // button text
  ["--ds-primary", "--ds-primary-100", 4.5], // avatar initials
  ["--ds-success", "--ds-success-bg", 4.5],
  ["--ds-warning", "--ds-warning-bg", 4.5],
  ["--ds-danger", "--ds-danger-bg", 4.5],
  ["--ds-info", "--ds-info-bg", 4.5],
  ["--ds-hero-text", "--ds-logo-tile", 4.5],
  ["--ds-logo-bolt-from", "--ds-logo-tile", 3], // logo bolt (graphic, 3:1)
  ["--ds-logo-bolt-to", "--ds-logo-tile", 3],
  ["--ds-focus", "--ds-surface", 3], // focus ring (non-text, 3:1)
  ["--ds-border-strong", "--ds-surface", 1.5],
  ["--ds-bolt", "--ds-primary-50", 3], // streak icon on the streak chip (graphic, 3:1)
);

let failed = 0;
for (const [name, theme] of [["light", light], ["dark", dark]]) {
  for (const [fg, bg, min] of PAIRS) {
    const r = ratio(hex(theme, fg), hex(theme, bg));
    if (r < min) {
      failed++;
      console.log(`FAIL contrast ${name}: ${fg} on ${bg} = ${r.toFixed(2)} (min ${min})`);
    }
  }
}

// Source rules
function* files(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith(".tsx")) yield p;
  }
}
const ALLOW_PX_FONT = new Set(["components/brand.tsx"]); // logo size is computed
for (const dir of ["app", "components"]) {
  for (const p of files(join(root, dir))) {
    const rel = relative(root, p);
    readFileSync(p, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(line) && !line.trim().startsWith("//")) {
          failed++;
          console.log(`FAIL raw color ${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
        }
        // Icons: one set, one registry (components/icon.tsx).
        if (/\bpi pi-|<i className=/.test(line)) {
          failed++;
          console.log(`FAIL icon font ${rel}:${i + 1}: use <Icon name=... /> from components/icon.tsx`);
        }
        if (/from "lucide-react"/.test(line) && rel !== "components/icon.tsx") {
          failed++;
          console.log(`FAIL direct lucide import ${rel}:${i + 1}: add the icon to ICONS in components/icon.tsx`);
        }
        const px = line.match(/fontSize: (\d+(?:\.\d+)?)\b|font: ["`]\d{3} (\d+(?:\.\d+)?)px/);
        if (px && !ALLOW_PX_FONT.has(rel)) {
          const v = Number(px[1] ?? px[2]);
          // icon glyph sizes (<i> elements) may use px; text must use --text-* tokens
          if (!line.includes("<i ")) {
            failed++;
            console.log(`FAIL px font size ${rel}:${i + 1}: ${v}px, use var(--text-*)`);
          }
        }
      });
  }
}

const reduced = /@media \(prefers-reduced-motion: reduce\)/.test(css);
if (!reduced) {
  failed++;
  console.log("FAIL no prefers-reduced-motion rule in globals.css");
}

console.log(failed ? `\n${failed} problem(s)` : `check-ui: OK (${PAIRS.length} color pairs x 2 themes, no raw colors, px fonts or stray icons)`);
process.exit(failed ? 1 : 0);
