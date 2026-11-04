// The language of API requests (header X-App-Lang): set by I18nProvider, read by apiFetch.
// Kept apart from the provider so lib/http has no import cycle.
let current = "vi";

export function getCurrentLang(): string {
  return current;
}

export function setCurrentLang(lang: string) {
  current = lang;
}
