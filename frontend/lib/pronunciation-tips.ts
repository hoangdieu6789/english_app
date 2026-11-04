import { hasMessage, type MessageKey, type Params } from "@/lib/i18n";

type Translate = (key: MessageKey, params?: Params) => string;

const VOWEL = /^(aa|ae|ah|ao|aw|ax|ay|eh|er|ey|ih|iy|ow|oy|uh|uw)$/;

/**
 * How to make one English sound (Azure en-US phoneme symbol), in the learner's language, with
 * the usual learner mistake (messages "tips.phoneme.<symbol>"). Final consonants get a reminder
 * not to drop them. Shown when a word was said wrongly.
 */
export function phonemeTip(t: Translate, phoneme: string, isLast: boolean): string {
  const symbol = phoneme.toLowerCase();
  const key = `tips.phoneme.${symbol}`;
  const tip = hasMessage(key) ? t(key) : "";
  if (isLast && !VOWEL.test(symbol)) return `${tip} ${t("tips.finalSound")}`.trim();
  return tip;
}
