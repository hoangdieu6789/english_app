# Boltspeak design system

Boltspeak ("Speak with a spark." / "Nói có lửa, chấm có tâm.") follows the David Studio look (`david_studio/docs/design-system.md`,
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

Each IELTS criterion has its own bar color (`--ds-crit-fc`, `--ds-crit-lr`, `--ds-crit-gra`,
`--ds-crit-pron`); the label is the criterion name only (no Hogwarts house names).

### Using purple

Purple is the accent only: primary buttons, links, the active nav icon, the focus of a choice.
Big surfaces never use it: hero panels are a light parchment wash (light) or charcoal (dark),
selected items use a warm neutral background, and grey text is a warm neutral (no purple cast).
`npm run check-ui` checks text on both ends of the hero gradient.

## Type

| Use | Font | Token sizes |
|-----|------|-------------|
| Body | Nunito 450 (`--font-sans`) | reading text `--text-base` 18px, labels `--text-sm` 16px, minimum `--text-xs` 14px |
| Headings | Baloo 2 (`--font-display`; Fredoka, used by the hub, has no Vietnamese letters) | `--text-lg` … `--text-4xl` |
| Logo word only (name in `frontend/lib/brand.ts`) | Almendra Bold (`--font-logo`) | |

Fonts come from `next/font/google` (self-hosted at build). Never write a px font size in a
component: use `var(--text-*)`.

## Shape and motion

- Cards: 16px radius, thick bottom edge `--ds-depth` (6px), crisp in light mode.
- Buttons: 48px tall (44px small), edge `--ds-primary-edge`, press down on click.
- Phones (< 900px): bottom tab bar, account menu in the top bar, grids become one column.
- Logo and tab icon: the David Studio bolt (the same `favicon.ico`, `icon.svg`, `apple-icon.png`,
  `icon-192/512.png` as the hub and vim-practice; copy them from `david_studio/apps/hub`, never
  redraw). `BoltMark` in `components/brand.tsx` draws the same mark from `--ds-logo-*` tokens, the
  same in light and dark. It is the only filled mark in the UI.
- Icons: Lucide line icons only, through `components/icon.tsx` (`<Icon name=... />`, one meaning =
  one icon, sizes sm 16 / md 20 / lg 24; `IconTile` for stat icons). `npm run check-ui` fails on
  icon fonts or direct `lucide-react` imports.
- Bolt motif elsewhere: streak icon (flickers once), recording glow, daily goal ring, empty states.
  Not on nav items or buttons.

## Layout

- Sidebar (wide screens): logo + slogan, the five main pages, and an account card at the bottom
  (email on one line, band) that opens a menu: Settings, Sign out.
- Active nav item: light purple background, purple icon and text, bold. No extra marker.
- Top bar: one line, the page title on the left; streak chip and a light/dark toggle on the right
  (plus the account button on phones). The page subtitle is the first line of the content.
- `AppShell width={n}`: the page's content width; the title and subtitle line up with it.
- Settings page (`/settings`): theme (system / light / dark / sun), language, band goal, account.
- Home: a full-width greeting panel (text and button left, daily ring right; on phones the small
  ring sits next to the title), a row of three stat tiles, then two cards.
- One looping animation per screen; `prefers-reduced-motion` stops everything.
- Jokes (Platform 9¾, "Mischief managed", spells) only in taglines and empty states, never in buttons,
  always through i18n keys.
