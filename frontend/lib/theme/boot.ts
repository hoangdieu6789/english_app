// Theme boot: runs as an inline <head> script before the first paint, so a saved dark theme
// never flashes light. It is also imported by the React side (lib/theme/index.tsx), so the
// rules exist once. Keep every function here self-contained (no imports, no closures over
// module values): bootScript() inlines them with Function.prototype.toString().

export type ThemeMode = "system" | "light" | "dark" | "time";
export type Geo = { lat: number; lon: number };

export const THEME_KEY = "speakup.theme";
export const GEO_KEY = "speakup.geo"; // {lat, lon} rounded to 0.1°, or "denied"

/**
 * Sunrise and sunset (ms since epoch) for the local day of `now` at lat/lon, from the NOAA
 * solar position equations (accurate to about a minute). `polar` is "day" or "night" when the
 * sun does not rise or set that day.
 */
export function sunTimes(now: number, lat: number, lon: number): { rise: number; set: number; polar: "" | "day" | "night" } {
  const rad = Math.PI / 180;
  // The day at the place (solar time from the longitude), not the device's time zone.
  const d = new Date(now + lon * 240000);
  const noonUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
  const n = (noonUtc - Date.UTC(2000, 0, 1, 12)) / 86400000; // days since J2000
  const meanAnomaly = (357.5291 + 0.98560028 * n) % 360;
  const center =
    1.9148 * Math.sin(meanAnomaly * rad) + 0.02 * Math.sin(2 * meanAnomaly * rad) + 0.0003 * Math.sin(3 * meanAnomaly * rad);
  const eclipticLon = (meanAnomaly + center + 180 + 102.9372) % 360;
  const transit = 2451545 + n - lon / 360 + 0.0053 * Math.sin(meanAnomaly * rad) - 0.0069 * Math.sin(2 * eclipticLon * rad);
  const declination = Math.asin(Math.sin(eclipticLon * rad) * Math.sin(23.4397 * rad));
  const cosHour =
    (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(declination)) / (Math.cos(lat * rad) * Math.cos(declination));
  if (cosHour < -1) return { rise: 0, set: 0, polar: "day" };
  if (cosHour > 1) return { rise: 0, set: 0, polar: "night" };
  const hourAngle = Math.acos(cosHour) / rad / 360;
  const toMs = (julian: number) => (julian - 2440587.5) * 86400000;
  return { rise: toMs(transit - hourAngle), set: toMs(transit + hourAngle), polar: "" };
}

/** True when the theme should be dark for this mode at `now`. */
export function isDark(mode: ThemeMode, now: number, systemDark: boolean, geo: Geo | null): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  if (mode === "system") return systemDark;
  if (geo) {
    const s = sunTimes(now, geo.lat, geo.lon);
    if (s.polar) return s.polar === "night";
    return now < s.rise || now >= s.set;
  }
  const h = new Date(now).getHours(); // no location: light 06:00-18:00
  return h < 6 || h >= 18;
}

function boot() {
  try {
    const raw = localStorage.getItem("speakup.theme");
    const mode = raw === "light" || raw === "dark" || raw === "time" ? raw : "system";
    let geo = null;
    try {
      const g = JSON.parse(localStorage.getItem("speakup.geo") || "null");
      if (g && typeof g.lat === "number" && typeof g.lon === "number") geo = g;
    } catch {}
    const dark = isDark(mode, Date.now(), matchMedia("(prefers-color-scheme: dark)").matches, geo);
    document.documentElement.classList.toggle("dark", dark);
  } catch {}
}

/** The inline <head> script (rendered by app/layout.tsx). */
export function bootScript(): string {
  return `${sunTimes.toString()}\n${isDark.toString()}\n(${boot.toString()})();`;
}
