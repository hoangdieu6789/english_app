# SpeakUp design system

SpeakUp follows the David Studio look (`david_studio/docs/design-system.md`,
`david_studio/docs/rules/ui-rules.md`): **easy to read first, fun second**, Dracula / Alucard colors,
Hogwarts humor, toy-like 3D. Its own motif is the **lightning bolt**.

Tokens: `frontend/app/globals.css` (light = `:root`, dark = `.dark` on `<html>`).
Checks: `npm run check-ui` (contrast in both themes, no raw colors, no px font sizes) and
`npm run test:theme` (theme rules).

## Theme

| Mode | Behaviour |
|------|-----------|
| System (default) | follows the OS, live |
| Light / Dark | Alucard / Dracula |
| Sun | light from sunrise to sunset at the learner's place (location asked only for this mode, rounded to 0.1°, kept on the device); no location: 06:00–18:00 |

- Saved per device: `localStorage["speakup.theme"]`, `localStorage["speakup.geo"]`.
- `lib/theme/boot.ts` runs as an inline `<head>` script before the first paint (no flash) and holds
  the rules (`sunTimes`, NOAA formula; `isDark`). `lib/theme/index.tsx` keeps `<html>` in sync with
  the OS and the clock (every minute). Switch: `components/theme-switcher.tsx` (sidebar, Progress).

## Colors

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--ds-surface-subtle` | `#FFFBEB` | `#282A36` | page |
| `--ds-surface` | `#FFFDF4` | `#21222C` | cards, sidebar, header |
| `--ds-text` / `-secondary` / `-muted` | `#3A3846` / `#504C63` / `#5C5870` | `#E2E2EA` / `#C3C8E0` / `#AAB1D3` | text |
| `--ds-primary` | `#644AC9` | `#BD93F9` | buttons, links, active nav |
| `--ds-bolt` / `--ds-bolt-fill` | `#7A6510` / `#F2C94C` | `#F1FA8C` | bolt text / bolt shape, focus ring |
| `--ds-success` / `warning` / `danger` | `#14710A` / `#9A4510` / `#B42318` | `#50FA7B` / `#FFB86C` / `#FF7A7A` | scores (always with a number) |
| `--ds-hero-bg` | purple night sky | darker purple | dashboard hero, sign-in panel |

IELTS criteria are Hogwarts houses (bar color + small eyebrow label; the criterion name stays the
label): Fluency = Gryffindor `--ds-house-fc`, Vocabulary = Ravenclaw `--ds-house-lr`,
Grammar = Slytherin `--ds-house-gra`, Pronunciation = Hufflepuff `--ds-house-pron`.

## Type

| Use | Font | Token sizes |
|-----|------|-------------|
| Body | Nunito 450 (`--font-sans`) | reading text `--text-base` 18px, labels `--text-sm` 16px, minimum `--text-xs` 14px |
| Headings | Baloo 2 (`--font-display`; Fredoka, used by the hub, has no Vietnamese letters) | `--text-lg` … `--text-4xl` |
| Logo word only | Almendra Bold (`--font-logo`) | |

Fonts come from `next/font/google` (self-hosted at build). Never write a px font size in a
component: use `var(--text-*)`.

## Shape and motion

- Cards: 16px radius, thick bottom edge `--ds-depth` (6px), crisp in light mode.
- Buttons: 48px tall (44px small), edge `--ds-primary-edge`, press down on click.
- Phones (< 900px): bottom tab bar, account menu in the top bar, grids become one column.
- Bolt motif: logo (`components/brand.tsx`), active nav marker, streak chip (flickers once),
  recording glow, daily goal ring, empty states. Our own SVGs only.
- One looping animation per screen; `prefers-reduced-motion` stops everything.
- Jokes (Platform 9¾, "Mischief managed", spells) only in taglines and empty states, never in buttons,
  always through i18n keys.
