#!/usr/bin/env bash
set -euo pipefail

# Scaffold a new chronicles knowledge-base repo from templates/kb-repo/.
#
# Usage:
#   ./scripts/bootstrap-kb.sh <target-path> [--name <kb-name>] [--gh-create] [--private|--public]
#
# Example:
#   ./scripts/bootstrap-kb.sh ~/dev/team-chronicles --name team-chronicles --gh-create --private

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$PLUGIN_ROOT/templates/kb-repo"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <target-path> [--name <kb-name>] [--gh-create] [--private|--public]"
  exit 1
fi

TARGET="$1"; shift
KB_NAME=""
GH_CREATE=0
GH_VIS="--private"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) KB_NAME="$2"; shift 2 ;;
    --gh-create) GH_CREATE=1; shift ;;
    --private) GH_VIS="--private"; shift ;;
    --public) GH_VIS="--public"; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

KB_NAME="${KB_NAME:-$(basename "$TARGET")}"

if [[ -e "$TARGET" ]] && [[ -n "$(ls -A "$TARGET" 2>/dev/null)" ]]; then
  echo "Refusing: $TARGET exists and is non-empty."
  exit 1
fi

mkdir -p "$TARGET"
echo "→ Copying scaffold from $TEMPLATE to $TARGET"
cp -R "$TEMPLATE"/. "$TARGET"/

# Substitute {{KB_NAME}} placeholder in README + package.json
sed -i.bak "s|{{KB_NAME}}|$KB_NAME|g" "$TARGET/README.md" && rm "$TARGET/README.md.bak"
sed -i.bak "s|\"name\": \"team-chronicles\"|\"name\": \"$KB_NAME\"|" "$TARGET/package.json" && rm "$TARGET/package.json.bak"

# Init git
cd "$TARGET"
git init -q -b main
git add .
git commit -q -m "chronicles: scaffold $KB_NAME from chronicle-team plugin template"

echo "→ npm install (gray-matter for tree/lint scripts)"
npm install --silent

echo ""
echo "✓ Scaffolded $KB_NAME at $TARGET"

if [[ "$GH_CREATE" -eq 1 ]]; then
  if ! command -v gh >/dev/null; then
    echo "gh CLI not installed; skipping repo creation"
    exit 0
  fi
  echo "→ Creating GitHub repo $KB_NAME ($GH_VIS)"
  gh repo create "$KB_NAME" "$GH_VIS" --source=. --push
  echo "✓ Pushed to GitHub"
fi

# Update env for plugin install.sh / hooks
ENV_FILE="$HOME/.chronicle-team.env"
if [[ -f "$ENV_FILE" ]]; then
  if grep -q "^export CHRONICLES_KB_PATH=" "$ENV_FILE"; then
    sed -i.bak "s|^export CHRONICLES_KB_PATH=.*|export CHRONICLES_KB_PATH=\"$TARGET\"|" "$ENV_FILE" && rm "$ENV_FILE.bak"
  else
    echo "export CHRONICLES_KB_PATH=\"$TARGET\"" >> "$ENV_FILE"
  fi
  echo "→ Updated CHRONICLES_KB_PATH in $ENV_FILE"
fi

# Refresh chronicles symlink for the plugin
if [[ -L "$HOME/.chronicle-team-chronicles" ]] || [[ ! -e "$HOME/.chronicle-team-chronicles" ]]; then
  ln -sfn "$TARGET/chronicles" "$HOME/.chronicle-team-chronicles"
  echo "→ Symlink ~/.chronicle-team-chronicles → $TARGET/chronicles"
fi

echo ""
echo "Next:"
echo "  source ~/.chronicle-team.env"
echo "  cd $TARGET && code ."
echo "  In Codex, the plugin's hooks now read from this KB."
