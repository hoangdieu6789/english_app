#!/usr/bin/env python3
"""Final pitch direction of speech regions (Pronunciation P-04 in criteria/04).

Reads a JSON request on stdin:
  {"audio": "answer.wav",
   "items": [{"id": 0, "start": 3.12, "end": 3.58, "sentence_type": "statement"}, ...],
   "rise_semitones": 1.5, "fall_semitones": -1.5}

Writes on stdout:
  {"results": [{"id": 0, "direction": "fall", "delta_st": -3.2}, ...]}

direction: rise | fall | level | unvoiced (too few voiced frames to judge).

Method: Praat pitch track (parselmouth) over the region, converted to semitones,
then a least-squares line; delta_st = slope x region length.
Pitch floor/ceiling are set from the speaker's own median F0 over the whole file.

Install: pip install praat-parselmouth numpy
Server mode (avoids process start-up per request): python3 pitch_direction.py --serve 8765
"""
import json
import sys

import numpy as np
import parselmouth

MIN_VOICED_FRAMES = 5
PAD_BEFORE, PAD_AFTER = 0.05, 0.10  # seconds around the word, to catch the tone tail


def speaker_range(snd):
    """Pitch floor/ceiling around the speaker's median F0 (falls back to 75–500 Hz)."""
    pitch = snd.to_pitch(time_step=0.01, pitch_floor=75, pitch_ceiling=500)
    f0 = pitch.selected_array["frequency"]
    f0 = f0[f0 > 0]
    if len(f0) < 20:
        return 75.0, 500.0
    med = float(np.median(f0))
    return max(60.0, med * 0.5), min(700.0, med * 2.2)


def direction_for(snd, floor, ceiling, start, end, rise, fall):
    t0 = max(0.0, start - PAD_BEFORE)
    t1 = min(snd.duration, end + PAD_AFTER)
    if t1 - t0 < 0.08:
        return "unvoiced", 0.0
    part = snd.extract_part(from_time=t0, to_time=t1, preserve_times=True)
    pitch = part.to_pitch(time_step=0.01, pitch_floor=floor, pitch_ceiling=ceiling)
    f0 = pitch.selected_array["frequency"]
    times = pitch.xs()
    mask = f0 > 0
    if mask.sum() < MIN_VOICED_FRAMES:
        return "unvoiced", 0.0
    st = 12 * np.log2(f0[mask] / 100.0)   # semitones re 100 Hz
    t = times[mask]
    slope = np.polyfit(t, st, 1)[0]       # semitones per second
    delta = float(slope * (t[-1] - t[0]))
    if delta >= rise:
        return "rise", round(delta, 2)
    if delta <= fall:
        return "fall", round(delta, 2)
    return "level", round(delta, 2)


def analyse(req):
    snd = parselmouth.Sound(req["audio"])
    if snd.n_channels > 1:
        snd = snd.convert_to_mono()
    floor, ceiling = speaker_range(snd)
    rise = float(req.get("rise_semitones", 1.5))
    fall = float(req.get("fall_semitones", -1.5))
    results = []
    for it in req.get("items", []):
        d, delta = direction_for(snd, floor, ceiling, float(it["start"]), float(it["end"]), rise, fall)
        results.append({"id": it["id"], "direction": d, "delta_st": delta})
    return {"results": results}


def serve(port):
    from http.server import BaseHTTPRequestHandler, HTTPServer

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            try:
                body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                out, code = json.dumps(analyse(json.loads(body))).encode(), 200
            except Exception as e:  # report errors as JSON
                out, code = json.dumps({"error": str(e)}).encode(), 400
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(out)

        def log_message(self, *args):
            pass

    HTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--serve":
        serve(int(sys.argv[2]))
    else:
        json.dump(analyse(json.load(sys.stdin)), sys.stdout)
