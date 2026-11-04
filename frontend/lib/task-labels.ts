import { hasMessage, type MessageKey } from "@/lib/i18n";

/** Label of a task type (common.task.*); unknown types are shown as they are. */
export function taskLabel(t: (key: MessageKey) => string, taskType: string): string {
  const key = `common.task.${taskType}`;
  return hasMessage(key) ? t(key) : taskType;
}

/** Date and time in the learner's locale (from useI18n().locale). */
export function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}
