#!/usr/bin/env bash
# Stop: async enqueue harvest job. Never blocks. Never crashes the session.

set -uo pipefail   # no -e

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="${CHRONICLE_PLUGIN:-$(cd "$HERE/.." && pwd)}"
QUEUE_DIR="${CHRONICLE_QUEUE:-$HOME/.chronicle-team/queue}"

mkdir -p "$QUEUE_DIR" 2>/dev/null || true

TS=$(date +%s)
QUEUE_FILE="$QUEUE_DIR/session-$TS.json"
cat > "$QUEUE_FILE" 2>/dev/null || true

# Fire-and-forget harvester (stub — real impl runs codex exec to extract atoms)
HARVEST="$PLUGIN_DIR/../../scripts/harvest.js"
if [[ -f "$HARVEST" ]] && [[ -f "$QUEUE_FILE" ]]; then
  (nohup node "$HARVEST" "$QUEUE_FILE" >/dev/null 2>&1 &) || true
fi

echo '{}'
