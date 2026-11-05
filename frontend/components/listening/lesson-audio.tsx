"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/icon";

// The lesson audio: one <audio> element, its time and speed, and playing one line (start to
// end) for dictation. The range end is checked every 30 ms (timeupdate fires only ~4 times a
// second, which would run into the next line).

export const SPEEDS = [0.75, 1, 1.25] as const;

export type LessonAudio = {
  time: number;
  duration: number;
  playing: boolean;
  rate: number;
  error: boolean;
  setRate: (r: number) => void;
  toggle: () => void;
  seek: (t: number, play?: boolean) => void;
  /** Plays start..end (seconds) at the given speed; resolves when it stops. */
  playRange: (start: number, end: number, rate?: number) => Promise<void>;
  pause: () => void;
};

export function useLessonAudio(ref: React.RefObject<HTMLAudioElement | null>, onTime?: (t: number) => void): LessonAudio {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [error, setError] = useState(false);
  // play() is refused without a user gesture (autoplay rules): not a broken file.
  const playFailed = useCallback((e: unknown) => {
    if (!(e instanceof DOMException && e.name === "NotAllowedError")) setError(true);
  }, []);
  const rangeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const rangeDone = useRef<(() => void) | null>(null);
  const onTimeRef = useRef(onTime);
  useEffect(() => {
    onTimeRef.current = onTime;
  }, [onTime]);

  const stopRange = useCallback(() => {
    if (rangeTimer.current) clearInterval(rangeTimer.current);
    rangeTimer.current = null;
    rangeDone.current?.();
    rangeDone.current = null;
  }, []);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onT = () => {
      setTime(a.currentTime);
      onTimeRef.current?.(a.currentTime);
    };
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      stopRange();
    };
    const onErr = () => setError(true);
    a.addEventListener("timeupdate", onT);
    a.addEventListener("seeked", onT);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    a.addEventListener("error", onErr);
    return () => {
      a.removeEventListener("timeupdate", onT);
      a.removeEventListener("seeked", onT);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
      a.removeEventListener("error", onErr);
      stopRange();
    };
  }, [ref, stopRange]);

  const setRate = useCallback((r: number) => {
    setRateState(r);
    if (ref.current) ref.current.playbackRate = r;
  }, [ref]);

  const pause = useCallback(() => ref.current?.pause(), [ref]);

  const toggle = useCallback(() => {
    const a = ref.current;
    if (!a) return;
    stopRange();
    if (a.paused) a.play().catch(playFailed);
    else a.pause();
  }, [ref, stopRange, playFailed]);

  const seek = useCallback(
    (t: number, play = false) => {
      const a = ref.current;
      if (!a) return;
      stopRange();
      a.currentTime = Math.max(0, t);
      if (play) a.play().catch(playFailed);
    },
    [ref, stopRange, playFailed],
  );

  const playRange = useCallback(
    (start: number, end: number, r?: number) => {
      const a = ref.current;
      if (!a) return Promise.resolve();
      stopRange();
      a.playbackRate = r ?? rate;
      a.currentTime = start;
      return new Promise<void>((resolve) => {
        rangeDone.current = () => {
          a.playbackRate = rate;
          resolve();
        };
        a.play().catch((e) => {
          playFailed(e);
          stopRange();
        });
        rangeTimer.current = setInterval(() => {
          if (a.currentTime >= end - 0.02 || a.ended) {
            a.pause();
            stopRange();
          }
        }, 30);
      });
    },
    [ref, rate, stopRange, playFailed],
  );

  return { time, duration, playing, rate, error, setRate, toggle, seek, playRange, pause };
}

export function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Play / seek / speed controls for useLessonAudio. */
export function PlayerControls({ audio, fallbackDuration }: { audio: LessonAudio; fallbackDuration: number }) {
  const { t } = useI18n();
  const dur = audio.duration || fallbackDuration;
  return (
    <div className="ls-player-row">
      <button type="button" className="ls-round" onClick={() => audio.seek(audio.time - 5)} aria-label={t("listen.back5")} title={t("listen.back5")}>
        <Icon name="rewind" />
      </button>
      <button type="button" className="ls-round" data-main onClick={audio.toggle} aria-label={t(audio.playing ? "listen.pause" : "listen.play")}>
        <Icon name={audio.playing ? "pause" : "play"} size="lg" />
      </button>
      <button type="button" className="ls-round" onClick={() => audio.seek(audio.time + 5)} aria-label={t("listen.fwd5")} title={t("listen.fwd5")}>
        <Icon name="forward" />
      </button>
      <input
        type="range"
        className="ls-range"
        min={0}
        max={Math.max(dur, 0.1)}
        step={0.1}
        value={Math.min(audio.time, dur || 0)}
        onChange={(e) => audio.seek(Number(e.target.value))}
        aria-label={t("listen.position")}
      />
      <span className="ls-time">
        {fmtTime(audio.time)} / {fmtTime(dur)}
      </span>
      <div className="ls-seg" role="radiogroup" aria-label={t("listen.speed")}>
        {SPEEDS.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={audio.rate === r} onClick={() => audio.setRate(r)} style={{ padding: "0 12px" }}>
            {r}×
          </button>
        ))}
      </div>
    </div>
  );
}
