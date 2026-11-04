"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LANGUAGES, DEFAULT_LANG, LANG_COOKIE, isLang, type Lang, type MessageKey } from "./languages";
import { apiFetch } from "@/lib/http";
import { getCurrentLang, setCurrentLang } from "./current";

export { LANGUAGES, DEFAULT_LANG, isLang, type Lang, type MessageKey } from "./languages";

const STORAGE_KEY = "speakup.lang";

export function getLang(): Lang {
  const l = getCurrentLang();
  return isLang(l) ? l : DEFAULT_LANG;
}

export type Params = Record<string, string | number>;

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const def = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  let s: string = def.messages[key] ?? LANGUAGES[0].messages[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

/** True when key is a message key (for keys built at run time, e.g. "tip.ae"). */
export function hasMessage(key: string): key is MessageKey {
  return key in LANGUAGES[0].messages;
}

type I18n = {
  lang: Lang;
  locale: string; // for dates and numbers (vi-VN, en-US, ...)
  t: (key: MessageKey, params?: Params) => string;
  /** Changes the language; sync=true also saves it on the server (signed-in pages). */
  setLang: (lang: Lang, sync?: boolean) => Promise<void>;
};

const I18nContext = createContext<I18n | null>(null);

/**
 * initialLang comes from the root layout: the speakup_lang cookie, else the browser's
 * Accept-Language on a first visit, so the first render is already in the right language.
 */
export function I18nProvider({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  setCurrentLang(lang);

  useEffect(() => {
    setCurrentLang(lang);
    document.documentElement.lang = lang;
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const setLang = useCallback(async (next: Lang, sync = false) => {
    setCurrentLang(next);
    setLangState(next);
    if (sync) await saveLang(next);
  }, []);

  const value = useMemo<I18n>(() => {
    const def = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
    return { lang, locale: def.locale, t: (key, params) => translate(lang, key, params), setLang };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

/** Saves the learner's language on the server (UI, AI feedback, meanings). */
export async function saveLang(lang: Lang): Promise<void> {
  await apiFetch("/settings/lang", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang }),
  }).catch(() => undefined);
}
