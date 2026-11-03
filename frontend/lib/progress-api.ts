// Progress summary from GET /api/progress/summary (backend/internal/handler/progress_handler.go).
// Azure scores are 0–100. IELTS bands are 0–9 and only come from IELTS attempts graded with
// rubric v2; 0 means "no band yet".

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";

export type ProgressSummary = {
  tz: string;
  streak: number;
  activeDays: number;
  attempts: number;
  attemptsToday: number;
  speakingSecondsToday: number;
  last30Days: { attempts: number; accuracy: number; fluency: number; band: number; banded: number };
  weeks: { start: string; attempts: number; accuracy: number; fluency: number; band: number }[];
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
  const res = await fetch(`${API_BASE_URL}/progress/summary?tz=${encodeURIComponent(learnerTimeZone())}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? "Failed to load progress");
  }
  return res.json();
}

// Shared query options, so the header streak and the Progress page use one request.
export const progressQuery = {
  queryKey: ["progress-summary"],
  queryFn: fetchProgress,
  staleTime: 60_000,
} as const;
