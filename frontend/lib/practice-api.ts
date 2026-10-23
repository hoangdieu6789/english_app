const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";

export type PracticeSentence = {
  id: string;
  text: string;
  phonetic: string;
  gloss: string;
};

export async function fetchNextSentence(): Promise<PracticeSentence> {
  const res = await fetch(`${API_BASE_URL}/practice/sentence`, {
    credentials: "include",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? "Failed to fetch next sentence");
  }

  return res.json();
}
