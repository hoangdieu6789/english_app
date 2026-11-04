"use client";

import { useThemeSync } from "@/lib/theme";

/** Keeps the theme in sync with the OS and the clock (renders nothing). */
export function ThemeSync() {
  useThemeSync();
  return null;
}
