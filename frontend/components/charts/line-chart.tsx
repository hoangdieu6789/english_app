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
  const pr = 20;
  const pt = 24;
  const pb = 40;
  const values = [...accuracy, ...fluency].filter((v): v is number => v != null);
  const min = values.length ? Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10) : 0;
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
    arr.map((v, i) => (v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={4} fill="#fff" stroke={color} strokeWidth={2.5} />));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", marginTop: 8 }}>
      {gridLines.map((v) => (
        <g key={v}>
          <line x1={pl} y1={y(v)} x2={W - pr} y2={y(v)} stroke="var(--ds-border-subtle)" strokeWidth={1} />
          <text x={pl - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ds-text-muted)">
            {v}
          </text>
        </g>
      ))}
      <path d={path(accuracy)} fill="none" stroke="var(--ds-primary)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <path d={path(fluency)} fill="none" stroke="var(--ds-info)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {dots(accuracy, "var(--ds-primary)")}
      {dots(fluency, "var(--ds-info)")}
      {weeks.map((w, i) => (
        <text key={w} x={x(i)} y={H - 14} textAnchor="middle" fontSize={11} fill="var(--ds-text-muted)">
          {w}
        </text>
      ))}
    </svg>
  );
}
