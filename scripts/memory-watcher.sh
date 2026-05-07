#!/usr/bin/env bash
# Memory watcher — taps into Codex's built-in memory generation.
#
# Codex auto-summarizes idle threads to ~/.codex/memories/ and ~/.codex/memories_extensions/chronicle/
# (when enabled in config.toml). This watcher polls those dirs for new files
# and feeds them to harvest.js for team-chronicle extraction.
#
# Run as a launchd agent on macOS, systemd unit on Linux, or cron job.
# Or run interactively: `./scripts/memory-watcher.sh`

set -uo pipefail

PLUGIN_REPO="$(cd "$(dirname "$0")/.." && pwd)"
HARVEST="$PLUGIN_REPO/scripts/harvest.js"
STATE_FILE="${CHRONICLE_QUEUE:-$HOME/.chronicle-team/queue}/memory-watcher.state"
INTERVAL="${CHRONICLE_WATCH_INTERVAL:-60}"   # seconds
DIRS=(
  "$HOME/.codex/memories"
  "$HOME/.codex/memories_extensions/chronicle"
)

mkdir -p "$(dirname "$STATE_FILE")"
touch "$STATE_FILE"

# shellcheck disable=SC1090
[[ -f "$HOME/.chronicle-team.env" ]] && source "$HOME/.chronicle-team.env"

if [[ -z "${CHRONICLES_KB_PATH:-}" ]]; then
  echo "memory-watcher: CHRONICLES_KB_PATH not set; aborting" >&2
  exit 1
fi

scan_once() {
  local now seen new_count=0
  now=$(date +%s)
  for dir in "${DIRS[@]}"; do
    [[ -d "$dir" ]] || continue
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      if ! grep -qF "$f" "$STATE_FILE" 2>/dev/null; then
        echo "$f" >> "$STATE_FILE"
        echo "memory-watcher: new memory $f"
        node "$HARVEST" "$f" 2>&1 | sed 's/^/  /'
        ((new_count++))
      fi
    done < <(find "$dir" -type f -name '*.md' 2>/dev/null)
  done
  return 0
}

if [[ "${1:-}" == "--once" ]]; then
  scan_once
  exit 0
fi

echo "memory-watcher: polling ${DIRS[*]} every ${INTERVAL}s"
echo "memory-watcher: KB=$CHRONICLES_KB_PATH"

while true; do
  scan_once
  sleep "$INTERVAL"
done
