# LLM bridge (Claude Code / Gemini CLI)

Lets the English App API use the **Claude Code** and **Gemini CLI** logged in on your Mac with
your own subscription plan, instead of (or before) free OpenRouter models.

Why a bridge: the API runs in Docker, and Claude Code keeps its login in the macOS Keychain,
so the CLI cannot run inside the container. The bridge is a small Python script (standard
library only) that runs on the Mac, listens on `127.0.0.1:8765`, and runs the CLI for each
request. The container reaches it as `host.docker.internal`.

Use it only for your own local app. Subscription plans are for the subscriber's own use;
an app that serves other users needs a paid API key.

## Set up

1. Log in to the CLIs once (interactive):
   - Claude Code: `claude` → `/login` (already done if you use Claude Code).
   - Gemini CLI: `npm install -g @google/gemini-cli`, then run `gemini` and choose
     "Login with Google" with the account that has the Gemini plan.
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
  out, bridge not running, timeout), the next one is used, so OpenRouter stays a safety net.
- The CLIs run with no tools, no MCP servers, no project settings and an empty working
  directory, so a prompt can only produce text.
- At most 2 CLI processes per provider at the same time (`--concurrency`).
- Each call counts against your plan's usage limits (shared with your own Claude Code /
  Gemini use). `CLAUDE_MODEL=haiku` is lighter; `sonnet` grades better.
- Health check: `curl http://127.0.0.1:8765/healthz`.
