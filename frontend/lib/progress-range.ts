// The Progress chart adapts to how long the learner has practised:
//   - first 14 days: one point per day, from the first practice day to today;
//   - after that: one point per week (Monday-based), from the first practice week, at most
//     MAX_WEEKS weeks (the latest ones).
// Days without practice are null (the line breaks there). Dates are local "YYYY-MM-DD".

export const MAX_DAYS = 14;
export const MAX_WEEKS = 10;

export type Point = { start: string; accuracy: number; fluency: number };
export type ChartRange = { unit: "day" | "week"; keys: string[]; accuracy: (number | null)[]; fluency: (number | null)[] };

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}
function mondayOf(d: Date): Date {
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}

/** today: the learner's local date ("YYYY-MM-DD"); firstDay: first practice day or "". */
export function chartRange(today: string, firstDay: string, days: Point[], weeks: Point[]): ChartRange | null {
  if (!firstDay) return null;
  const end = parse(today);
  let start = parse(firstDay);
  if (start > end) start = end;
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

  const fill = (unit: ChartRange["unit"], keys: string[], data: Point[]): ChartRange => {
    const by = new Map(data.map((p) => [p.start, p]));
    return {
      unit,
      keys,
      accuracy: keys.map((k) => by.get(k)?.accuracy ?? null),
      fluency: keys.map((k) => by.get(k)?.fluency ?? null),
    };
  };

  if (spanDays <= MAX_DAYS) {
    const keys = Array.from({ length: spanDays }, (_, i) => iso(addDays(start, i)));
    return fill("day", keys, days);
  }
  const lastMonday = mondayOf(end);
  const firstMonday = mondayOf(start);
  const nWeeks = Math.min(MAX_WEEKS, Math.round((lastMonday.getTime() - firstMonday.getTime()) / (7 * 86400000)) + 1);
  const keys = Array.from({ length: nWeeks }, (_, i) => iso(addDays(lastMonday, -7 * (nWeeks - 1 - i))));
  return fill("week", keys, weeks);
}

/** Today's date in the browser's time zone, as "YYYY-MM-DD". */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
