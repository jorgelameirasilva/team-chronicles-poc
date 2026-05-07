#!/usr/bin/env bash
set -euo pipefail

# UserPromptSubmit: read prompt JSON from stdin, retrieve top chronicles,
# emit JSON with `additionalContext` wrapping hits in <team-chronicle> blocks.

CHRONICLES_ROOT="${CHRONICLES_ROOT:-$HOME/.chronicle-team/chronicles}"
TEAM="${CHRONICLE_TEAM:-default}"
PLUGIN_DIR="${CHRONICLE_PLUGIN:-$HOME/.chronicle-team/plugin}"

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).prompt||"")}catch{console.log("")}})')

if [[ -z "$PROMPT" ]]; then
  echo '{}'
  exit 0
fi

# Delegate to MCP search helper in one-shot mode
RESULT=$(CHRONICLES_ROOT="$CHRONICLES_ROOT" TEAM="$TEAM" node "$PLUGIN_DIR/mcp/search.js" "$PROMPT" 3 2>/dev/null || echo "")

if [[ -z "$RESULT" ]]; then
  echo '{}'
  exit 0
fi

# Wrap in <team-chronicle> to flag as untrusted context
jq -n --arg ctx "$RESULT" '{additionalContext: $ctx}'
