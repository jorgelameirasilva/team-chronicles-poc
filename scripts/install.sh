#!/usr/bin/env bash
set -euo pipefail

# Install chronicle-team plugin into ~/.codex/
# Wires hooks.json, symlinks skills, sets env defaults.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PLUGIN_DEST="$CODEX_HOME/plugins/chronicle-team"

mkdir -p "$CODEX_HOME" "$CODEX_HOME/plugins"

# Symlink plugin (live updates during POC)
rm -rf "$PLUGIN_DEST"
ln -s "$REPO_ROOT/plugin" "$PLUGIN_DEST"

# Symlink chronicles root to a stable path
ln -sfn "$REPO_ROOT/chronicles" "$HOME/.chronicle-team-chronicles"

# Merge hooks.json
HOOKS_SRC="$REPO_ROOT/plugin/hooks.json"
HOOKS_DEST="$CODEX_HOME/hooks.json"

if [[ -f "$HOOKS_DEST" ]]; then
  echo "Existing $HOOKS_DEST found. Backing up to $HOOKS_DEST.bak"
  cp "$HOOKS_DEST" "$HOOKS_DEST.bak"
  # naive merge: let user hand-merge if both exist
  echo "Hand-merge $HOOKS_SRC into $HOOKS_DEST"
else
  cp "$HOOKS_SRC" "$HOOKS_DEST"
fi

# Env defaults for hook scripts + MCP server
cat >> "$HOME/.chronicle-team.env" <<EOF
export CHRONICLE_PLUGIN="$PLUGIN_DEST"
export CHRONICLES_ROOT="$HOME/.chronicle-team-chronicles"
export CHRONICLE_QUEUE="$HOME/.chronicle-team/queue"
export CHRONICLE_TEAM="\${CHRONICLE_TEAM:-platform}"
EOF

echo ""
echo "Installed. Add to your shell rc:"
echo "  source ~/.chronicle-team.env"
echo ""
echo "Then install MCP deps:"
echo "  cd $REPO_ROOT/plugin/mcp && npm install"
echo ""
echo "Test MCP search:"
echo "  source ~/.chronicle-team.env"
echo "  TEAM=platform node $REPO_ROOT/plugin/mcp/search.js 'database migration' 3"
