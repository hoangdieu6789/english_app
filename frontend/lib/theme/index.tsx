"use client";

import { useEffect, useSyncExternalStore } from "react";
import { GEO_KEY, THEME_KEY, isDark, sunTimes, type Geo, type ThemeMode } from "./boot";


export type { ThemeMode, Geo } from "./boot";

// The learner's theme lives in localStorage (per device). React reads it with
// useSyncExternalStore (no setState in effects); writes notify the subscribers.
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === GEO_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function readMode(): ThemeMode {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" || v === "time" ? v : "system";
}

function readGeoRaw(): string {
  return localStorage.getItem(GEO_KEY) ?? "";
}

export function parseGeo(raw: string): Geo | null {
  try {
    const g = JSON.parse(raw || "null");
    return g && typeof g.lat === "number" && typeof g.lon === "number" ? g : null;
  } catch {
    return null;
  }
}

/** Applies the theme to <html> now (class "dark"); fade=true animates the color change. */
export function applyTheme(mode: ThemeMode, fade = false) {
  const root = document.documentElement;
  const dark = isDark(mode, Date.now(), matchMedia("(prefers-color-scheme: dark)").matches, parseGeo(readGeoRaw()));
  if (dark === root.classList.contains("dark")) return;
  if (fade) {
    root.classList.add("ds-theme-fade");
    window.setTimeout(() => root.classList.remove("ds-theme-fade"), 260);
  }
  root.classList.toggle("dark", dark);
}

/** Keeps <html> in sync: OS changes (system mode) and the clock (time mode, every minute). */
export function useThemeSync() {
  const mode = useThemeMode();
  const geo = useSyncExternalStore(subscribe, readGeoRaw, () => "");
  useEffect(() => {
    applyTheme(mode);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(mode, true);
    media.addEventListener("change", onChange);
    const timer = mode === "time" ? window.setInterval(onChange, 60_000) : undefined;
    return () => {
      media.removeEventListener("change", onChange);
      if (timer) window.clearInterval(timer);
    };
  }, [mode, geo]);
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, readMode, () => "system");
}

export type GeoState = { status: "none" } | { status: "denied" } | { status: "ok"; geo: Geo };

export function useGeoState(): GeoState {
  const raw = useSyncExternalStore(subscribe, readGeoRaw, () => "");
  if (raw === "denied") return { status: "denied" };
  const geo = parseGeo(raw);
  return geo ? { status: "ok", geo } : { status: "none" };
}

/**
 * Saves the theme. For "time" it asks for the location (only then); the position is rounded
 * to 0.1° and kept on this device only. Denied or unavailable: 06:00-18:00.
 */
export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode, true);
  emit();
  if (mode === "time" && !parseGeo(readGeoRaw()) && "geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const round = (v: number) => Math.round(v * 10) / 10;
        localStorage.setItem(GEO_KEY, JSON.stringify({ lat: round(pos.coords.latitude), lon: round(pos.coords.longitude) }));
        applyTheme("time", true);
        emit();
      },
      () => {
        localStorage.setItem(GEO_KEY, "denied");
        emit();
      },
      { maximumAge: 24 * 3600_000, timeout: 15_000 },
    );
  }
}

function subscribeHtmlClass(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

/** True when the page is dark right now (whatever the mode). */
export function useResolvedDark(): boolean {
  return useSyncExternalStore(subscribeHtmlClass, () => document.documentElement.classList.contains("dark"), () => false);
}

/** Forgets the saved location (the next "time" pick asks again). */
export function clearGeo() {
  localStorage.removeItem(GEO_KEY);
  emit();
}

/** Today's sunrise and sunset at geo (for the switch's note). */
export function sunToday(geo: Geo) {
  return sunTimes(Date.now(), geo.lat, geo.lon);
}
