"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { sfx, type Sfx } from "@/lib/games/sfx";

// Visual effects layer of a game stage: a canvas for particles (sparks, stars, smoke, embers)
// and spell beams, plus floating "+10" labels, a screen shake and a full-stage flash.
// Everything is imperative (no React state), so effects never re-render the game. Colors come
// from the --ds-game-* tokens. With prefers-reduced-motion only the floating label and the
// sounds stay (no particles, beams, shake or flash).

export type FxKind = "gold" | "spell" | "fire" | "smoke" | "bad";
export type Target = Element | { x: number; y: number } | null | undefined;

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; shape: "star" | "dot" | "smoke"; spin: number };
type Beam = { x1: number; y1: number; x2: number; y2: number; life: number; max: number; color: string; seed: number };

export type Fx = {
  burst: (at: Target, kind?: FxKind, n?: number) => void;
  beam: (from: Target, to: Target, kind?: FxKind) => void;
  float: (at: Target, text: string, kind?: "good" | "bad" | "gold") => void;
  shake: (strength?: number) => void;
  flash: (kind?: "good" | "bad" | "gold") => void;
  sound: (name: Sfx, arg?: number) => void;
};

const noop: Fx = { burst() {}, beam() {}, float() {}, shake() {}, flash() {}, sound() {} };
const FxCtx = createContext<Fx>(noop);

export function useFx(): Fx {
  return useContext(FxCtx);
}

function tokenColors(el: Element) {
  const cs = getComputedStyle(el);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    gold: [v("--ds-game-gold", "gold"), v("--ds-game-ember", "orange"), v("--ds-game-star", "white")],
    spell: [v("--ds-game-spell", "cyan"), v("--ds-game-star", "white"), v("--ds-game-gold", "gold")],
    fire: [v("--ds-game-fire", "orangered"), v("--ds-game-ember", "orange"), v("--ds-game-gold", "gold")],
    smoke: [v("--ds-game-on-night-muted", "gray")],
    bad: [v("--ds-game-bad", "red"), v("--ds-game-fire", "orangered")],
  } satisfies Record<FxKind, string[]>;
}

/** Draws one frame of particles and beams; returns whether anything is left to draw. */
function drawFrame(c: HTMLCanvasElement | null, parts: { current: Particle[] }, beams: { current: Beam[] }): boolean {
  const g = c?.getContext("2d");
  if (!c || !g) return false;
  const w = c.clientWidth;
  const h = c.clientHeight;
  g.clearRect(0, 0, w, h);
  g.globalCompositeOperation = "lighter";
  const dt = 16;
  parts.current = parts.current.filter((p) => (p.life += dt) < p.max);
  for (const p of parts.current) {
    p.x += p.vx * dt * 0.06;
    p.y += p.vy * dt * 0.06;
    p.vy += p.shape === "smoke" ? -0.02 : 0.06; // sparks fall, smoke rises
    p.vx *= 0.985;
    const k = 1 - p.life / p.max;
    g.globalAlpha = p.shape === "smoke" ? k * 0.35 : k;
    g.fillStyle = p.color;
    if (p.shape === "star") {
      const r = p.size * (0.6 + 0.4 * k);
      g.save();
      g.translate(p.x, p.y);
      g.rotate((p.spin * p.life) / 300);
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const rr = i % 2 ? r * 0.38 : r;
        const a = (i * Math.PI) / 4;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.restore();
    } else {
      g.beginPath();
      g.arc(p.x, p.y, p.shape === "smoke" ? p.size * (2 - k) : p.size * k + 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Beams: a jagged bolt from the wand to the target, redrawn with new jitter each frame.
  beams.current = beams.current.filter((b) => (b.life += dt) < b.max);
  for (const b of beams.current) {
    const k = 1 - b.life / b.max;
    const steps = 12;
    for (const [width, alpha] of [
      [10, 0.25],
      [4, 0.7],
      [1.5, 1],
    ] as const) {
      g.globalAlpha = alpha * k;
      g.strokeStyle = b.color;
      g.lineWidth = width;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(b.x1, b.y1);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const jitter = (Math.sin(b.seed + i * 12.9 + b.life * 0.05) * 14 * Math.sin(Math.PI * t)) | 0;
        const nx = -(b.y2 - b.y1);
        const ny = b.x2 - b.x1;
        const len = Math.hypot(nx, ny) || 1;
        g.lineTo(b.x1 + (b.x2 - b.x1) * t + (nx / len) * jitter, b.y1 + (b.y2 - b.y1) * t + (ny / len) * jitter);
      }
      g.lineTo(b.x2, b.y2);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  return parts.current.length > 0 || beams.current.length > 0;
}

export function FxLayer({ children, sound, reduced }: { children: React.ReactNode; sound: boolean; reduced: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const flashEl = useRef<HTMLDivElement>(null);
  const parts = useRef<Particle[]>([]);
  const beams = useRef<Beam[]>([]);
  const raf = useRef(0);
  const colors = useRef<ReturnType<typeof tokenColors> | null>(null);
  const soundRef = useRef(sound);
  const reducedRef = useRef(reduced);
  useEffect(() => {
    soundRef.current = sound;
    reducedRef.current = reduced;
  });

  // Keep the canvas at the stage's size (device pixels for sharp sparks).
  useEffect(() => {
    const el = stage.current;
    const c = canvas.current;
    if (!el || !c) return;
    colors.current = tokenColors(el);
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(el.clientWidth * dpr);
      c.height = Math.round(el.clientHeight * dpr);
      c.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, []);

  const point = useCallback((t: Target): { x: number; y: number } | null => {
    const el = stage.current;
    if (!el || !t) return null;
    const s = el.getBoundingClientRect();
    if (t instanceof Element) {
      const r = t.getBoundingClientRect();
      return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
    }
    return t;
  }, []);

  const run = useCallback(() => {
    if (raf.current) return;
    const loop = () => {
      raf.current = drawFrame(canvas.current, parts, beams) ? requestAnimationFrame(loop) : 0;
    };
    raf.current = requestAnimationFrame(loop);
  }, []);

  const fx = useMemo<Fx>(
    () => ({
      burst(at, kind = "gold", n = 26) {
        const p = point(at);
        if (!p || reducedRef.current || !colors.current) return;
        const palette = colors.current[kind];
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = kind === "smoke" ? 0.6 + Math.random() : 2 + Math.random() * 5;
          parts.current.push({
            x: p.x,
            y: p.y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - (kind === "smoke" ? 0.5 : 2),
            life: 0,
            max: 500 + Math.random() * 600,
            size: kind === "smoke" ? 8 + Math.random() * 10 : 2 + Math.random() * 4,
            color: palette[i % palette.length],
            shape: kind === "smoke" ? "smoke" : i % 3 === 0 ? "star" : "dot",
            spin: Math.random() * 4 - 2,
          });
        }
        run();
      },
      beam(from, to, kind = "spell") {
        const a = point(from);
        const b = point(to);
        if (!a || !b || reducedRef.current || !colors.current) return;
        beams.current.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, life: 0, max: 360, color: colors.current[kind][0], seed: Math.random() * 100 });
        run();
      },
      float(at, text, kind = "good") {
        const p = point(at);
        const box = labels.current;
        if (!p || !box) return;
        const el = document.createElement("span");
        el.className = "game-float";
        el.dataset.kind = kind;
        el.textContent = text;
        el.style.top = `${p.y}px`;
        box.appendChild(el);
        // Keep the whole label inside the board (labels near an edge would be cut off).
        const half = el.offsetWidth / 2 + 4;
        el.style.left = `${Math.min(Math.max(p.x, half), box.clientWidth - half)}px`;
        window.setTimeout(() => el.remove(), 1000);
      },
      shake(strength = 1) {
        const el = stage.current;
        if (!el || reducedRef.current) return;
        el.style.setProperty("--shake", String(strength));
        el.classList.remove("game-shaking");
        void el.offsetWidth; // restart the animation
        el.classList.add("game-shaking");
      },
      flash(kind = "gold") {
        const el = flashEl.current;
        if (!el || reducedRef.current) return;
        el.dataset.kind = kind;
        el.classList.remove("on");
        void el.offsetWidth;
        el.classList.add("on");
      },
      sound(name, arg) {
        if (!soundRef.current) return;
        const f = sfx[name] as (n?: number) => void;
        f(arg);
      },
    }),
    [point, run],
  );

  return (
    <FxCtx.Provider value={fx}>
      <div ref={stage} className="game-fx-stage">
        {children}
        <canvas ref={canvas} className="game-fx-canvas" aria-hidden />
        <div ref={flashEl} className="game-fx-flash" aria-hidden />
        <div ref={labels} className="game-fx-labels" aria-hidden />
      </div>
    </FxCtx.Provider>
  );
}

/** Runs fn(ev) once per new event (ev.n grows by one per event in the game's reducer). */
export function useFxEvents<E extends { n: number }>(ev: E | null, fn: (ev: E) => void) {
  const last = useRef(0);
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (ev && ev.n !== last.current) {
      last.current = ev.n;
      ref.current(ev);
    }
  }, [ev]);
}
