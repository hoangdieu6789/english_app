// IELTS question sets come from the backend (GET /api/ielts/next, /api/ielts/sets): a shared
// bank seeded from backend/internal/service/ielts_question_seed.json, plus new sets written by
// a free LLM when a learner is close to the end. Each learner gets sets they have not done
// first, and can redo done sets.

import { apiFetch, errorFrom } from "./http";
import type { MessageKey } from "@/lib/i18n";

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
  const res = await apiFetch(path);
  if (!res.ok) throw await errorFrom(res, "Request failed");
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

// Message keys of the learner-facing part title and hint (translate with t()).
export const PART_INFO: Record<IeltsPart, { title: MessageKey; hint: MessageKey }> = {
  part1: { title: "ielts.part1.title", hint: "ielts.part1.hint" },
  part2: { title: "ielts.part2.title", hint: "ielts.part2.hint" },
  part3: { title: "ielts.part3.title", hint: "ielts.part3.hint" },
};

// The cue card text sent to the grader as the task prompt.
export function cueCardText(set: Pick<QuestionSet, "prompt" | "points">): string {
  return `${set.prompt} You should say: ${set.points.join("; ")}.`;
}
