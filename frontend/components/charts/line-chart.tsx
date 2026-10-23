export function WeeklyLineChart({
  weeks,
  accuracy,
  fluency,
}: {
  weeks: string[];
  accuracy: number[];
  fluency: number[];
}) {
  const W = 1040;
  const H = 260;
  const pl = 44;
  const pr = 20;
  const pt = 24;
  const pb = 40;
  const min = 60;
  const max = 95;
  const x = (i: number) => pl + (W - pl - pr) * (i / (weeks.length - 1));
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - min) / (max - min));
  const path = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area =
    `M${x(0)} ${y(accuracy[0])} ` +
    accuracy.map((v, i) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ") +
    ` L${x(weeks.length - 1)} ${H - pb} L${x(0)} ${H - pb} Z`;
  const gridLines = [60, 70, 80, 90];
  const dots = (arr: number[], color: string) =>
    arr.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={4} fill="#fff" stroke={color} strokeWidth={2.5} />);

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
      <path d={area} fill="rgba(185,0,14,.08)" />
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
