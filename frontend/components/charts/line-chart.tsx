"use client";

import { useEffect, useRef, useState } from "react";

// Azure accuracy and fluency (0–100) per day or week. A period without practice is null: it is
// bridged with a dashed line instead of dropping to 0. The y axis fits the data.
// The SVG is drawn at its real pixel width, so text stays 14px+ on phones; when points are
// close, only some x labels and only the last value labels are shown.
export function WeeklyLineChart({
  weeks,
  accuracy,
  fluency,
}: {
  weeks: string[];
  accuracy: (number | null)[];
  fluency: (number | null)[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(1040);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 260;
  const pl = 44;
  const pr = 28;
  const pt = 34;
  const pb = 40;
  const values = [...accuracy, ...fluency].filter((v): v is number => v != null);
  const min = values.length ? Math.max(0, Math.min(60, Math.floor((Math.min(...values) - 5) / 10) * 10)) : 0;
  const max = 100;
  const x = (i: number) => pl + (W - pl - pr) * (weeks.length > 1 ? i / (weeks.length - 1) : 0.5);
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - min) / (max - min));
  // Solid line between neighbouring periods; dashed line across periods without practice.
  const paths = (arr: (number | null)[]) => {
    let solid = "";
    let dashed = "";
    let prev = -1;
    arr.forEach((v, i) => {
      if (v == null) return;
      const pt2 = `${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      if (prev < 0) solid += `M${pt2} `;
      else if (prev === i - 1) solid += `L${pt2} `;
      else {
        dashed += `M${x(prev).toFixed(1)} ${y(arr[prev] as number).toFixed(1)} L${pt2} `;
        solid += `M${pt2} `;
      }
      prev = i;
    });
    return { solid: solid.trim(), dashed: dashed.trim() };
  };
  const series = (arr: (number | null)[], color: string) => {
    const { solid, dashed } = paths(arr);
    return (
      <>
        {dashed && <path d={dashed} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 7" strokeLinecap="round" opacity={0.6} />}
        <path d={solid} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  };
  const gap = weeks.length > 1 ? (W - pl - pr) / (weeks.length - 1) : W;
  const labelEvery = Math.max(1, Math.ceil(52 / gap)); // "11/02" is about 44px wide at 14px
  const lastIdx = (arr: (number | null)[]) => arr.reduce<number>((acc, v, i) => (v == null ? acc : i), -1);
  const step = max - min > 50 ? 20 : 10;
  const gridLines: number[] = [];
  for (let v = min; v <= max; v += step) gridLines.push(v);
  const dots = (arr: (number | null)[], color: string) =>
    arr.map((v, i) => (v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={6} fill="var(--ds-surface)" stroke={color} strokeWidth={3} />));
  // The value next to every point; the higher series is labelled above, the lower one below.
  const labels = (arr: (number | null)[], other: (number | null)[], color: string) =>
    arr.map((v, i) => {
      if (v == null || (gap < 40 && i !== lastIdx(arr))) return null;
      const o = other[i];
      const above = o == null || v >= o;
      return (
        <text key={i} x={x(i)} y={y(v) + (above ? -14 : 26)} textAnchor="middle" fontSize={16} fontWeight={800} fill={color}>
          {Math.round(v)}
        </text>
      );
    });

  return (
    <div ref={box} style={{ width: "100%", marginTop: 8 }}>
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", maxWidth: "100%" }}>
      {gridLines.map((v) => (
        <g key={v}>
          <line x1={pl} y1={y(v)} x2={W - pr} y2={y(v)} stroke="var(--ds-border-subtle)" strokeWidth={1} />
          <text x={pl - 8} y={y(v) + 4} textAnchor="end" fontSize={14} fill="var(--ds-text-muted)">
            {v}
          </text>
        </g>
      ))}
      {series(accuracy, "var(--ds-primary)")}
      {series(fluency, "var(--ds-info)")}
      {dots(accuracy, "var(--ds-primary)")}
      {dots(fluency, "var(--ds-info)")}
      {labels(accuracy, fluency, "var(--ds-primary)")}
      {labels(fluency, accuracy, "var(--ds-info)")}
      {weeks.map((w, i) =>
        (weeks.length - 1 - i) % labelEvery === 0 ? (
          <text key={w} x={x(i)} y={H - 14} textAnchor="middle" fontSize={14} fill="var(--ds-text-muted)">
            {w}
          </text>
        ) : null,
      )}
    </svg>
    </div>
  );
}
