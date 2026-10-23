export function Sparkline({ data }: { data: number[] }) {
  const W = 460;
  const H = 90;
  const min = Math.min(...data) - 4;
  const max = Math.max(...data) + 4;
  const x = (i: number) => W * (i / (data.length - 1));
  const y = (v: number) => 8 + (H - 16) * (1 - (v - min) / (max - min));
  const line = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area =
    `M0 ${y(data[0])} ` +
    data.map((v, i) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ") +
    ` L${W} ${H} L0 ${H} Z`;
  const last = data[data.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <path d={area} fill="rgba(22,163,74,.10)" />
      <path d={line} fill="none" stroke="#16A34A" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(last)} r={4.5} fill="#fff" stroke="#16A34A" strokeWidth={2.5} />
    </svg>
  );
}
