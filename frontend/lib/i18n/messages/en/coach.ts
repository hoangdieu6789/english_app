import type { coach as source } from "../vi/coach";

export const coach: Record<keyof typeof source, string> = {
  "coach.sampleFailed": "AI could not write a sample answer.",
  "coach.sampleFailedRetry": "AI could not write a sample answer. Try again later.",
  "coach.showSample": "See sample answer",
  "coach.sampleTitle": "Sample answer",
  "coach.sampleBand": " · band {band}",
  "coach.sampleLoading": "AI is writing a sample answer (about 10–30 seconds the first time)...",
  "coach.phrases": "Useful phrases",
  "coach.sampleNote": "Use it to learn ideas and phrasing; answer with your own ideas when you practise.",
  "coach.improveFailed": "AI could not rewrite it.",
  "coach.improveFailedRetry": "AI could not rewrite your answer. Try again later.",
  "coach.improvedTitle": "Your answer, a better version",
  "coach.improvedHint": "AI keeps your ideas, fixes the grammar and lifts the vocabulary to your target band.",
  "coach.improving": "AI is rewriting...",
  "coach.improve": "Rewrite my answer",
  "coach.band": "Band {band}",
  "coach.historyFailed": "Could not load history.",
};
