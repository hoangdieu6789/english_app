import { apiFetch, errorFrom } from "./http";
import { getLang, translate, type MessageKey } from "@/lib/i18n";
import { resolveAudioUrl, type WordScore } from "./pronunciation-api";

// Listening lessons, dictation, text to speech and the word notebook (backend: /api/lessons,
// /api/tts, /api/notebook; docs/tickets/LISTEN-001-listening-notebook-plan.md).

export type LessonSource = "ai" | "voa" | "mine";
export type LessonKind = "podcast" | "conversation" | "story" | "news" | "other";
export const AI_KINDS: LessonKind[] = ["podcast", "conversation", "story"];
export const IMPORT_KINDS: LessonKind[] = ["news", "story", "podcast", "conversation", "other"];

export type LessonProgress = { positionSec: number; listenedAt: string | null; dictationBest: number | null; linesDone: number };

export type LessonSummary = {
  id: string;
  source: LessonSource;
  kind: LessonKind;
  title: string;
  topic: string;
  band: number;
  durationSec: number;
  status: "pending" | "ready" | "failed";
  error: string;
  credit: string;
  lines: number;
  createdAt: string;
  progress: LessonProgress | null;
  mine: boolean;
  canDelete: boolean;
};

/** A transcript line; start/end are seconds in the audio, null when unknown. */
export type Segment = { speaker: string; text: string; start: number | null; end: number | null };

export type Lesson = LessonSummary & {
  segments: Segment[];
  speakers: { name: string; voice: string }[] | null;
  phrases: string[];
  audioUrl: string; // "" when the lesson is a YouTube video
  videoId: string;
  sourceUrl: string;
  timed: boolean; // segments have times (AI lessons)
};

const t = (key: MessageKey) => translate(getLang(), key);

export const lessonsQuery = (source: LessonSource) => ({
  queryKey: ["lessons", source],
  queryFn: async (): Promise<{ lessons: LessonSummary[]; canGenerate: boolean }> => {
    const res = await apiFetch(`/lessons?source=${source}`);
    if (!res.ok) throw await errorFrom(res, t("listen.err.load"));
    return res.json();
  },
});

export async function fetchLesson(id: string): Promise<Lesson> {
  const res = await apiFetch(`/lessons/${encodeURIComponent(id)}`);
  if (!res.ok) throw await errorFrom(res, t("listen.err.loadLesson"));
  return res.json();
}

/** The playable URL of the lesson audio (files on our server get the backend origin). */
export function lessonAudioSrc(l: Lesson): string {
  if (!l.audioUrl) return "";
  return l.audioUrl.startsWith("/") ? resolveAudioUrl(l.audioUrl) : l.audioUrl;
}

export async function generateLesson(kind: LessonKind, topic: string, band: number): Promise<LessonSummary> {
  const res = await apiFetch("/lessons/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, topic, band }),
  });
  if (!res.ok) throw await errorFrom(res, t("listen.err.generate"));
  return res.json();
}

export type ImportFields = {
  source: Exclude<LessonSource, "ai">;
  kind: LessonKind;
  title: string;
  transcript: string;
  audioUrl: string;
  videoUrl: string;
  sourceUrl: string;
  file: File | null;
};

export async function importLesson(f: ImportFields): Promise<Lesson> {
  const form = new FormData();
  for (const k of ["source", "kind", "title", "transcript", "audioUrl", "videoUrl", "sourceUrl"] as const) form.append(k, f[k]);
  if (f.file) form.append("audio", f.file, f.file.name);
  const res = await apiFetch("/lessons", { method: "POST", body: form });
  if (!res.ok) throw await errorFrom(res, t("listen.err.import"));
  return res.json();
}

export async function deleteLesson(id: string): Promise<void> {
  const res = await apiFetch(`/lessons/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw await errorFrom(res, t("listen.err.delete"));
}

export async function saveLessonProgress(id: string, positionSec: number): Promise<void> {
  await apiFetch(`/lessons/${encodeURIComponent(id)}/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ positionSec }),
  }).catch(() => undefined);
}

export async function saveDictation(
  id: string,
  body: { segment: number; typed: string; accuracy: number; done?: boolean; runAccuracy?: number; lines?: number },
): Promise<void> {
  const res = await apiFetch(`/lessons/${encodeURIComponent(id)}/dictation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFrom(res, t("common.saveFailed"));
}

/** Path of an Azure TTS clip (cached by the backend). */
function ttsPath(text: string, opts: { slow?: boolean; voice?: string } = {}): string {
  const q = new URLSearchParams({ text: text.slice(0, 300) });
  if (opts.slow) q.set("slow", "1");
  if (opts.voice) q.set("voice", opts.voice);
  return `/tts?${q}`;
}

const ttsBlobs = new Map<string, Promise<string>>();

/** A blob URL of the clip, through apiFetch so an expired session is renewed first. */
export function ttsSrc(text: string, opts: { slow?: boolean; voice?: string } = {}): Promise<string> {
  const path = ttsPath(text, opts);
  let p = ttsBlobs.get(path);
  if (!p) {
    p = apiFetch(path).then(async (res) => {
      if (!res.ok) throw await errorFrom(res, t("listen.err.tts"));
      return URL.createObjectURL(await res.blob());
    });
    p.catch(() => ttsBlobs.delete(path));
    ttsBlobs.set(path, p);
  }
  return p;
}

let ttsPlayer: HTMLAudioElement | null = null;

/** Plays a clip (stops the one playing). Resolves when it ends or is stopped. */
export async function playTts(text: string, opts: { slow?: boolean; voice?: string } = {}): Promise<void> {
  const src = await ttsSrc(text, opts);
  ttsPlayer?.pause();
  const a = new Audio(src);
  ttsPlayer = a;
  await new Promise<void>((resolve, reject) => {
    a.onended = () => resolve();
    a.onpause = () => resolve();
    a.onerror = () => reject(new Error(t("listen.err.tts")));
    a.play().catch(reject);
  });
}

// ---------- notebook ----------

export type NotebookCard = {
  id: string;
  word: string;
  kind: "pronunciation" | "vocab" | "saved";
  pos: string;
  ipa: string;
  meaning: string;
  exampleEn: string;
  exampleMine: boolean;
  exampleScore: number | null;
  context: string;
  lessonId: string | null;
  lessonTitle: string;
  band: number;
  misses: number;
  lastScore: number;
  intervalDays: number;
  reps: number;
  dueAt: string;
  createdAt: string;
};

export type SentenceVerdict = {
  usesTarget: boolean;
  meaningOk: boolean;
  grammarOk: boolean;
  natural: boolean;
  score: number;
  corrected: string;
  feedback: string;
};

export type NotebookSentence = {
  id: string;
  cardId: string;
  text: string;
  score: number;
  verdict: SentenceVerdict;
  accepted: boolean;
  pronScore: number | null;
  createdAt: string;
};

export type SpeakResult = { sentence: NotebookSentence; score: number; accuracy: number; fluency: number; words: WordScore[] | null; heard: string };

export const notebookQuery = {
  queryKey: ["notebook"],
  queryFn: async (): Promise<{ cards: NotebookCard[]; passScore: number }> => {
    const res = await apiFetch("/notebook");
    if (!res.ok) throw await errorFrom(res, t("notebook.err.load"));
    return res.json();
  },
};

export async function saveToNotebook(text: string, context = "", lessonId: string | null = null): Promise<{ card: NotebookCard; lookedUp: boolean }> {
  const res = await apiFetch("/notebook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, context, lessonId }),
  });
  if (!res.ok) throw await errorFrom(res, t("notebook.err.save"));
  return res.json();
}

export const sentencesQuery = (cardId: string) => ({
  queryKey: ["notebook", cardId, "sentences"],
  queryFn: async (): Promise<{ sentences: NotebookSentence[] }> => {
    const res = await apiFetch(`/notebook/${encodeURIComponent(cardId)}/sentences`);
    if (!res.ok) throw await errorFrom(res, t("notebook.err.load"));
    return res.json();
  },
});

export async function gradeSentence(cardId: string, text: string): Promise<NotebookSentence> {
  const res = await apiFetch(`/notebook/${encodeURIComponent(cardId)}/sentences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw await errorFrom(res, t("notebook.err.grade"));
  return res.json();
}

export async function speakSentence(sentenceId: string, wav: Blob): Promise<SpeakResult> {
  const form = new FormData();
  form.append("audio", wav, "sentence.wav");
  const res = await apiFetch(`/notebook/sentences/${encodeURIComponent(sentenceId)}/speak`, { method: "POST", body: form });
  if (!res.ok) throw await errorFrom(res, translate(getLang(), "common.scoringFailed"));
  return res.json();
}
