// Progress summary from GET /api/progress/summary (backend/internal/handler/progress_handler.go).
// Azure scores are 0–100. IELTS bands are 0–9 and only come from IELTS attempts graded with
// rubric v2; 0 means "no band yet".

import { apiFetch, errorFrom } from "./http";

export type ProgressSummary = {
  tz: string;
  streak: number;
  activeDays: number;
  attempts: number;
  attemptsToday: number;
  speakingSecondsToday: number;
  last30Days: { attempts: number; accuracy: number; fluency: number; band: number; banded: number };
  weeks: { start: string; attempts: number; accuracy: number; fluency: number; band: number }[]; // last 10 weeks with practice
  days: { start: string; attempts: number; accuracy: number; fluency: number; band: number }[]; // last 14 days with practice
  firstDay: string; // first practice day (local), "" when none
  hardPhonemes: { phoneme: string; score: number; samples: number }[];
  criteria: { criterion: string; band: number; samples: number }[];
  byTask: { taskType: string; attempts: number; avgBand: number; bestBand: number }[];
  graders: { provider: string; model: string; attempts: number }[];
  weakWords: { word: string; score: number; times: number }[]; // said wrongly, last 30 days
};

export function learnerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
  } catch {
    return "Asia/Ho_Chi_Minh";
  }
}

export async function fetchProgress(): Promise<ProgressSummary> {
  const res = await apiFetch(`/progress/summary?tz=${encodeURIComponent(learnerTimeZone())}`);
  if (!res.ok) throw await errorFrom(res, "Failed to load progress");
  return res.json();
}

// Shared query options, so the header streak and the Progress page use one request.
export const progressQuery = {
  queryKey: ["progress-summary"],
  queryFn: fetchProgress,
  staleTime: 60_000,
} as const;
