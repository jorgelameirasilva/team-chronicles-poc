#!/usr/bin/env bash
# PreCompact: enqueue a transcript for harvest before Codex compacts the context.
# Mid-conversation harvesting — captures durable atoms while material is fresh,
# instead of waiting until session end.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="${CHRONICLE_PLUGIN:-$(cd "$HERE/.." && pwd)}"
QUEUE_DIR="${CHRONICLE_QUEUE:-$HOME/.chronicle-team/queue}"

mkdir -p "$QUEUE_DIR" 2>/dev/null || true

TS=$(date +%s)
QUEUE_FILE="$QUEUE_DIR/pre-compact-$TS.json"
cat > "$QUEUE_FILE" 2>/dev/null || true

# Fire-and-forget harvester
HARVEST="$PLUGIN_DIR/../../scripts/harvest.js"
if [[ -f "$HARVEST" ]] && [[ -f "$QUEUE_FILE" ]]; then
  (nohup node "$HARVEST" "$QUEUE_FILE" >/dev/null 2>&1 &) || true
fi

echo '{}'
