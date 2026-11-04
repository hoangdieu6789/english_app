import { apiFetch, errorFrom } from "./http";

// Spaced-repetition review of the words the learner said wrongly (backend: /api/review).
export type ReviewWord = {
  id: string;
  word: string;
  lastScore: number; // latest Azure accuracy for the word, 0–100
  intervalDays: number;
  reps: number;
  lapses: number;
  dueAt: string;
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
  if (!res.ok) throw await errorFrom(res, "Chấm điểm thất bại. Thử lại.");
  return res.json();
}

export async function removeReviewWord(id: string): Promise<void> {
  const res = await apiFetch(`/review/words/${id}`, { method: "DELETE" });
  if (!res.ok) throw await errorFrom(res, "Không bỏ được từ này. Thử lại.");
}
