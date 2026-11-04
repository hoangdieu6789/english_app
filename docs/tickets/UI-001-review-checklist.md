# UI-001 review checklist (real results, 2026-11-04)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | pass |
| `npx eslint .` | pass (0 problems) |
| `npm run check-ui` | pass: 51 text/background pairs x light + dark >= 4.5:1 (3:1 for focus ring and logo), no raw colors, no px font sizes in `app/` and `components/`; a probe file with `#123456` / `fontSize: 12` and a low-contrast token were caught |
| `npm run test:theme` | pass (5 tests) in Asia/Ho_Chi_Minh, America/New_York, Europe/London, Pacific/Auckland, UTC. London midsummer 03:43 / 20:21 UTC, Hanoi 2026-11-04 06:00 / 17:19, polar day/night. A bug found here (the day came from the device time zone) is fixed: the day follows the location's longitude |
| `make up` (Docker) | pass |
| Phone 390px: dashboard, practice, review, history, progress, login | no side scroll (`scrollWidth` 390), smallest visible text 16px, bottom tabs, sign-in form first |
| Desktop 1280px light + dark | dashboard, history detail (house bars), review, practice, register checked by screenshot |
| Sun mode in the browser | location granted (Hanoi override): saved `{lat: 21, lon: 105.9}`, note "Light from 06:00 AM (sunrise) to 05:19 PM (sunset)", light at 11:56 |
| No flash | with Dark saved, `<html>` already had `dark` at DOMContentLoaded (before React) |
| Reduced motion | `.fade` animation and button transitions 0.01ms |
| Keyboard | first Tab stop "Skip to content", yellow 3px focus ring on nav items |
| Vietnamese + English | both render (Baloo 2 shows Vietnamese marks); new keys in both languages |
| Touch targets | text links that are actions use `.ds-tap` (44px); buttons 44–56px |

Not done / limits:
- The theme is per device (not saved on the account).
- Charts keep their own sizes inside SVG view boxes.
