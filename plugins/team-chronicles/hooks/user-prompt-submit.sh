#!/usr/bin/env bash
# UserPromptSubmit: read prompt JSON from stdin, retrieve top chronicles,
# emit JSON with additionalContext wrapping hits in <team-chronicle> blocks.

set -uo pipefail   # no -e

# Resolve paths via env first, then fall back to canonical locations.
CHRONICLES_ROOT="${CHRONICLES_ROOT:-$HOME/.chronicle-team-chronicles}"
TEAM="${CHRONICLE_TEAM:-default}"

# Plugin dir = script's grandparent (this file lives under plugin/hooks/)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="${CHRONICLE_PLUGIN:-$(cd "$HERE/.." && pwd)}"

INPUT=$(cat)
PROMPT=$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).prompt||"")}catch{console.log("")}})' <<< "$INPUT" 2>/dev/null || echo "")

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

# Wrap in <team-chronicle> via jq if available, else hand-roll JSON-safe output
if command -v jq >/dev/null 2>&1; then
  jq -n --arg ctx "$RESULT" '{additionalContext: $ctx}'
else
  ESCAPED=$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{process.stdout.write(JSON.stringify({additionalContext: d}))})' <<< "$RESULT" 2>/dev/null || echo '{}')
  echo "$ESCAPED"
fi
