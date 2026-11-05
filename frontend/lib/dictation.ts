// Dictation (LISTEN-001): compare what the learner typed with the line, word by word.
// Case, punctuation and curly quotes do not count; numbers written as digits or words both
// count ("10" = "ten"); a few contractions match their long form ("don't" = "do not").

export type DiffToken =
  | { kind: "ok"; word: string } // the line's word, typed right
  | { kind: "wrong"; word: string; typed: string } // typed something else in its place
  | { kind: "missing"; word: string } // not typed
  | { kind: "extra"; typed: string }; // typed, not in the line

export type DictationResult = { tokens: DiffToken[]; correct: number; total: number; accuracy: number };

const NUMBERS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven",
  "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve", "20": "twenty", "100": "hundred",
};

const EXPAND: Record<string, string[]> = {
  "don't": ["do", "not"], "doesn't": ["does", "not"], "didn't": ["did", "not"], "can't": ["can", "not"],
  "won't": ["will", "not"], "isn't": ["is", "not"], "aren't": ["are", "not"], "wasn't": ["was", "not"],
  "i'm": ["i", "am"], "it's": ["it", "is"], "that's": ["that", "is"], "you're": ["you", "are"],
  "we're": ["we", "are"], "they're": ["they", "are"], "i've": ["i", "have"], "i'll": ["i", "will"],
  "let's": ["let", "us"], "there's": ["there", "is"], "what's": ["what", "is"],
};

/** The words of a text, as shown (display) and as compared (key). */
export function words(text: string): { display: string; key: string }[] {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .split(/\s+/)
    .map((w) => ({ display: w, key: w.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "").replace(/^'+|'+$/g, "") }))
    .filter((w) => w.key !== "")
    .map((w) => ({ display: w.display.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ""), key: NUMBERS[w.key] ?? w.key }));
}

/** Expands contractions so "don't" matches "do not" (both sides go through it). */
function expand(ws: { display: string; key: string }[]): { display: string; key: string; from: number }[] {
  const out: { display: string; key: string; from: number }[] = [];
  ws.forEach((w, i) => {
    const parts = EXPAND[w.key];
    if (parts) parts.forEach((p, j) => out.push({ display: j === 0 ? w.display : "", key: p, from: i }));
    else out.push({ ...w, from: i });
  });
  return out;
}

/** Word diff of the line (ref) and what was typed, with the share of the line's words typed right. */
export function compare(ref: string, typed: string): DictationResult {
  const refWords = words(ref);
  const a = expand(refWords);
  const b = expand(words(typed));
  // LCS on keys
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i].key === b[j].key ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  // Walk the table; a run of unmatched ref words next to unmatched typed words pairs up as "wrong".
  const raw: DiffToken[] = [];
  let i = 0;
  let j = 0;
  const pend: { miss: string[]; extra: string[] } = { miss: [], extra: [] };
  const flush = () => {
    const k = Math.min(pend.miss.length, pend.extra.length);
    for (let x = 0; x < k; x++) raw.push({ kind: "wrong", word: pend.miss[x], typed: pend.extra[x] });
    for (let x = k; x < pend.miss.length; x++) raw.push({ kind: "missing", word: pend.miss[x] });
    for (let x = k; x < pend.extra.length; x++) raw.push({ kind: "extra", typed: pend.extra[x] });
    pend.miss = [];
    pend.extra = [];
  };
  const shown = (t: { display: string; key: string }) => t.display || t.key;
  while (i < n || j < m) {
    if (i < n && j < m && a[i].key === b[j].key) {
      flush();
      raw.push({ kind: "ok", word: a[i].display }); // "" for the 2nd part of a contraction (dropped below)
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      pend.extra.push(shown(b[j]));
      j++;
    } else {
      pend.miss.push(shown(a[i]));
      i++;
    }
  }
  flush();

  // Score on the line's own words (a contraction counts once).
  const okByWord = new Map<number, boolean>();
  let ai = 0;
  for (const t of raw) {
    if (t.kind === "extra") continue;
    const from = a[ai].from;
    okByWord.set(from, (okByWord.get(from) ?? true) && t.kind === "ok");
    ai++;
  }
  const total = refWords.length;
  const correct = [...okByWord.values()].filter(Boolean).length;
  const tokens = raw.filter((t) => t.kind === "extra" || ("word" in t && t.word !== ""));
  return { tokens, correct, total, accuracy: total === 0 ? 0 : Math.round((correct / total) * 100) };
}

/** A hint: the line with every word but its first letter hidden ("I w___ to t__ p___"). */
export function hint(ref: string): string {
  return ref.replace(/\p{L}+/gu, (w) => (w.length <= 1 ? w : w[0] + "_".repeat(w.length - 1)));
}
