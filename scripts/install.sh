#!/usr/bin/env bash
set -euo pipefail

# Install chronicle-team plugin into ~/.codex/.
# Wires hooks.json, symlinks plugin + chronicles, sets env defaults.
#
# Resolves the knowledge-base repo path (the chronicles content lives in a
# SEPARATE repo from this plugin) in this order:
#   1. --kb <path> arg
#   2. CHRONICLES_KB_PATH env var
#   3. CHRONICLES_KB_PATH in ~/.chronicle-team.env
#   4. Interactive prompt (with offer to scaffold a fresh one)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PLUGIN_DEST="$CODEX_HOME/plugins/chronicle-team"
ENV_FILE="$HOME/.chronicle-team.env"

KB_PATH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --kb) KB_PATH="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# 1. Determine KB path
if [[ -z "$KB_PATH" ]] && [[ -n "${CHRONICLES_KB_PATH:-}" ]]; then
  KB_PATH="$CHRONICLES_KB_PATH"
fi

if [[ -z "$KB_PATH" ]] && [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  KB_PATH="$(grep '^export CHRONICLES_KB_PATH=' "$ENV_FILE" | tail -1 | sed -E 's/^export CHRONICLES_KB_PATH="?([^"]*)"?$/\1/' || true)"
fi

if [[ -z "$KB_PATH" ]]; then
  echo ""
  echo "No knowledge-base repo configured."
  echo ""
  echo "Options:"
  echo "  1. Path to an existing chronicles repo (will be used as the active KB)"
  echo "  2. Leave blank to scaffold a new one via bootstrap-kb.sh"
  echo ""
  read -r -p "KB path [blank to scaffold]: " KB_PATH

  if [[ -z "$KB_PATH" ]]; then
    read -r -p "Scaffold target path (e.g. ~/dev/team-chronicles): " SCAFFOLD_PATH
    SCAFFOLD_PATH="${SCAFFOLD_PATH/#~/$HOME}"
    read -r -p "KB name [$(basename "$SCAFFOLD_PATH")]: " KB_NAME
    KB_NAME="${KB_NAME:-$(basename "$SCAFFOLD_PATH")}"
    read -r -p "Create GitHub repo too? [y/N]: " CREATE_GH
    GH_FLAG=""
    if [[ "$CREATE_GH" =~ ^[Yy]$ ]]; then
      GH_FLAG="--gh-create --private"
    fi
    "$REPO_ROOT/scripts/bootstrap-kb.sh" "$SCAFFOLD_PATH" --name "$KB_NAME" $GH_FLAG
    KB_PATH="$SCAFFOLD_PATH"
  fi
fi

KB_PATH="${KB_PATH/#~/$HOME}"
KB_PATH="$(cd "$KB_PATH" && pwd)"

if [[ ! -d "$KB_PATH/chronicles" ]]; then
  echo "Error: $KB_PATH/chronicles/ not found. Is this really a chronicles KB repo?"
  exit 1
fi

# 2. Install plugin
mkdir -p "$CODEX_HOME" "$CODEX_HOME/plugins"
rm -rf "$PLUGIN_DEST"
ln -s "$REPO_ROOT/plugin" "$PLUGIN_DEST"

# 3. Symlink chronicles (the actual content) to a stable path
ln -sfn "$KB_PATH/chronicles" "$HOME/.chronicle-team-chronicles"

# 4. Hooks
HOOKS_SRC="$REPO_ROOT/plugin/hooks.json"
HOOKS_DEST="$CODEX_HOME/hooks.json"
if [[ -f "$HOOKS_DEST" ]]; then
  echo "Existing $HOOKS_DEST found. Backing up to $HOOKS_DEST.bak"
  cp "$HOOKS_DEST" "$HOOKS_DEST.bak"
  echo "Hand-merge $HOOKS_SRC into $HOOKS_DEST"
else
  cp "$HOOKS_SRC" "$HOOKS_DEST"
fi

# 5. Env file (idempotent rewrite)
cat > "$ENV_FILE" <<EOF
# chronicle-team plugin env. Source from your shell rc:
#   source ~/.chronicle-team.env
export CHRONICLE_PLUGIN="$PLUGIN_DEST"
export CHRONICLES_KB_PATH="$KB_PATH"
export CHRONICLES_ROOT="\$HOME/.chronicle-team-chronicles"
export CHRONICLE_QUEUE="\$HOME/.chronicle-team/queue"
export CHRONICLE_TEAM="\${CHRONICLE_TEAM:-platform}"
EOF

echo ""
echo "✓ Installed."
echo "  Plugin:        $PLUGIN_DEST -> $REPO_ROOT/plugin"
echo "  KB repo:       $KB_PATH"
echo "  Chronicles:    \$HOME/.chronicle-team-chronicles -> $KB_PATH/chronicles"
echo ""
echo "Next:"
echo "  echo 'source ~/.chronicle-team.env' >> ~/.zshrc"
echo "  source ~/.chronicle-team.env"
echo "  cd $REPO_ROOT/plugin/mcp && npm install   # MCP deps"
echo "  TEAM=\$CHRONICLE_TEAM node $REPO_ROOT/plugin/mcp/search.js 'test' 3"
