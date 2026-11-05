import type { settings as source } from "../vi/settings";

export const settings: Record<keyof typeof source, string> = {
  "settings.appearance.title": "Theme",
  "settings.appearance.hint": "Saved on this device. The moon / sun button in the top bar switches quickly between light and dark.",
  "settings.language.title": "Language",
  "settings.goal.title": "Band goal",
  "settings.account.title": "Account",
  "settings.account.email": "Email",
};
