#!/usr/bin/env bash
set -euo pipefail

# Stop: async enqueue harvest job. Never blocks.

PLUGIN_DIR="${CHRONICLE_PLUGIN:-$HOME/.chronicle-team/plugin}"
QUEUE_DIR="${CHRONICLE_QUEUE:-$HOME/.chronicle-team/queue}"
mkdir -p "$QUEUE_DIR"

# Dump stdin (session transcript payload) into queue file for out-of-band processing
TS=$(date +%s)
cat > "$QUEUE_DIR/session-$TS.json"

# Fire-and-forget harvester. Real impl: spawn sandboxed codex agent.
(nohup node "$PLUGIN_DIR/../scripts/harvest.js" "$QUEUE_DIR/session-$TS.json" >/dev/null 2>&1 &) || true

echo '{}'
