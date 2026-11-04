// The languages of the app. To add one:
//   1. copy messages/en/ to messages/<code>/ and translate every file (TypeScript fails until
//      every key of the Vietnamese source is present);
//   2. add it to LANGUAGES below;
//   3. add it to the backend list (backend/internal/i18n) so the AI writes in it.
import { vi } from "./messages/vi";
import { en } from "./messages/en";

export type MessageKey = keyof typeof vi;
export type Messages = Record<MessageKey, string>;

export const LANGUAGES = [
  { code: "vi", label: "Tiếng Việt", locale: "vi-VN", messages: vi as Messages },
  { code: "en", label: "English", locale: "en-US", messages: en },
] as const satisfies readonly { code: string; label: string; locale: string; messages: Messages }[];

export type Lang = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANG: Lang = "vi";
export const LANG_COOKIE = "speakup_lang";

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && LANGUAGES.some((l) => l.code === v);
}
