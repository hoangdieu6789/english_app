import type { history as source } from "../vi/history";

export const history: Record<keyof typeof source, string> = {
  "history.pending": "scoring...",
  "history.all": "All",
  "history.err.load": "Could not load your history. Reload the page.",
  "history.empty": "No speaking attempts yet.",
  "history.emptyJoke": "No spells cast yet.",
  "history.practiceNow": "Start practising",
  "history.back": "Speaking history",
  "history.notFound": "This attempt was not found.",
};
