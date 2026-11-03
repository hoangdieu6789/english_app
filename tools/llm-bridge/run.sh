#!/bin/sh
# Starts the LLM bridge with LLM_BRIDGE_TOKEN from the English App .env. Only the token is
# read, so other keys in .env (Azure, OpenRouter, Gemini) never reach the bridge or the CLI.
# Used by the launchd agent (see README.md) and fine to run by hand.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
LLM_BRIDGE_TOKEN=$(sed -n 's/^LLM_BRIDGE_TOKEN=//p' .env | tail -1)
export LLM_BRIDGE_TOKEN
exec python3 tools/llm-bridge/llm_bridge.py "$@"
