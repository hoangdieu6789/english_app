const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";
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
  overallScore: number;
  fluencyScore: number;
  completenessScore: number | null;
  prosodyScore: number | null;
  pronScore: number | null;
  wordScores: WordScore[];
  phonemeScores: PhonemeScore[];
  rubric: RubricResult | null;
  createdAt: string;
};

// shadowing = read the given sentence (Pronunciation only); the others are IELTS parts.
export type SpeakingTask = {
  type: "shadowing" | "part1" | "part2" | "part3" | "full_test";
  prompt?: string; // question(s) or cue card for IELTS parts
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

  const res = await fetch(`${API_BASE_URL}/pronunciation/attempts`, {
    method: "POST",
    credentials: "include",
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? "Failed to submit pronunciation attempt");
  }

  return res.json();
}
