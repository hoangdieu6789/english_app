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
};

export type PhonemeScore = {
  phoneme: string;
  score: number;
};

export type PronunciationAttempt = {
  id: string;
  audioUrl: string;
  referenceText: string;
  recognizedText: string | null;
  overallScore: number;
  fluencyScore: number;
  wordScores: WordScore[];
  phonemeScores: PhonemeScore[];
  createdAt: string;
};

export async function submitPronunciationAttempt(audio: Blob, referenceText: string): Promise<PronunciationAttempt> {
  const form = new FormData();
  form.append("audio", audio, "recording.wav");
  form.append("referenceText", referenceText);

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
