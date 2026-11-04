// Weekly Azure accuracy and fluency (0–100). A week without practice is null: the line is
// broken there instead of dropping to 0. The y axis fits the data.
export function WeeklyLineChart({
  weeks,
  accuracy,
  fluency,
}: {
  weeks: string[];
  accuracy: (number | null)[];
  fluency: (number | null)[];
}) {
  const W = 1040;
  const H = 260;
  const pl = 44;
  const pr = 56;
  const pt = 34;
  const pb = 40;
  const values = [...accuracy, ...fluency].filter((v): v is number => v != null);
  const min = values.length ? Math.max(0, Math.min(60, Math.floor((Math.min(...values) - 5) / 10) * 10)) : 0;
  const max = 100;
  const x = (i: number) => pl + (W - pl - pr) * (weeks.length > 1 ? i / (weeks.length - 1) : 0.5);
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - min) / (max - min));
  const path = (arr: (number | null)[]) => {
    let d = "";
    let pen = false;
    arr.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };
  const step = max - min > 50 ? 20 : 10;
  const gridLines: number[] = [];
  for (let v = min; v <= max; v += step) gridLines.push(v);
  const dots = (arr: (number | null)[], color: string) =>
    arr.map((v, i) => (v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={6} fill="var(--ds-surface)" stroke={color} strokeWidth={3} />));
  // The value next to every point; the higher series is labelled above, the lower one below.
  const labels = (arr: (number | null)[], other: (number | null)[], color: string) =>
    arr.map((v, i) => {
      if (v == null) return null;
      const o = other[i];
      const above = o == null || v >= o;
      return (
        <text key={i} x={x(i)} y={y(v) + (above ? -14 : 26)} textAnchor="middle" fontSize={16} fontWeight={800} fill={color}>
          {Math.round(v)}
        </text>
      );
    });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", marginTop: 8 }}>
      {gridLines.map((v) => (
        <g key={v}>
          <line x1={pl} y1={y(v)} x2={W - pr} y2={y(v)} stroke="var(--ds-border-subtle)" strokeWidth={1} />
          <text x={pl - 8} y={y(v) + 4} textAnchor="end" fontSize={14} fill="var(--ds-text-muted)">
            {v}
          </text>
        </g>
      ))}
      <path d={path(accuracy)} fill="none" stroke="var(--ds-primary)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <path d={path(fluency)} fill="none" stroke="var(--ds-info)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {dots(accuracy, "var(--ds-primary)")}
      {dots(fluency, "var(--ds-info)")}
      {labels(accuracy, fluency, "var(--ds-primary)")}
      {labels(fluency, accuracy, "var(--ds-info)")}
      {weeks.map((w, i) => (
        <text key={w} x={x(i)} y={H - 14} textAnchor="middle" fontSize={14} fill="var(--ds-text-muted)">
          {w}
        </text>
      ))}
    </svg>
  );
}
