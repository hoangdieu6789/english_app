import { apiFetch, errorFrom } from "./http";

export type PracticeSentence = {
  id: string;
  text: string;
  phonetic: string;
  gloss: string;
};

export async function fetchNextSentence(): Promise<PracticeSentence> {
  const res = await apiFetch("/practice/sentence");
  if (!res.ok) throw await errorFrom(res, "Failed to fetch next sentence");

  return res.json();
}
