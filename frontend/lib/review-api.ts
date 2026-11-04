import { apiFetch, errorFrom } from "./http";
import { getLang, translate } from "@/lib/i18n";

// Spaced-repetition review of the words the learner said wrongly (backend: /api/review).
// meaning and exampleTranslation are in the learner's language; exampleTranslation is "" for
// English learners (meaning is then a short English definition).
export type VocabInfo = { pos: string; ipa: string; meaning: string; exampleEn: string; exampleTranslation: string; band: number };

// pronunciation: a word the learner said wrongly (Azure scores each try and schedules it);
// vocab: a new word for the learner's band (the learner rates how well they remembered it).
export type ReviewWord = {
  id: string;
  kind: "pronunciation" | "vocab";
  word: string;
  lastScore: number; // latest Azure accuracy for the word, 0–100 (0 for a vocab card not said yet)
  misses: number;
  intervalDays: number;
  reps: number;
  lapses: number;
  dueAt: string;
  vocab: VocabInfo | null;
};

export type ReviewQueue = { due: ReviewWord[]; upcoming: ReviewWord[]; dueCount: number; total: number };

export type ReviewAttempt = {
  word: ReviewWord; // with the new schedule
  score: number;
  quality: number; // SM-2, 0–5
  passed: boolean;
  heard: string;
  phonemes: { phoneme: string; score: number }[];
};

export const reviewQuery = {
  queryKey: ["review"],
  queryFn: async (): Promise<ReviewQueue> => {
    const res = await apiFetch("/review");
    if (!res.ok) throw await errorFrom(res, "Failed to load review words");
    return res.json();
  },
};

export async function submitReviewAttempt(id: string, wav: Blob): Promise<ReviewAttempt> {
  const form = new FormData();
  form.append("audio", wav, "word.wav");
  const res = await apiFetch(`/review/words/${id}/attempt`, { method: "POST", body: form });
  if (!res.ok) throw await errorFrom(res, translate(getLang(), "common.scoringFailed"));
  return res.json();
}

export async function removeReviewWord(id: string): Promise<void> {
  const res = await apiFetch(`/review/words/${id}`, { method: "DELETE" });
  if (!res.ok) throw await errorFrom(res, translate(getLang(), "review.err.remove"));
}

/** Self-rating of a vocab card: 1 forgot, 3 hard, 4 good, 5 easy. */
export async function gradeReviewWord(id: string, quality: 1 | 3 | 4 | 5): Promise<ReviewWord> {
  const res = await apiFetch(`/review/words/${id}/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quality }),
  });
  if (!res.ok) throw await errorFrom(res, translate(getLang(), "common.saveFailed"));
  return res.json();
}

export type Goals = {
  measuredBand: number; // 90-day IELTS average, 0 when none
  selfBand: number | null;
  targetBand: number | null;
  currentBand: number; // measured, else self estimate, else 5.0
  bandFrom: number; // new words have band in (bandFrom, bandTo]
  bandTo: number;
  remaining: number;
  lang: string; // the learner's language (UI, AI feedback, meanings)
};

export const goalsQuery = {
  queryKey: ["goals"],
  queryFn: async (): Promise<Goals> => {
    const res = await apiFetch("/goals");
    if (!res.ok) throw await errorFrom(res, "Failed to load goals");
    return res.json();
  },
};

export async function saveGoals(selfBand: number | null, targetBand: number | null): Promise<Goals> {
  const res = await apiFetch("/goals", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selfBand, targetBand }),
  });
  if (!res.ok) throw await errorFrom(res, translate(getLang(), "review.err.saveGoals"));
  return res.json();
}

export async function addNewWords(count = 10): Promise<{ word: string; band: number; vocab: VocabInfo }[]> {
  const res = await apiFetch("/review/vocab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) throw await errorFrom(res, translate(getLang(), "review.err.addWords"));
  return (await res.json()).added;
}

export const BAND_OPTIONS = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];
