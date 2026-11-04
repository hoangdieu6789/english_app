"use client";

import { useEffect, useRef, useState } from "react";
import { SILENT_RMS, WavRecorder } from "@/lib/wav-recorder";

// Azure's REST API for short audio takes at most 60 s; stop a little before that.
export const MAX_ANSWER_SECONDS = 55;

type RecorderState = "idle" | "recording";

/**
 * Microphone recording with a running timer. Recording stops by itself after maxSeconds
 * and the WAV is passed to onAutoStop, so a long answer is never lost (onAutoStopError gets
 * the error when the recording cannot be used, e.g. a silent microphone).
 * `quiet` turns true when nothing louder than near-silence was heard in the first 3 s.
 */
export function useRecorder(maxSeconds: number, onAutoStop: (wav: Blob) => void, onAutoStopError?: (err: Error) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const onAutoStopErrorRef = useRef(onAutoStopError);
  const recorderRef = useRef<WavRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onAutoStopRef = useRef(onAutoStop);

  useEffect(() => {
    onAutoStopRef.current = onAutoStop;
    onAutoStopErrorRef.current = onAutoStopError;
  }, [onAutoStop, onAutoStopError]);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function stop(): Blob | null {
    clearTimer();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setState("idle");
    return recorder ? recorder.stop() : null;
  }

  async function start() {
    const recorder = new WavRecorder();
    await recorder.start();
    recorderRef.current = recorder;
    setState("recording");
    setSecs(0);
    setLevel(0);
    setQuiet(false);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const s = Math.floor(elapsed);
      setSecs(s);
      setLevel(recorder.level);
      setQuiet(elapsed >= 3 && recorder.maxLevel < SILENT_RMS);
      if (s >= maxSeconds) {
        try {
          const wav = stop();
          if (wav) onAutoStopRef.current(wav);
        } catch (err) {
          onAutoStopErrorRef.current?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }, 250);
  }

  function cancel() {
    clearTimer();
    try {
      recorderRef.current?.stop();
    } catch {
      // nothing recorded yet
    }
    recorderRef.current = null;
    setState("idle");
    setSecs(0);
  }

  // Leaving the page (or switching part) while recording must release the microphone.
  useEffect(
    () => () => {
      clearTimer();
      try {
        recorderRef.current?.stop();
      } catch {
        // nothing recorded yet
      }
      recorderRef.current = null;
    },
    [],
  );

  return { state, secs, level, quiet, start, stop, cancel };
}

export function formatSecs(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
