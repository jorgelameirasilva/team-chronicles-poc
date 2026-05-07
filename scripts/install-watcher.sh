#!/usr/bin/env bash
set -euo pipefail

# Install memory-watcher as a launchd agent (macOS) or systemd user unit (Linux)
# so it runs on login and restarts on crash.
#
# Usage:
#   ./scripts/install-watcher.sh         # install + start
#   ./scripts/install-watcher.sh --uninstall
#
# After install:
#   tail -f ~/.chronicle-team/queue/memory-watcher.log

PLUGIN_REPO="$(cd "$(dirname "$0")/.." && pwd)"
WATCHER="$PLUGIN_REPO/scripts/memory-watcher.sh"
LOG_DIR="$HOME/.chronicle-team/queue"
mkdir -p "$LOG_DIR"

UNINSTALL=0
[[ "${1:-}" == "--uninstall" ]] && UNINSTALL=1

UNAME="$(uname)"

if [[ "$UNAME" == "Darwin" ]]; then
  PLIST="$HOME/Library/LaunchAgents/com.chronicle-team.memory-watcher.plist"

  if [[ "$UNINSTALL" -eq 1 ]]; then
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "✓ Uninstalled launchd agent"
    exit 0
  fi

  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.chronicle-team.memory-watcher</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$WATCHER</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/memory-watcher.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/memory-watcher.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF

  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "✓ Installed launchd agent: $PLIST"
  echo "  log: $LOG_DIR/memory-watcher.log"

elif [[ "$UNAME" == "Linux" ]]; then
  UNIT="$HOME/.config/systemd/user/chronicle-memory-watcher.service"
  mkdir -p "$(dirname "$UNIT")"

  if [[ "$UNINSTALL" -eq 1 ]]; then
    systemctl --user stop chronicle-memory-watcher.service 2>/dev/null || true
    systemctl --user disable chronicle-memory-watcher.service 2>/dev/null || true
    rm -f "$UNIT"
    systemctl --user daemon-reload
    echo "✓ Uninstalled systemd user unit"
    exit 0
  fi

  cat > "$UNIT" <<EOF
[Unit]
Description=Chronicle memory watcher
After=default.target

[Service]
Type=simple
ExecStart=/bin/bash $WATCHER
Restart=on-failure
RestartSec=10
StandardOutput=file:$LOG_DIR/memory-watcher.log
StandardError=file:$LOG_DIR/memory-watcher.log

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable chronicle-memory-watcher.service
  systemctl --user restart chronicle-memory-watcher.service
  echo "✓ Installed systemd user unit: $UNIT"
  echo "  log: $LOG_DIR/memory-watcher.log"

else
  echo "Unsupported platform: $UNAME. Run watcher manually:"
  echo "  $WATCHER"
  exit 1
fi
