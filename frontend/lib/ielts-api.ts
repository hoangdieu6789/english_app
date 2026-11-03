// IELTS question sets come from the backend (GET /api/ielts/next, /api/ielts/sets): a shared
// bank seeded from backend/internal/service/ielts_question_seed.json, plus new sets written by
// a free LLM when a learner is close to the end. Each learner gets sets they have not done
// first, and can redo done sets.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";

export type IeltsPart = "part1" | "part2" | "part3";

export type QuestionSet = {
  id: string;
  kind: "part1" | "cue_card";
  topic: string;
  prompt: string; // cue card task; empty for part1
  points: string[]; // cue card "You should say" points
  questions: string[]; // part1 questions, or the Part 3 questions of a cue card
  source: "seed" | "generated";
};

export type NextQuestionSet = {
  set: QuestionSet;
  seen: boolean; // every set is done; this one is a review
  unseenCount: number;
};

export type QuestionSetProgress = QuestionSet & {
  attemptCount: number;
  lastAttemptAt: string | null;
  bestBand: number | null;
};

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? "Request failed");
  }
  return res.json();
}

export function fetchNextQuestionSet(part: IeltsPart, excludeId?: string): Promise<NextQuestionSet> {
  const q = new URLSearchParams({ part });
  if (excludeId) q.set("exclude", excludeId);
  return getJSON(`/ielts/next?${q}`);
}

export async function listQuestionSets(part: IeltsPart): Promise<QuestionSetProgress[]> {
  const body = await getJSON<{ sets: QuestionSetProgress[] }>(`/ielts/sets?part=${part}`);
  return body.sets;
}

// Learner-facing text stays in Vietnamese (the app's learners are Vietnamese speakers).
export const PART_INFO: Record<IeltsPart, { title: string; hint: string }> = {
  part1: { title: "Part 1 · Phỏng vấn", hint: "Trả lời ngắn (2–4 câu) về chủ đề quen thuộc. Nói thêm lý do hoặc ví dụ." },
  part2: { title: "Part 2 · Nói dài", hint: "1 phút chuẩn bị, rồi nói liền mạch về cue card và trả lời đủ các ý." },
  part3: { title: "Part 3 · Thảo luận", hint: "Câu hỏi mở: nêu quan điểm, giải thích lý do, đưa ví dụ, so sánh hai mặt." },
};

// The cue card text sent to the grader as the task prompt.
export function cueCardText(set: Pick<QuestionSet, "prompt" | "points">): string {
  return `${set.prompt} You should say: ${set.points.join("; ")}.`;
}
