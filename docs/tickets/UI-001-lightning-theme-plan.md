# UI-001: Lightning bolt theme (light / dark / system / by time)

Status: **plan, waiting for approval**. Branch: `feat/ui-lightning-theme`.

Goal: make SpeakUp look like part of David Studio (Dracula / Alucard colors, Hogwarts humor, toy-like 3D)
with a **lightning bolt** as the app's own motif, and let the learner pick Light, Dark, System, or a
theme that follows the time of day.

Source of truth for the shared look: `david_studio/docs/design-system.md` and
`david_studio/docs/rules/ui-rules.md`. This plan only lists what SpeakUp adds or changes.

## 1. Review (current UI, 2026-11-04)

Screenshots at 1280px and 390px (light only; there is no dark mode).

| # | Finding | Rule it breaks |
|---|---------|----------------|
| F1 | **Phone layout is broken.** The 248px sidebar stays on a 390px screen; the page is 423px wide (side scroll) and the practice sentence wraps one word per line. | ui-rules §5/§10: no side scroll at 375px |
| F2 | **Fonts never load.** `globals.css` sets `--font-sans: var(--font-sans), ...` and `--font-display: var(--font-display), ...` (self-reference = invalid), so every `font: 700 20px var(--font-display)` shorthand is dropped: page titles render as 16px system text. | design-system: fonts |
| F3 | **Text is small.** Body text 13–15px, many labels 11–12.5px. | ui-rules §2: body 18px, sidebar/labels 16px, nothing under 14px |
| F4 | **Light mode only.** No theme switch; 21 raw colors (`#fff`, `#fff7f5`, `#fdeef0`, `rgba(185,0,14,.1)`, ...) in 8 components would break a dark theme. | ui-rules §3: tokens only, no raw hex |
| F5 | **Brand does not match David Studio.** Red (#b9000e) + Inter, flat cards, no humor. | design-system: Dracula + Hogwarts |
| F6 | Touch targets 32–36px (small buttons, language select). | ui-rules §7: 48px |

## 2. Design

### 2.1 Theme modes

| Mode | Behaviour |
|------|-----------|
| **System** (default) | Follows the OS `prefers-color-scheme`, live. |
| Light | Alucard (parchment) colors. |
| Dark | Dracula colors. |
| **By time** | Light from **sunrise to sunset** at the learner's place, dark otherwise; re-checked every minute, so it switches while the app is open. |

"By time" details (approved 2026-11-04):

- Asks for the browser location **only when the learner picks "By time"**. The position is rounded to
  0.1° (about 10 km) and kept only in `localStorage`; it is never sent to the server.
- Sunrise and sunset are computed on the device (NOAA solar position formula, no network call).
- Location denied or unavailable: fixed 06:00–18:00, and the switch says so ("No location: 6:00–18:00").
- Polar day / night (no sunrise or sunset that day): light all day / dark all day.

- Switch: 4 icon + label buttons (sun, moon, monitor, clock) in the sidebar footer (next to the language
  select) and on the Progress page. Not color-only: the active one has a label and `aria-pressed`.
- Saved per device in `localStorage["speakup.theme"]` and a `speakup_theme` cookie.
- **No flash:** a tiny inline script in `<head>` sets `class="dark"` before the first paint (it can
  read the local clock for "By time", which the server cannot).
- `color-scheme: light dark` so form controls and scrollbars follow.
- Theme change animates colors for 200ms (off with reduced motion).

### 2.2 Colors (tokens)

Same palette as the hub, mapped onto SpeakUp's existing `--ds-*` token names so most inline styles
change color without edits:

| SpeakUp token | Light (Alucard) | Dark (Dracula) | Use |
|---------------|-----------------|----------------|-----|
| `--ds-surface-subtle` (page) | `#FFFBEB` | `#282A36` | background |
| `--ds-surface` (cards, sidebar) | `#FFFDF4` | `#21222C` | surfaces |
| `--ds-text` | `#3A3846` | `#E2E2EA` | body text |
| `--ds-primary` | `#644AC9` (purple) | `#BD93F9` | buttons, active nav, links |
| `--ds-bolt` (new) | `#846E15` | `#F1FA8C` | lightning bolt, streak, focus ring |
| `--ds-success` / `warning` / `danger` | `#14710A` / `#A34D14` / `#CB3A2A` | `#50FA7B` / `#FFB86C` / `#FF5555` | scores, status |

Every text/background pair is checked for 4.5:1 in both themes by a new `make check-ui`-style script
(`frontend/scripts/check-ui.mjs`). Score colors keep a number or word next to them (never color only).

**IELTS criteria as houses** (small eyebrow labels and bar colors only, buttons stay plain):
Fluency = red (Gryffindor courage), Lexical = blue (Ravenclaw wit), Grammar = green (Slytherin
precision), Pronunciation = yellow (Hufflepuff patience). Label text stays the criterion name.

### 2.3 The lightning bolt motif

All shapes are our own SVGs (no official logos, fonts or pictures).

- **Logo:** a rounded bolt in a parchment/dark tile + "SpeakUp" wordmark in Almendra Bold (Latin only,
  logo text only). New favicon / app icons rendered from the SVG.
- **Active nav item:** a small bolt marker instead of a pink background.
- **Streak chip:** bolt icon; on a new streak day it "flickers" once (one animation, then still).
- **Record button:** while recording, a bolt-yellow glow pulses (replaces the red ring); the waveform
  uses the bolt color.
- **Daily goal ring** becomes a "charge" ring: fills with bolt color; at 100% shows a bolt and a
  tagline ("Mischief managed" / "Hôm nay đủ phép rồi").
- **Section dividers / hero:** a thin zig-zag bolt line on the dashboard hero card, decorative
  (`aria-hidden`).
- Max one looping animation per screen; everything stops with `prefers-reduced-motion`.

### 2.4 Type

| Use | Font | Why |
|-----|------|-----|
| Body | **Nunito** 450 | same as the hub; has a Vietnamese subset |
| Headings | **Baloo 2** 600–700 | rounded and friendly like the hub's Fredoka, but Fredoka has **no Vietnamese glyphs** (ui-ux-pro-max: "Playful Creative" / "Kids/Education" pairings) |
| Logo only | Almendra Bold | hub logo font |

Loaded with `next/font/google` (self-hosted at build, no runtime Google request), `vietnamese` subset.
Sizes follow the hub: body 18px for reading text (questions, transcripts, feedback), 16px for
UI labels and sidebar, 14px minimum.

### 2.5 Layout and 3D

- **Phone (< 900px):** sidebar becomes a bottom tab bar (5 items, icon + label, 56px), the header
  shows the logo, streak and a menu for account / language / theme. No side scroll at 375px.
- Cards: 16px radius, crisp 1px border + `--ds-depth` (6px) colored bottom edge in light mode
  (no blurry shadows on parchment), soft glow in dark mode.
- Buttons: thick edge that presses down on click (hub `.ds-btn` style), 48px tall, 44px small.
- No card tilt (cards here hold text and controls); hover lift 2px only for clickable cards.

### 2.6 Humor (taglines only, both languages)

Short lines in empty states and greetings, never in buttons: e.g. empty history "No spells cast yet"
/ "Chưa có câu thần chú nào", review done "Mischief managed", 404 "This page went to Platform 9¾".
All through i18n keys (vi + en).

## 3. Files

| Area | Files |
|------|-------|
| Tokens, components CSS, fonts | `frontend/app/globals.css`, `frontend/app/layout.tsx` |
| Theme | new `frontend/lib/theme/` (provider, head script, `useTheme`), `components/theme-switcher.tsx` |
| Brand | new `components/brand.tsx` (bolt SVG + wordmark), `app/icon.svg`, `favicon.ico`, `apple-icon.png` |
| Shell | `components/app-shell.tsx` (responsive, bottom tabs, bolt nav) |
| Raw colors → tokens | `app/(auth)/*`, `components/auth-card.tsx`, `app/dashboard/page.tsx`, `app/welcome/page.tsx`, `app/practice/page.tsx`, `components/ielts-practice.tsx`, `components/charts/*`, `lib/score-color.ts` |
| Copy | `lib/i18n/messages/{vi,en}/*` (new tagline keys) |
| Checks + docs | `frontend/scripts/check-ui.mjs`, `docs/design-system.md` (new), this ticket's review checklist |

Backend: no change.

## 4. Test plan

- `npx tsc --noEmit`, `npx eslint .`, `node scripts/check-ui.mjs` (contrast both themes, no raw hex
  in `app/` and `components/`), `make up`.
- Browser, every page (login, register, welcome, dashboard, practice shadowing + IELTS Part 1/2/3,
  history + detail, review, progress, 404) at **1280px and 390px**, in **light, dark, system, by time**
  (fake the clock at 07:00 and 21:00), in **Vietnamese and English**.
- Measure: body font size, smallest text, touch target heights, `scrollWidth` at 375px.
- No theme flash on reload (screenshot the first paint with dark saved).
- Reduced motion on: nothing moves. Keyboard only: visible focus ring everywhere.
- Fill `docs/tickets/UI-001-review-checklist.md` with the real results.
