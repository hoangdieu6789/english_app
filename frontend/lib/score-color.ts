// Score colors are theme tokens (light / dark), always shown with the number next to them.
export const SCORE_GREEN = "var(--ds-success)";
export const SCORE_AMBER = "var(--ds-warning)";
export const SCORE_RED = "var(--ds-danger)";

export function scoreColor(score: number): string {
  if (score >= 85) return SCORE_GREEN;
  if (score >= 70) return SCORE_AMBER;
  return SCORE_RED;
}

export function scoreColorSoft(score: number): string {
  if (score >= 85) return "var(--ds-success-bg)";
  if (score >= 70) return "var(--ds-warning-bg)";
  return "var(--ds-danger-bg)";
}
