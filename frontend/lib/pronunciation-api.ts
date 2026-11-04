import { getFeedbackLang } from "@/lib/feedback-lang";
import { API_BASE_URL, apiFetch, errorFrom } from "./http";

const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

// audioUrl from the backend is relative (e.g. "/uploads/xxx.wav") since it's
// served by the Go API, not the Next.js frontend — resolve it to an absolute
// URL so <audio> can play it back.
export function resolveAudioUrl(audioUrl: string): string {
  return `${BACKEND_ORIGIN}${audioUrl}`;
}

export type WordScore = {
  word: string;
  accuracyScore: number;
  errorType: "none" | "mispronunciation" | "omission" | "insertion";
  offsetMs?: number;
  durationMs?: number;
  unexpectedBreak?: boolean;
  missingBreak?: boolean;
  monotone?: boolean;
  phonemes?: PhonemeScore[]; // the word's sounds as expected, with accuracy
};

export type PhonemeScore = {
  phoneme: string;
  score: number;
};

// Speaking rubric result (backend/internal/rubric, type Result). IELTS bands 0–9.
export type RubricIssue = {
  code: string;
  quote: string;
  correction: string;
  explanation: string;
  impact: "global" | "local";
  confidence: "high" | "low";
};

export type RubricCriterion = {
  id: string;
  band: number;
  rationale: string;
  strengths: string[];
  issues: RubricIssue[];
  next_step: string;
};

export type PronunciationItem = {
  code: string;
  method: "rule" | "not_measured";
  measured: boolean;
  band?: number;
  value?: number;
  samples?: number;
  note?: string;
};

export type ToneIssue = {
  segment_id: number;
  quote: string;
  sentence_type: string;
  expected: string;
  got: string;
};

export type RubricResult = {
  version: string;
  task_type: string;
  overall: {
    band: number; // 0–9 in half bands; 0 = nothing could be assessed
    mean: number;
    cefr: string;
    provisional: boolean;
    missing?: string[];
  };
  criteria: RubricCriterion[];
  pronunciation?: {
    id: string;
    assessed: boolean;
    band?: number;
    coverage: string;
    items: PronunciationItem[];
    mispronounced_words?: string[];
    tone_issues?: ToneIssue[];
    reason?: string;
  };
  not_assessed: { id: string; reason: string }[];
  summary: string;
};

export type PronunciationAttempt = {
  id: string;
  audioUrl: string;
  referenceText: string;
  recognizedText: string | null;
  taskType: string;
  taskPrompt: string | null;
  feedbackLang: "vi" | "en" | null;
  overallScore: number;
  fluencyScore: number;
  completenessScore: number | null;
  prosodyScore: number | null;
  pronScore: number | null;
  wordScores: WordScore[];
  phonemeScores: PhonemeScore[];
  rubric: RubricResult | null;
  // LLM that scored FC/LR/GRA; null when no LLM was used (shadowing, LLM failure).
  grader: { provider: string; model: string } | null;
  // pending: the AI is still grading FC/LR/GRA in the background (poll fetchPronunciationAttempt).
  gradingStatus: "pending" | "done" | "failed";
  // whisper: written down by Whisper, then scored by Azure against it; azure: Azure's own recognition.
  transcriptSource: "azure" | "whisper" | null;
  improvedAnswer: ImprovedAnswer | null;
  createdAt: string;
};

// shadowing = read the given sentence (Pronunciation only); the others are IELTS parts.
export type SpeakingTask = {
  type: "shadowing" | "part1" | "part2" | "part3" | "full_test";
  prompt?: string; // question(s) or cue card for IELTS parts
  questionSetId?: string; // IELTS question set answered (tracks the learner's progress)
};

// referenceText is the sentence to read for shadowing; leave it empty for IELTS parts.
export async function submitPronunciationAttempt(
  audio: Blob,
  referenceText: string,
  task: SpeakingTask = { type: "shadowing" },
): Promise<PronunciationAttempt> {
  const form = new FormData();
  form.append("audio", audio, "recording.wav");
  form.append("referenceText", referenceText);
  form.append("taskType", task.type);
  if (task.prompt) form.append("taskPrompt", task.prompt);
  if (task.questionSetId) form.append("questionSetId", task.questionSetId);
  form.append("lang", getFeedbackLang());

  // The form (with the WAV) can be sent twice when the token is renewed; FormData is reusable.
  const res = await apiFetch("/pronunciation/attempts", { method: "POST", body: form });
  if (!res.ok) throw await errorFrom(res, "Failed to submit pronunciation attempt");

  return res.json();
}

export async function fetchPronunciationAttempt(id: string): Promise<PronunciationAttempt> {
  const res = await apiFetch(`/pronunciation/attempts/${id}`);
  if (!res.ok) throw await errorFrom(res, "Failed to load attempt");
  return res.json();
}

export type ImprovedAnswer = {
  band: number;
  lang: string;
  improved: string;
  changes: { original: string; improved: string; reason: string }[];
};

export type SampleAnswer = { band: number; answer: string; phrases: { phrase: string; meaning: string }[]; tips: string[] };

/** Scores one recording of a single word (not saved). */
export async function scoreWord(word: string, wav: Blob): Promise<{ word: string; score: number; heard: string; phonemes: PhonemeScore[] }> {
  const form = new FormData();
  form.append("audio", wav, "word.wav");
  form.append("word", word);
  const res = await apiFetch("/pronunciation/word", { method: "POST", body: form });
  if (!res.ok) throw await errorFrom(res, "Chấm điểm thất bại. Thử lại.");
  return res.json();
}

/** A model answer at the learner's target band (cached on the server). */
export async function fetchSampleAnswer(taskType: string, question: string, lang: string): Promise<SampleAnswer> {
  const res = await apiFetch("/coach/sample", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskType, question, lang }),
  });
  if (!res.ok) throw await errorFrom(res, "AI chưa viết được câu trả lời mẫu. Thử lại sau.");
  return res.json();
}

/** The learner's answer of an attempt rewritten at their target band (saved with it). */
export async function improveAnswer(attemptId: string, lang: string): Promise<ImprovedAnswer> {
  const res = await apiFetch(`/pronunciation/attempts/${attemptId}/improve?lang=${lang}`, { method: "POST" });
  if (!res.ok) throw await errorFrom(res, "AI chưa viết lại được câu trả lời. Thử lại sau.");
  return res.json();
}

export type HistoryItem = {
  id: string;
  createdAt: string;
  taskType: string;
  taskPrompt: string | null;
  referenceText: string;
  recognizedText: string | null;
  topic: string | null;
  overallScore: number;
  fluencyScore: number;
  prosodyScore: number | null;
  band: number | null;
  cefr: string | null;
  gradingStatus: string;
};

export async function fetchHistory(type: string, before?: string): Promise<{ attempts: HistoryItem[]; counts: Record<string, number>; next: string | null }> {
  const q = new URLSearchParams();
  if (type) q.set("type", type);
  if (before) q.set("before", before);
  const res = await apiFetch(`/pronunciation/attempts?${q}`);
  if (!res.ok) throw await errorFrom(res, "Không tải được lịch sử.");
  return res.json();
}
