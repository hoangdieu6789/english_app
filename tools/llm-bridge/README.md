# LLM bridge (Claude Code)

Lets the English App API use the **Claude Code** CLI logged in on your Mac with your own
subscription plan, instead of (or before) the Gemini API and free OpenRouter models.

Why a bridge: the API runs in Docker, and Claude Code keeps its login in the macOS Keychain,
so the CLI cannot run inside the container. The bridge is a small Python script (standard
library only) that runs on the Mac, listens on `127.0.0.1:8765`, and runs the CLI for each
request. The container reaches it as `host.docker.internal`.

Use it only for your own local app. Subscription plans are for the subscriber's own use;
an app that serves other users needs a paid API key.

Gemini does not go through the bridge. Since June 18, 2026 the Gemini CLI no longer accepts
"Login with Google" for Google AI Pro/Ultra, and its replacement, Antigravity CLI (`agy`),
does not allow wrapping it in an app under consumer plans. The API calls the Gemini API
directly with `GEMINI_API_KEY` instead (see `backend/env.example`).

## Set up

1. Log in to Claude Code once: `claude` → `/login` (already done if you use Claude Code).
2. Add to the English App `.env` (the one next to `docker-compose.yml`):
   ```
   LLM_PROVIDERS=claude,gemini,openrouter
   LLM_BRIDGE_TOKEN=<random string, e.g. from: openssl rand -hex 24>
   ```
3. Start the bridge with the same token, then restart the API:
   ```
   set -a; . ./.env; set +a
   python3 tools/llm-bridge/llm_bridge.py
   ```
   The API log shows `llm providers: [claude gemini openrouter]` at start, and
   `llm bridge: provider=claude model=sonnet took=...` for each call.

## How it behaves

- Providers are tried in the order of `LLM_PROVIDERS`. If one fails (usage limit, logged
  out, bridge not running, timeout), the next one is used.
- The CLI runs with no tools, no MCP servers, no project settings and an empty working
  directory, so a prompt can only produce text.
- At most 2 CLI processes at the same time (`--concurrency`).
- Each call counts against your plan's usage limits (shared with your own Claude Code use).
  Measured on a Part 3 answer: Sonnet 28 s, Haiku 24 s (the long feedback text takes most of
  the time; the CLI adds about 3–4 s). `CLAUDE_MODEL=sonnet` is the default.
- Health check: `curl http://127.0.0.1:8765/healthz`.
