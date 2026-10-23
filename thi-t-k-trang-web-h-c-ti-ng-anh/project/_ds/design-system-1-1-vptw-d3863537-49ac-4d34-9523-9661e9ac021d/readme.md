# Văn phòng Trung ương Đảng — Design System

A **framework-agnostic** design system for the digital platforms of **Văn phòng Trung
ương Đảng** (Office of the Party Central Committee, VPTWĐ). Every token, color, type ramp,
radius and shadow is extracted from the source Figma file. The component layer is built on
the **`.p-*` class vocabulary** shared by PrimeNG (Angular), PrimeReact and PrimeVue — so a
single CSS theme styles any of those frameworks **and** plain HTML, identically.

> **Brand in one line:** Party red (`#B9000E`) + national-flag gold, on calm neutral
> surfaces — formal, official, and Vietnamese-first.

## Sources
- **Figma:** `Design System 1.1 [VPTWĐ].fig` (uploaded; mounted read-only during authoring).
  Pages used: Colors / Tokens, Typography, Effect-styles, Button, Input, Checkbox, Radio,
  Badge, Alerts, Tabs, Table, Breadcrumb, Charts, Logos, Login, Header, Navigation-Bar.
- **Component model:** [PrimeNG / PrimeReact / PrimeVue v21](https://primeng.org/) — the
  shared `.p-*` structure and variant vocabulary (`severity`, `outlined`, `text`,
  `rounded`, `size`, …).
- **Live product observed in the file:** *iCPV Reputa* — "Hệ thống thu thập, tổng hợp
  thông tin trên Internet" (an internet/media-monitoring dashboard) and a member login.

## Products / surfaces
1. **iCPV Reputa** — desktop monitoring dashboard (overview, topics, articles, statistics,
   alerts, reports). Recreated in `ui_kits/icpv-reputa/`.
2. **Member login** — the shared Đăng nhập screen (số thẻ đảng / mật khẩu).
3. (Observed, not yet kitted) a **mobile member app** with a bottom tab bar
   (Trang chủ / Tính năng / Thông báo / Tài khoản).

---

## Framework-agnostic by design ("dùng chung")
The deliverable is **one portable CSS theme** — not tied to any framework:

- **`styles.css`** is the single entry point. Link it (or `@import` it) and every `.p-*`
  component is themed from the Figma token layer. No build step, no framework required.
- The same classes are what **PrimeNG (Angular)**, **PrimeReact** and **PrimeVue** emit, so
  this theme drops straight onto any of them — and renders identically in **plain HTML**
  (see `component-library.html`).
- The token tiers (`--brand-*`, `--neutral-*`, `--radius-*` → `--ds-*` aliases) live in
  `tokens/` and drive both the CSS components and any framework preset you generate from them.
- The in-repo React components are **specimen/preview** stand-ins for this environment's
  Design System tab; the source of truth is the **token + `.p-*` CSS layer**, which is
  framework-neutral. See `SKILL.md` for consuming it from any stack.

---

## CONTENT FUNDAMENTALS
The product voice is **formal, institutional Vietnamese** — the register of Party and State
communication.

- **Language:** Vietnamese first, with full diacritics. English appears only in code/tokens.
- **Address:** the reader is **"Đồng chí"** (Comrade). E.g. *"Đồng chí chưa có tài khoản?"*
  Never casual "bạn" in official flows.
- **Casing:** Sentence case for body and labels (*"Số điện thoại/ Số thẻ đảng"*). Screen
  titles are short nouns (*"Đăng nhập", "Tổng quan", "Cảnh báo"*). The org name is set in
  full caps as a wordmark: **"VĂN PHÒNG TRUNG ƯƠNG ĐẢNG"**.
- **Tone:** precise, neutral, procedural. Verbs are direct imperatives — *Đăng nhập, Lưu,
  Phê duyệt, Xuất báo cáo, Xem chi tiết*. Status is factual — *Đang xử lý, Đã hoàn thành,
  Quá hạn, Chậm*.
- **Numbers:** Vietnamese formatting — thousands separated by "." (8.420), decimals by ","
  (12,4%). Tabular figures in tables.
- **No emoji.** No exclamation/marketing tone. Helper text is instructional
  (*"Nhập số điện thoại hoặc số thẻ đảng viên"*). Errors are plain and specific
  (*"Số thẻ đảng hoặc mật khẩu không chính xác"*).
- **Support is always reachable:** the hotline **19001080** appears on entry screens.

---

## VISUAL FOUNDATIONS

**Color.** A single dominant brand: **Party red `#B9000E`** (`--brand-600` / `--primary`),
hover `#A60002` (700), active `#950002` (800), with a full 50–900 ramp. The national-flag
**gold `rgb(255,242,47)`** is reserved for the flag/logo — *never* a UI action color.
Neutrals are a cool gray ramp (`--neutral-50 #F6F7F9` … `--gray-13 #14151A`). Semantic
status: success green `#16A34A`, info blue `#2563EB`, warning orange `#EA580C`, danger red
`#DC2626` — each with a tonal surface for status badges/alerts. Primary text `#14151A`, secondary
`#4B5563`, muted `#6B7280`.

**Type.** **Inter** is the workhorse UI/body face (base 14px, line-height 1.5, weights
400/500/600/700; tabular numerals in tables). **FS PF BeauSans Pro** is the licensed
display face for titles and the wordmark — now **self-hosted** (Be Vietnam Pro remains a
fallback). Headings 20–40px+, 600–700.

**Shape & elevation.** Soft, rounded, restrained. Controls use 6–8px radius
(`--ds-radius-md 8`); cards 16px (`--ds-radius-2xl`); pills/avatars full. Borders are a hair
of cool gray (`--ds-border #E5E7EB`, strong `#C3C8D0`). Shadows are subtle and cool,
derived from the source's `rgba(18,26,43,·)` tokens — xs→xl, never heavy. Cards = white +
1px border + `--ds-shadow-sm` (no glow, no colored borders).

**Surfaces & backgrounds.** White cards on a light cool-gray app background
(`--ds-surface-subtle #F6F7F9`). The header uses a gentle horizontal white→pink gradient
(`#fff → brand-50 → brand-100`). The login uses a cream field (`#fff7f5 → #fdeef0`) with a
single decorative **red flag wave** anchored to the bottom — the only large brand graphic.
No gradients on content, no textures, no glassmorphism beyond a faint dialog backdrop blur.

**Motion.** Quick and functional — `160ms cubic-bezier(.4,0,.2,1)`. Fades and small
translate/scale on overlays (dialog 8px rise). No bounces, no decorative looping animation.

**Interaction states.**
- *Hover:* primary **lightens** (600→500, `#B9000E`→`#DC2626`, per the Figma button
  matrix); subtle/secondary buttons get an 8–9% brand or neutral tint; nav items pick up a
  light red wash.
- *Active/press:* primary **darkens** (→700, `#A60002`); tonal tints deepen.
- *Focus:* a **light-blue ring** `0 0 0 3px rgba(96,165,250,.45)` on every interactive
  control (matches the source). Error focus rings are red-tinted.
- *Selected:* brand-50 background (rows, options), red pill (tabs/nav); radio/checkbox show
  a red ring + glyph.
- *Disabled:* a shared **neutral treatment** (gray fill `--ds-surface-muted`, gray text
  `--ds-text-disabled`, light border) for buttons; gray fill for inputs; `not-allowed`
  cursor. Not an opacity fade.

**Control sizes.** Three heights mirror the Figma button set: **36 / 44 / 48px**
(sm / md / lg); md (44) is the default.

---

## ICONOGRAPHY
- **System icon font:** **PrimeIcons** (`pi pi-*`), loaded from CDN
  (`https://unpkg.com/primeicons@7.0.0/primeicons.css`). This is PrimeNG's native icon set —
  chosen for API fidelity to the user's Angular/PrimeNG target.
- **Substitution note ⚠:** the source Figma uses a mix of **Lucide** (`check-circle-2`,
  `scan-line`) and **Remix Icon** (`arrow-right-line`, `checkbox-circle-fill`) icons. These
  are not the PrimeNG default, so components use the closest PrimeIcons equivalents
  (line/regular weight). If you need pixel-exact parity with the Figma icons, swap in the
  Lucide/Remix set — the markup only needs the icon `class` changed.
- **Brand marks (real assets, in `assets/logos/`):** the **Party + national flag** wave
  (`flag-red.svg` + gold `flag-hs.svg` hammer-sickle + gold `flag-star.svg`) and the **app
  favicon** (red rounded square + gold hammer-sickle). Composed by `<Logo>`. Gold = the only
  place gold is used.
- **No emoji. No ad-hoc unicode glyphs.** Status is conveyed by colored Badge labels, not icons.

---

## TYPOGRAPHY / FONT CAVEATS ⚠
- **FS PF BeauSans Pro** (source display face) is now **self-hosted** in `fonts/`
  (`PFBeauSansPro-*.ttf`, weights 100–900 + italics) and leads `--font-display`. **Be
  Vietnam Pro** (Google Fonts CDN) is kept as a fallback. The Figma token
  `--font-family-font-2` points at "FS PF BeauSans Pro".
- A few imported tokens reference **Hanken-Grotesk** and a stray weight token — left pointing
  at their source families (fallback stacks render) pending font uploads.
- **Please upload these font files** if you want exact parity with the source.

---

## INDEX — what's in here
**Foundations / global CSS**
- `styles.css` — **the single entry point. Link/`@import` this one file** to theme everything.
- `tokens/fig-tokens.css` — 1,800+ Figma Variables, verbatim names, mode-scoped.
- `tokens/foundation.css` — `--ds-*` semantic aliases (px-resolved radius/spacing, shadows,
  surfaces, text, borders, focus, status, control sizes).
- `tokens/fonts.css` — Inter + Hanken Grotesk + FS PF BeauSans Pro (self-hosted); Be Vietnam Pro (`@import` Google Fonts, fallback).
- `tokens/base.css` — reset + document defaults.

**Framework-agnostic component CSS** (`.p-*` classes → consumed by PrimeNG / PrimeReact /
PrimeVue / plain HTML; barrel: `components/theme.css`)
- `components/button/` + `components/misc/` — **Button, SplitButton, SpeedDial**, and media/
  misc (Image, Carousel, Galleria, FileUpload, ProgressBar, ProgressSpinner, Skeleton,
  ScrollTop, Inplace, BlockUI, MeterGroup, Chip)
- `components/forms/` — **InputText, Textarea, Select, MultiSelect, AutoComplete, Checkbox,
  RadioButton, ToggleSwitch, SelectButton, Slider, Rating, Knob, ColorPicker, Listbox,
  InputNumber, Password, InputOTP, DatePicker, FormField**
- `components/data/` — **DataTable, Paginator, Tree, TreeTable, Timeline, DataView, OrderList,
  PickList, Badge, Avatar** (Badge unifies status tags + count/dot indicators)
- `components/panel/` — **Card, Dialog, Accordion, Panel, Fieldset, Divider, Toolbar,
  Splitter, Stepper/Steps, ScrollPanel**
- `components/navigation/` — **Breadcrumb, Tabs, Menu, Menubar, MegaMenu, PanelMenu,
  ContextMenu, TieredMenu, TabMenu, Dock**
- `components/overlay/` — **Drawer, Popover, ConfirmPopup, ConfirmDialog**
- `components/feedback/` — **Message (Alerts), Toast, Tooltip, EmptyState**

**Preview components** (React `.jsx` + `.d.ts` + card — specimen layer for this environment's
Design System tab; `window.DesignSystem_d38635.<Name>`). The portable source of truth is the
CSS layer above — these mirror it for the in-tab preview.
- Button · InputText/Textarea/Select/Checkbox/RadioButton/ToggleSwitch/FormField ·
  DataTable/Badge/Avatar · Message/Tooltip/EmptyState · Breadcrumb/Tabs · Card/Dialog · Logo

**Specimen cards** (Design System tab) — `guidelines/*.card.html` (Colors, Type, Spacing),
`components/*/*.card.html` (Components), `component-library.html` (full `.p-*` library, plain
HTML — includes the inventory + variant/state/responsive/a11y matrices + PrimeNG mapping),
`components/brand/brand.card.html` (Brand).

**UI kits** — `ui_kits/icpv-reputa/` (Login → Tổng quan dashboard).

**Assets** — `assets/logos/` (flag fragments + favicon).

**Skill** — `SKILL.md` (Agent-Skill compatible).
