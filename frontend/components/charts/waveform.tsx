export function Waveform({ active }: { active: boolean }) {
  const bars = Array.from({ length: 40 }, (_, i) => i);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 44 }}>
      {bars.map((i) => (
        <span
          key={i}
          style={{
            display: "block",
            width: 4,
            height: 44,
            borderRadius: 4,
            transformOrigin: "center",
            background: active ? "var(--ds-primary)" : "var(--ds-border-strong)",
            transform: active ? undefined : "scaleY(.16)",
            animation: active ? "wave 800ms ease-in-out infinite" : "none",
            animationDelay: active ? `${(i % 8) * 70}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}
