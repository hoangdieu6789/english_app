export function VocabDonut({ segments, total, size = 150, strokeWidth = 20 }: {
  segments: { value: number; color: string }[];
  total: number;
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  let acc = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => {
        const len = c * (seg.value / total);
        const off = c * (1 - acc / total);
        acc += seg.value;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={off}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        );
      })}
    </svg>
  );
}
