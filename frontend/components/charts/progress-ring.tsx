export function ProgressRing({
  pct,
  color,
  size,
  strokeWidth,
  trackColor = "var(--ds-surface-muted)",
}: {
  pct: number;
  color: string;
  size: number;
  strokeWidth: number;
  trackColor?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  const cx = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: "stroke-dashoffset .8s var(--ds-ease)" }}
      />
    </svg>
  );
}

export function GoalRing({ pct, size = 136, strokeWidth = 12 }: { pct: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  const cx = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth={strokeWidth} />
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke="#fff"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${cx} ${cx})`}
      />
    </svg>
  );
}
