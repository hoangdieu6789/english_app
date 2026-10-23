// Mock data for Review (Giai đoạn 3) and hardest-phonemes (Giai đoạn 4) —
// these features aren't backed by real endpoints yet. Practice (Giai đoạn 2)
// uses real sentence generation (lib/practice-api.ts) and real scoring
// (lib/pronunciation-api.ts).
export type ReviewTag = "pronunciation_gap" | "listening_gap" | "never_seen";

export type ReviewWord = {
  word: string;
  phonetic: string;
  tag: ReviewTag;
  seen: number;
  options: string[];
  correct: number;
  example: string;
};

export const REVIEW: ReviewWord[] = [
  {
    word: "reservation",
    phonetic: "/ˌrezərˈveɪʃn/",
    tag: "pronunciation_gap",
    seen: 4,
    options: ["sự đặt chỗ", "lời hứa", "khu bảo tồn"],
    correct: 0,
    example: "I'd like to make a reservation for two.",
  },
  {
    word: "unpredictable",
    phonetic: "/ˌʌnprɪˈdɪktəbl/",
    tag: "pronunciation_gap",
    seen: 3,
    options: ["dễ đoán", "khó lường", "đáng tin"],
    correct: 1,
    example: "The weather has been quite unpredictable.",
  },
  {
    word: "weather",
    phonetic: "/ˈweðər/",
    tag: "listening_gap",
    seen: 5,
    options: ["thời tiết", "người bạn", "con đường"],
    correct: 0,
    example: "The weather is nice today.",
  },
  {
    word: "station",
    phonetic: "/ˈsteɪʃn/",
    tag: "listening_gap",
    seen: 2,
    options: ["cửa hàng", "nhà ga", "trạm xăng"],
    correct: 1,
    example: "How do I get to the station?",
  },
  {
    word: "schedule",
    phonetic: "/ˈskedʒuːl/",
    tag: "never_seen",
    seen: 1,
    options: ["lịch trình", "trường học", "kế hoạch nghỉ"],
    correct: 0,
    example: "Let me check my schedule.",
  },
];

export const REVIEW_TAGS: Record<ReviewTag, { label: string; bg: string; fg: string }> = {
  pronunciation_gap: { label: "Yếu phát âm", bg: "var(--ds-warning-bg)", fg: "var(--ds-warning)" },
  listening_gap: { label: "Nghe chưa ra", bg: "var(--ds-info-bg)", fg: "var(--ds-info)" },
  never_seen: { label: "Từ mới", bg: "var(--ds-surface-muted)", fg: "var(--ds-text-secondary)" },
};

export const HARD_PHONEMES: [sym: string, score: number][] = [
  ["/r/", 64],
  ["/ð/", 66],
  ["/ʃ/", 68],
  ["/v/", 71],
  ["/æ/", 73],
];
