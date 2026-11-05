"use client";

import { useEffect, useRef } from "react";
import type { AnimationItem, LottiePlayer } from "lottie-web";

// "Lightning VFX" by Clément Pavageau (LottieFiles, Lottie Simple License): see public/fx/README.md.
// The file holds two strikes: a vertical one (frames 0-21) and a horizontal one (frames 64-82).
const FX_URL = "/fx/lightning-vfx.json";
export const STRIKE_FRAMES: [number, number] = [0, 21];
export const ARC_FRAMES: [number, number] = [64, 82];

let loading: Promise<{ lottie: LottiePlayer; json: string }> | null = null;

/** Loads the player (SVG-only build) and the animation once; later calls reuse them. */
export function loadLightning() {
  loading ??= Promise.all([
    import("lottie-web/build/player/lottie_light").then((m) => m.default as LottiePlayer),
    fetch(FX_URL).then((r) => {
      if (!r.ok) throw new Error(`lightning fx: ${r.status}`);
      return r.text();
    }),
  ])
    .then(([lottie, json]) => ({ lottie, json }))
    .catch((e) => {
      loading = null; // try again next time
      throw e;
    });
  return loading;
}

/**
 * Plays one segment of the lightning once, starting after `delay` ms. Colors come from CSS
 * (.pw-lottie path), so the white original fits both themes.
 */
export function Lightning({
  frames,
  delay = 0,
  stretch = false,
  className,
}: {
  frames: [number, number];
  delay?: number;
  stretch?: boolean; // fill the box (the arc over the field) instead of keeping the art's ratio
  className: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let anim: AnimationItem | undefined;
    let timer: number | undefined;
    let gone = false;
    loadLightning()
      .then(({ lottie, json }) => {
        if (gone || !box.current) return;
        anim = lottie.loadAnimation({
          container: box.current,
          renderer: "svg",
          loop: false,
          autoplay: false,
          animationData: JSON.parse(json), // the player changes the data: one copy per player
          rendererSettings: { preserveAspectRatio: stretch ? "none" : "xMidYMid meet" },
        });
        anim.goToAndStop(frames[0], true);
        // The last drawing would stay on screen: fade it out when the segment ends.
        anim.addEventListener("complete", () => box.current?.classList.add("pw-done"));
        timer = window.setTimeout(() => anim?.playSegments(frames, true), delay);
      })
      .catch(() => {});
    return () => {
      gone = true;
      window.clearTimeout(timer);
      anim?.destroy();
    };
  }, [frames, delay, stretch]);
  return <div ref={box} className={`pw-lottie ${className}`} aria-hidden />;
}
