#!/usr/bin/env python3
"""LLM bridge for the English App.

Lets the API (running in Docker) use the Claude Code and Gemini CLIs that are logged in on
this Mac with your own subscription plan. Claude Code keeps its login in the macOS Keychain,
so it cannot run inside the container; the API calls this bridge instead.

    POST /v1/complete   {"provider": "claude"|"gemini", "model": "", "system": "", "user": "",
                         "timeout_s": 120}
                        -> 200 {"text": "...", "provider": "...", "took_ms": 1234}
                        -> 4xx/5xx {"error": "..."}   (the API then tries its next provider)
    GET  /healthz       -> {"claude": true, "gemini": false}

Security: listens on 127.0.0.1 only (the Colima VM reaches it as host.docker.internal) and
every /v1 request needs "Authorization: Bearer $LLM_BRIDGE_TOKEN".

The CLIs run with no tools, no MCP servers, no project settings and an empty working
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
DEFAULT_TIMEOUT_S = 120
MAX_TIMEOUT_S = 300

# An empty directory, so the CLIs find no CLAUDE.md / GEMINI.md / project settings.
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
    return data.get("result") or ""


def run_gemini(model, system, user, timeout_s):
    env = dict(os.environ)
    sys_file = None
    if system:
        # GEMINI_SYSTEM_MD replaces the CLI's own agent system prompt with ours.
        sys_file = tempfile.NamedTemporaryFile("w", suffix=".md", dir=WORKDIR, delete=False)
        sys_file.write(system)
        sys_file.close()
        env["GEMINI_SYSTEM_MD"] = sys_file.name
    cmd = ["gemini", "--output-format", "json", "--prompt", " "]
    if model:
        cmd += ["--model", model]
    try:
        proc = run_cli(cmd, user, timeout_s, env=env)
    finally:
        if sys_file:
            os.unlink(sys_file.name)
    data = parse_json_output(proc, "gemini")
    if data.get("error") or proc.returncode != 0:
        err = data.get("error") or {}
        msg = err.get("message") if isinstance(err, dict) else str(err)
        raise BridgeError(502, f"gemini: {str(msg or proc.stderr)[:400]}")
    return data.get("response") or ""


PROVIDERS = {"claude": run_claude, "gemini": run_gemini}


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
            self.send_json(200, {name: shutil.which(name) is not None for name in PROVIDERS})
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/v1/complete":
            return self.send_json(404, {"error": "not found"})
        auth = self.headers.get("Authorization", "")
        if not hmac.compare_digest(auth, f"Bearer {self.token}"):
            return self.send_json(401, {"error": "bad token"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            return self.send_json(413, {"error": "body missing or too large"})
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
                text = run(model, req.get("system") or "", user, timeout_s)
        except BridgeError as e:
            took = int((time.monotonic() - started) * 1000)
            print(f"llm-bridge: provider={provider} model={model or 'default'} took={took}ms error={e}", flush=True)
            return self.send_json(e.status, {"error": str(e)})
        took = int((time.monotonic() - started) * 1000)
        print(f"llm-bridge: provider={provider} model={model or 'default'} took={took}ms chars={len(text)}", flush=True)
        self.send_json(200, {"text": text, "provider": provider, "took_ms": took})


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

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    found = {name: shutil.which(name) is not None for name in PROVIDERS}
    print(f"llm-bridge: listening on http://{args.host}:{args.port} providers={found}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
