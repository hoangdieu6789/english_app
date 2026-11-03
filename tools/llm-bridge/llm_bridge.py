#!/usr/bin/env python3
"""LLM bridge for the English App.

Lets the API (running in Docker) use the Claude Code CLI that is logged in on this Mac with
your own subscription plan. Claude Code keeps its login in the macOS Keychain,
so it cannot run inside the container; the API calls this bridge instead.

    POST /v1/complete   {"provider": "claude", "model": "", "system": "", "user": "",
                         "timeout_s": 120}
                        -> 200 {"text": "...", "provider": "...", "model": "<model id used>", "took_ms": 1234}
                        -> 4xx/5xx {"error": "..."}   (the API then tries its next provider)
    POST /v1/transcribe audio/wav body (16 kHz mono PCM, <= 60 s)
                        -> 200 {"text": "...", "model": "ggml-medium.en.bin", "took_ms": 1100}
    GET  /healthz       -> {"claude": true, "whisper": true}

Transcription uses whisper.cpp (`brew install whisper-cpp`) with a local model file
(WHISPER_MODEL, default ~/.cache/whisper-models/ggml-medium.en.bin). It runs on the Mac's GPU
(Metal), which the container cannot use. Azure's own recognition of free speech has no
context and got 35% of words wrong on real learner answers; whisper medium.en got 17%.

Gemini is not here: since June 2026 the Gemini CLI no longer accepts Google AI Pro logins,
and Antigravity CLI (agy) does not allow wrapping it in an app under consumer plans. The API
calls the Gemini API directly instead (GEMINI_API_KEY).

Security: listens on 127.0.0.1 only (the Colima VM reaches it as host.docker.internal) and
every /v1 request needs "Authorization: Bearer $LLM_BRIDGE_TOKEN".

The CLI runs with no tools, no MCP servers, no project settings and an empty working
directory, so a prompt can only produce text. Only use this for your own local app: the
subscription plans are for the subscriber's own use, not for serving other users.

Run:  LLM_BRIDGE_TOKEN=... python3 tools/llm-bridge/llm_bridge.py   (or: make -C .. llm-bridge)
"""

import argparse
import hmac
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY_BYTES = 2 << 20  # 2 MB
MAX_AUDIO_BYTES = 4 << 20  # 16 kHz mono 16-bit: 60 s is ~1.9 MB
WHISPER_CLI = os.environ.get("WHISPER_CLI", "whisper-cli")
WHISPER_MODEL = os.path.expanduser(os.environ.get("WHISPER_MODEL", "~/.cache/whisper-models/ggml-medium.en.bin"))
WHISPER_TIMEOUT_S = 60
DEFAULT_TIMEOUT_S = 120
MAX_TIMEOUT_S = 300

# An empty directory, so the CLI finds no CLAUDE.md / project settings.
WORKDIR = tempfile.mkdtemp(prefix="llm-bridge-")


class BridgeError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def run_cli(cmd, stdin_text, timeout_s, env=None):
    try:
        proc = subprocess.run(
            cmd,
            input=stdin_text,
            capture_output=True,
            text=True,
            timeout=timeout_s,
            cwd=WORKDIR,
            env=env,
        )
    except subprocess.TimeoutExpired:
        raise BridgeError(504, f"{cmd[0]} timed out after {timeout_s}s")
    except FileNotFoundError:
        raise BridgeError(503, f"{cmd[0]} is not installed")
    return proc


def parse_json_output(proc, name):
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        detail = (proc.stderr or proc.stdout).strip()[-400:]
        raise BridgeError(502, f"{name} exit {proc.returncode}: {detail}")


def run_claude(model, system, user, timeout_s):
    cmd = [
        "claude", "-p",
        "--output-format", "json",
        "--tools", "",
        "--strict-mcp-config",
        "--setting-sources", "",
        "--no-session-persistence",
    ]
    if model:
        cmd += ["--model", model]
    if system:
        cmd += ["--system-prompt", system]
    proc = run_cli(cmd, user, timeout_s)
    data = parse_json_output(proc, "claude")
    if data.get("is_error") or proc.returncode != 0:
        # Usage limit, login expired, overloaded...: let the API fall back.
        raise BridgeError(502, f"claude: {str(data.get('result') or data.get('subtype'))[:400]}")
    # modelUsage lists the model ids used, e.g. {"claude-sonnet-5-5": {...}}.
    used = list((data.get("modelUsage") or {}).keys())
    return data.get("result") or "", (used[0] if used else model)


PROVIDERS = {"claude": run_claude}


def whisper_ready():
    return shutil.which(WHISPER_CLI) is not None and os.path.isfile(WHISPER_MODEL)


def run_whisper(wav_bytes):
    if not wav_bytes.startswith(b"RIFF"):
        raise BridgeError(400, "body is not a WAV file")
    if not whisper_ready():
        raise BridgeError(503, f"whisper not ready: need {WHISPER_CLI} and {WHISPER_MODEL}")
    with tempfile.NamedTemporaryFile(suffix=".wav", dir=WORKDIR) as f:
        f.write(wav_bytes)
        f.flush()
        # -nt: no timestamps, -np: only the text on stdout.
        proc = run_cli([WHISPER_CLI, "-m", WHISPER_MODEL, "-f", f.name, "-l", "en", "-nt", "-np"], None, WHISPER_TIMEOUT_S)
    if proc.returncode != 0:
        raise BridgeError(502, f"whisper exit {proc.returncode}: {proc.stderr.strip()[-400:]}")
    return " ".join(line.strip() for line in proc.stdout.splitlines() if line.strip())


class Handler(BaseHTTPRequestHandler):
    server_version = "llm-bridge/1"
    token = ""
    limits = {}

    def log_message(self, format, *args):  # quiet default access log
        pass

    def send_json(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == "/healthz":
            health = {name: shutil.which(name) is not None for name in PROVIDERS}
            health["whisper"] = whisper_ready()
            self.send_json(200, health)
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path not in ("/v1/complete", "/v1/transcribe"):
            return self.send_json(404, {"error": "not found"})
        auth = self.headers.get("Authorization", "")
        if not hmac.compare_digest(auth, f"Bearer {self.token}"):
            return self.send_json(401, {"error": "bad token"})
        length = int(self.headers.get("Content-Length") or 0)
        limit = MAX_AUDIO_BYTES if self.path == "/v1/transcribe" else MAX_BODY_BYTES
        if length <= 0 or length > limit:
            return self.send_json(413, {"error": "body missing or too large"})
        if self.path == "/v1/transcribe":
            return self.transcribe(self.rfile.read(length))
        try:
            req = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self.send_json(400, {"error": "invalid JSON"})

        provider = req.get("provider")
        run = PROVIDERS.get(provider)
        if run is None:
            return self.send_json(400, {"error": f"unknown provider {provider!r}"})
        user = req.get("user") or ""
        if not user.strip():
            return self.send_json(400, {"error": "empty user prompt"})
        timeout_s = min(int(req.get("timeout_s") or DEFAULT_TIMEOUT_S), MAX_TIMEOUT_S)
        model = req.get("model") or ""

        started = time.monotonic()
        try:
            with self.limits[provider]:
                text, used_model = run(model, req.get("system") or "", user, timeout_s)
        except BridgeError as e:
            took = int((time.monotonic() - started) * 1000)
            print(f"llm-bridge: provider={provider} model={model or 'default'} took={took}ms error={e}", flush=True)
            return self.send_json(e.status, {"error": str(e)})
        took = int((time.monotonic() - started) * 1000)
        print(f"llm-bridge: provider={provider} model={used_model or 'default'} took={took}ms chars={len(text)}", flush=True)
        self.send_json(200, {"text": text, "provider": provider, "model": used_model, "took_ms": took})

    def transcribe(self, wav_bytes):
        started = time.monotonic()
        try:
            with self.limits["whisper"]:
                text = run_whisper(wav_bytes)
        except BridgeError as e:
            print(f"llm-bridge: whisper error={e}", flush=True)
            return self.send_json(e.status, {"error": str(e)})
        took = int((time.monotonic() - started) * 1000)
        print(f"llm-bridge: whisper took={took}ms audio_bytes={len(wav_bytes)} chars={len(text)}", flush=True)
        self.send_json(200, {"text": text, "model": os.path.basename(WHISPER_MODEL), "took_ms": took})


def main():
    ap = argparse.ArgumentParser(description="LLM bridge for the English App")
    ap.add_argument("--host", default=os.environ.get("LLM_BRIDGE_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("LLM_BRIDGE_PORT", "8765")))
    ap.add_argument("--concurrency", type=int, default=int(os.environ.get("LLM_BRIDGE_CONCURRENCY", "2")),
                    help="CLI processes per provider at the same time")
    args = ap.parse_args()

    Handler.token = os.environ.get("LLM_BRIDGE_TOKEN", "")
    if len(Handler.token) < 16:
        sys.exit("LLM_BRIDGE_TOKEN must be set (at least 16 characters)")
    Handler.limits = {name: threading.Semaphore(args.concurrency) for name in PROVIDERS}
    Handler.limits["whisper"] = threading.Semaphore(1)  # one GPU job at a time

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    found = {name: shutil.which(name) is not None for name in PROVIDERS}
    found["whisper"] = whisper_ready()
    print(f"llm-bridge: listening on http://{args.host}:{args.port} providers={found}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
