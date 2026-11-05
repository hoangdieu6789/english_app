// Short sound effects for the games, made with the Web Audio API (no audio files, nothing to
// license). Every sound is a few oscillator notes with a quick envelope. Call unlock() from a
// user gesture (Start button) so browsers allow audio.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlock() {
  audio();
}

type Note = { f: number; at: number; dur: number; type?: OscillatorType; gain?: number; to?: number };

function play(notes: Note[]) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + 0.01;
  const master = a.createGain();
  master.gain.value = 0.18;
  master.connect(a.destination);
  for (const n of notes) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = n.type ?? "sine";
    o.frequency.setValueAtTime(n.f, t0 + n.at);
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.dur);
    const peak = n.gain ?? 1;
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    o.connect(g).connect(master);
    o.start(t0 + n.at);
    o.stop(t0 + n.at + n.dur + 0.02);
  }
}

// Notes of a bright pentatonic chime (C6 E6 G6 A6 C7).
const CHIME = [1047, 1319, 1568, 1760, 2093];

export const sfx = {
  /** A right answer: two bell notes going up. */
  right: () =>
    play([
      { f: 1319, at: 0, dur: 0.18, type: "triangle" },
      { f: 1976, at: 0.07, dur: 0.28, type: "triangle", gain: 0.8 },
    ]),
  /** A wrong answer: a low, short buzz sliding down. */
  wrong: () => play([{ f: 220, at: 0, dur: 0.28, type: "sawtooth", gain: 0.35, to: 110 }]),
  /** A combo step: an arpeggio that grows with the combo. */
  combo: (n: number) => play(CHIME.slice(0, Math.min(5, 2 + Math.floor(n / 3))).map((f, i) => ({ f, at: i * 0.05, dur: 0.22, type: "sine" as const, gain: 0.6 }))),
  /** A pop (bubble, lantern caught). */
  pop: () => play([{ f: 600, at: 0, dur: 0.09, type: "sine", to: 1400 }]),
  /** A spell flying out of the wand. */
  zap: () => play([{ f: 1800, at: 0, dur: 0.16, type: "square", gain: 0.25, to: 500 }]),
  /** A fireball hitting the ground. */
  boom: () => play([{ f: 120, at: 0, dur: 0.4, type: "sawtooth", gain: 0.4, to: 40 }]),
  /** Level up: a rising run of the chime. */
  levelUp: () => play(CHIME.map((f, i) => ({ f, at: i * 0.07, dur: 0.3, type: "triangle" as const, gain: 0.7 }))),
  /** Game over: three falling notes. */
  gameOver: () =>
    play([
      { f: 784, at: 0, dur: 0.25, type: "triangle" },
      { f: 659, at: 0.18, dur: 0.25, type: "triangle" },
      { f: 523, at: 0.36, dur: 0.5, type: "triangle" },
    ]),
};

export type Sfx = keyof typeof sfx;
