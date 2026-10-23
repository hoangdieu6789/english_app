export const SCORE_GREEN = "#16A34A";
export const SCORE_AMBER = "#EA580C";
export const SCORE_RED = "#DC2626";

export function scoreColor(score: number): string {
  if (score >= 85) return SCORE_GREEN;
  if (score >= 70) return SCORE_AMBER;
  return SCORE_RED;
}

export function scoreColorSoft(score: number): string {
  if (score >= 85) return "rgba(22,163,74,.14)";
  if (score >= 70) return "rgba(234,88,12,.14)";
  return "rgba(220,38,38,.14)";
}
