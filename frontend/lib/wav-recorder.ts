import { getLang, translate } from "@/lib/i18n";

const TARGET_SAMPLE_RATE = 16000;

// Loudest block RMS (0–1) under which a recording counts as silent. The backend uses
// ~300/32768 ≈ 0.009 as its speech floor; a silent mic measured ~0.0015. Sending a silent
// recording to Azure only wastes free quota and returns "InitialSilenceTimeout".
export const SILENT_RMS = 0.01;

export class SilentRecordingError extends Error {
  constructor() {
    super(translate(getLang(), "practice.silentRecording"));
    this.name = "SilentRecordingError";
  }
}

/**
 * Records microphone audio as 16-bit PCM mono WAV at 16kHz — the exact
 * format Azure Pronunciation Assessment expects. MediaRecorder can't produce
 * WAV directly across browsers, so this captures raw PCM via Web Audio API
 * and encodes the WAV container by hand.
 */
export class WavRecorder {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = TARGET_SAMPLE_RATE;
  private lastRms = 0;
  private maxRms = 0;

  /** RMS (0–1) of the latest audio block, for a level meter. */
  get level(): number {
    return this.lastRms;
  }

  /** Loudest block RMS (0–1) since start. */
  get maxLevel(): number {
    return this.maxRms;
  }

  /** Call from a click handler: the AudioContext is created before the first await, so
   * Safari still counts it as started by the user and does not leave it suspended. */
  async start(): Promise<void> {
    this.audioContext = new AudioContext();
    const resumed = this.audioContext.state === "suspended" ? this.audioContext.resume() : Promise.resolve();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.audioContext.close();
      this.audioContext = null;
      throw err;
    }
    await resumed;
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    this.sampleRate = this.audioContext.sampleRate;
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.lastRms = this.maxRms = 0;

    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(input));
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      this.lastRms = Math.sqrt(sum / input.length);
      this.maxRms = Math.max(this.maxRms, this.lastRms);
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  stop(): Blob {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    const originalRate = this.audioContext?.sampleRate ?? this.sampleRate;
    this.audioContext?.close();

    if (this.chunks.length === 0) {
      throw new Error(translate(getLang(), "practice.noMicAudio"));
    }
    if (this.maxRms < SILENT_RMS) {
      throw new SilentRecordingError();
    }

    const merged = mergeFloat32(this.chunks);
    const resampled = resample(merged, originalRate, TARGET_SAMPLE_RATE);
    return encodeWav(resampled, TARGET_SAMPLE_RATE);
  }
}

function mergeFloat32(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function resample(data: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return data;
  const ratio = fromRate / toRate;
  const newLength = Math.round(data.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const lower = Math.floor(srcIndex);
    const upper = Math.min(lower + 1, data.length - 1);
    const frac = srcIndex - lower;
    result[i] = data[lower] * (1 - frac) + data[upper] * frac;
  }
  return result;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
