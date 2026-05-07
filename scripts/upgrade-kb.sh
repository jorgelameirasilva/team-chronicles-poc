#!/usr/bin/env bash
set -euo pipefail

# Refresh an existing KB repo with the latest tooling from this plugin's
# templates/kb-repo/. Touches scripts/, .github/workflows/, and (optionally)
# package.json. Never overwrites chronicles/ content.
#
# Usage:
#   ./scripts/upgrade-kb.sh <kb-path> [--commit] [--push]
#
# Without --commit, the script only updates files. With --commit, it stages
# and commits as chronicle-bot. With --push, it also pushes to origin.

PLUGIN_REPO="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$PLUGIN_REPO/templates/kb-repo"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <kb-path> [--commit] [--push]"
  exit 1
fi

KB="${1/#~/$HOME}"; shift
KB="$(cd "$KB" && pwd)"

DO_COMMIT=0
DO_PUSH=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit) DO_COMMIT=1; shift ;;
    --push) DO_PUSH=1; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

[[ -d "$KB/chronicles" ]] || { echo "Error: $KB has no chronicles/ — not a KB repo"; exit 1; }

echo "→ Refreshing tooling at $KB from $TEMPLATE"

# Copy scripts (overwrite — these are tooling, not data)
mkdir -p "$KB/scripts"
cp "$TEMPLATE/scripts/build-tree.js" "$KB/scripts/build-tree.js"
cp "$TEMPLATE/scripts/update-readme.js" "$KB/scripts/update-readme.js"
cp "$TEMPLATE/scripts/update-indexes.js" "$KB/scripts/update-indexes.js"
cp "$TEMPLATE/scripts/pr-comment.js" "$KB/scripts/pr-comment.js"
cp "$TEMPLATE/scripts/validate-chronicles.js" "$KB/scripts/validate-chronicles.js"
cp "$TEMPLATE/scripts/commit-drafts.sh" "$KB/scripts/commit-drafts.sh"
chmod +x "$KB/scripts/"*.sh "$KB/scripts/"*.js 2>/dev/null || true

# Copy workflows (overwrite)
mkdir -p "$KB/.github/workflows"
cp "$TEMPLATE/.github/workflows/"*.yml "$KB/.github/workflows/"

# Update package.json scripts block only if missing keys (don't clobber name)
if [[ -f "$KB/package.json" ]]; then
  node -e "
    const fs=require('fs');
    const tpl=JSON.parse(fs.readFileSync('$TEMPLATE/package.json','utf8'));
    const cur=JSON.parse(fs.readFileSync('$KB/package.json','utf8'));
    cur.scripts={...tpl.scripts,...(cur.scripts||{})};
    cur.dependencies={...tpl.dependencies,...(cur.dependencies||{})};
    fs.writeFileSync('$KB/package.json',JSON.stringify(cur,null,2)+'\n');
  "
else
  cp "$TEMPLATE/package.json" "$KB/package.json"
fi

# Ensure README has the chronicle-tree markers
if [[ -f "$KB/README.md" ]] && ! grep -q '<!-- chronicle-tree:start -->' "$KB/README.md"; then
  echo "" >> "$KB/README.md"
  echo "## Knowledge tree" >> "$KB/README.md"
  echo "" >> "$KB/README.md"
  echo "<!-- chronicle-tree:start -->" >> "$KB/README.md"
  echo "<!-- chronicle-tree:end -->" >> "$KB/README.md"
  echo "→ Added chronicle-tree markers to README.md"
fi

# Install latest deps + regenerate
( cd "$KB" && npm install --silent )
( cd "$KB" && node scripts/update-indexes.js && node scripts/update-readme.js && mkdir -p docs && node scripts/build-tree.js --html docs/index.html )

echo "✓ Tooling refreshed."

if [[ "$DO_COMMIT" -eq 1 ]]; then
  cd "$KB"
  git add scripts .github package.json package-lock.json README.md docs chronicles/**/index.md 2>/dev/null || true
  if git diff --cached --quiet; then
    echo "→ No changes to commit."
  else
    git -c user.email="chronicle-bot@local" -c user.name="chronicle-bot" \
      commit -q -m "chronicles: upgrade tooling from chronicle-team plugin"
    echo "→ Committed."
    if [[ "$DO_PUSH" -eq 1 ]]; then
      git push
      echo "→ Pushed."
    fi
  fi
fi

echo ""
echo "Next:"
echo "  cd $KB"
echo "  open docs/index.html        # interactive viewer locally"
if [[ "$DO_COMMIT" -eq 0 ]]; then
  echo "  git add . && git commit && git push"
fi
echo ""
echo "Enable GitHub Pages on the repo (Settings → Pages → Source: GitHub Actions)"
echo "for the interactive graph to deploy on each push to main."
