#!/usr/bin/env bash
set -euo pipefail

# One-shot, non-interactive setup for the chronicle-team plugin.
#
# Resolves the knowledge-base repo (clones if URL, scaffolds if missing),
# wires hooks + MCP into ~/.codex/, writes ~/.chronicle-team.env, and
# auto-sources it from your shell rc.
#
# Usage:
#   ./scripts/setup.sh --kb <url|path> --team <slug> [options]
#
# Required:
#   --kb <url|path>      Git URL (clones it) OR local path (uses or scaffolds).
#                        URL examples:
#                          https://github.com/org/team-chronicles.git
#                          git@github.com:org/team-chronicles.git
#                        Path examples:
#                          ~/dev/team-chronicles      (existing or new)
#   --team <slug>        Sets CHRONICLE_TEAM in env (e.g. platform, growth)
#
# Optional:
#   --into <path>        Where to clone the URL (default: ~/dev/<repo-name>)
#   --gh-create          When scaffolding a missing path, also create + push
#                        the GitHub remote via `gh` (uses basename as repo name)
#   --gh-private         When --gh-create, make the repo private (default)
#   --gh-public          When --gh-create, make the repo public
#   --gh-name <name>     Override repo name for `gh repo create`
#   --no-shell-rc        Skip auto-appending to ~/.zshrc / ~/.bashrc
#
# Examples:
#
#   # Existing KB on GitHub — clone + wire
#   ./scripts/setup.sh --kb git@github.com:acme/team-chronicles.git --team platform
#
#   # KB already cloned locally — wire only
#   ./scripts/setup.sh --kb ~/dev/team-chronicles --team platform
#
#   # Brand new KB — scaffold + push to GitHub
#   ./scripts/setup.sh --kb ~/dev/team-chronicles --team platform --gh-create

PLUGIN_REPO="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
ENV_FILE="$HOME/.chronicle-team.env"

KB=""
TEAM=""
INTO=""
GH_CREATE=0
GH_VIS="--private"
GH_NAME=""
SKIP_SHELL_RC=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kb) KB="$2"; shift 2 ;;
    --team) TEAM="$2"; shift 2 ;;
    --into) INTO="$2"; shift 2 ;;
    --gh-create) GH_CREATE=1; shift ;;
    --gh-private) GH_VIS="--private"; shift ;;
    --gh-public) GH_VIS="--public"; shift ;;
    --gh-name) GH_NAME="$2"; shift 2 ;;
    --no-shell-rc) SKIP_SHELL_RC=1; shift ;;
    -h|--help) sed -n '3,40p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

[[ -z "$KB" ]] && { echo "Error: --kb required"; exit 1; }
[[ -z "$TEAM" ]] && { echo "Error: --team required"; exit 1; }

is_url() {
  [[ "$1" =~ ^(https://|git@|git://|ssh://) ]] || [[ "$1" == *.git ]]
}

repo_has_commits() {
  git -C "$1" rev-parse HEAD >/dev/null 2>&1
}

# Copy templates/kb-repo/ contents into an existing dir (already a git repo
# OR plain dir). Substitutes placeholders, runs npm install. No git init.
scaffold_into_existing() {
  local target="$1"
  local name="${GH_NAME:-$(basename "$target")}"
  echo "→ Scaffolding chronicle template into $target (name=$name)"
  cp -R "$PLUGIN_REPO/templates/kb-repo/." "$target/"
  if [[ -f "$target/README.md" ]]; then
    sed -i.bak "s|{{KB_NAME}}|$name|g" "$target/README.md" && rm -f "$target/README.md.bak"
  fi
  if [[ -f "$target/package.json" ]]; then
    sed -i.bak "s|\"name\": \"team-chronicles\"|\"name\": \"$name\"|" "$target/package.json" && rm -f "$target/package.json.bak"
  fi
  ( cd "$target" && npm install --silent ) || echo "→ npm install failed; continue"
}

# --- 1. Resolve KB_PATH -----------------------------------------------------

KB_PATH=""

if is_url "$KB"; then
  REPO_NAME="$(basename "$KB" .git)"
  KB_PATH="${INTO:-$HOME/dev/$REPO_NAME}"
  KB_PATH="${KB_PATH/#~/$HOME}"

  if [[ -d "$KB_PATH/.git" ]]; then
    if repo_has_commits "$KB_PATH"; then
      echo "→ Pulling existing clone at $KB_PATH"
      git -C "$KB_PATH" pull --ff-only || echo "→ Pull failed (likely diverged); continue with local"
    else
      echo "→ Existing empty clone at $KB_PATH; will scaffold into it"
    fi
  else
    mkdir -p "$(dirname "$KB_PATH")"
    echo "→ Cloning $KB → $KB_PATH"
    git clone "$KB" "$KB_PATH"
  fi

  # If cloned an empty repo, force HEAD onto main so the first commit lands there
  if ! repo_has_commits "$KB_PATH"; then
    git -C "$KB_PATH" symbolic-ref HEAD refs/heads/main
  fi
else
  KB_PATH="${KB/#~/$HOME}"
  if [[ ! -d "$KB_PATH" ]]; then
    echo "→ Path $KB_PATH does not exist; bootstrapping fresh repo from template"
    SCAFFOLD_ARGS=("$KB_PATH")
    SCAFFOLD_ARGS+=(--name "${GH_NAME:-$(basename "$KB_PATH")}")
    if [[ "$GH_CREATE" -eq 1 ]]; then
      SCAFFOLD_ARGS+=(--gh-create "$GH_VIS")
    fi
    "$PLUGIN_REPO/scripts/bootstrap-kb.sh" "${SCAFFOLD_ARGS[@]}"
  fi
fi

KB_PATH="$(cd "$KB_PATH" && pwd)"

# --- 1b. Auto-scaffold into existing repo if no chronicles/ -----------------

if [[ ! -d "$KB_PATH/chronicles" ]]; then
  scaffold_into_existing "$KB_PATH"

  if [[ -d "$KB_PATH/.git" ]]; then
    git -C "$KB_PATH" add .
    if ! git -C "$KB_PATH" diff --cached --quiet; then
      git -C "$KB_PATH" -c user.email="chronicle-bot@local" -c user.name="chronicle-bot" \
        commit -q -m "chronicles: scaffold from chronicle-team plugin template"
      echo "→ Committed scaffold to $(basename "$KB_PATH")"
    fi
    if git -C "$KB_PATH" remote get-url origin >/dev/null 2>&1; then
      if git -C "$KB_PATH" push -u origin HEAD 2>/dev/null; then
        echo "→ Pushed scaffold to origin"
      else
        echo "→ Push failed; do it manually: git -C $KB_PATH push -u origin HEAD"
      fi
    fi
  fi
fi

[[ -d "$KB_PATH/chronicles" ]] || { echo "Error: scaffold failed; $KB_PATH still has no chronicles/"; exit 1; }

# --- 2. Plugin paths (canonical Codex marketplace layout) -------------------

# This repo IS a marketplace root. Plugin lives at
#   $PLUGIN_REPO/.agents/plugins/plugins/team-chronicles/
# Marketplace manifest at
#   $PLUGIN_REPO/.agents/plugins/marketplace.json
PLUGIN_DIR="$PLUGIN_REPO/plugins/team-chronicles"
[[ -f "$PLUGIN_DIR/.codex-plugin/plugin.json" ]] || { echo "Error: $PLUGIN_DIR/.codex-plugin/plugin.json missing — wrong plugin repo?"; exit 1; }

# --- 3. Chronicles symlink (used by hooks + MCP at runtime) -----------------

ln -sfn "$KB_PATH/chronicles" "$HOME/.chronicle-team-chronicles"
echo "→ Linked chronicles: $HOME/.chronicle-team-chronicles → $KB_PATH/chronicles"

# --- 4. User-level hooks.json fallback --------------------------------------
# Keep hooks at the user level so they fire even before / regardless of the
# plugin install state. Plugin-bundled hooks fire too once installed.

mkdir -p "$CODEX_HOME"
HOOKS_SRC="$PLUGIN_DIR/hooks.json"
HOOKS_DEST="$CODEX_HOME/hooks.json"
if [[ -f "$HOOKS_DEST" ]] && ! cmp -s "$HOOKS_SRC" "$HOOKS_DEST"; then
  cp "$HOOKS_DEST" "$HOOKS_DEST.bak.$(date +%s)"
  echo "→ Existing $HOOKS_DEST backed up; will overwrite."
fi
cp "$HOOKS_SRC" "$HOOKS_DEST"
echo "→ Wrote user hooks: $HOOKS_DEST"

# --- 5. Env file (idempotent rewrite) ---------------------------------------

cat > "$ENV_FILE" <<EOF
# chronicle-team plugin env. Auto-generated by setup.sh.
export CHRONICLE_PLUGIN="$PLUGIN_DIR"
export CHRONICLES_KB_PATH="$KB_PATH"
export CHRONICLES_ROOT="\$HOME/.chronicle-team-chronicles"
export CHRONICLE_QUEUE="\$HOME/.chronicle-team/queue"
export CHRONICLE_TEAM="$TEAM"
EOF
echo "→ Wrote $ENV_FILE"

# --- 6. MCP deps ------------------------------------------------------------

echo "→ Installing MCP server deps"
( cd "$PLUGIN_DIR/mcp" && npm install --silent )

# --- 7. Register plugin marketplace ----------------------------------------

if command -v codex >/dev/null 2>&1; then
  echo "→ Registering plugin marketplace with codex"
  if codex plugin marketplace add "$PLUGIN_REPO" 2>/dev/null; then
    echo "✓ Marketplace registered"
  else
    echo "→ codex plugin marketplace add failed or already present; verify with: codex plugin marketplace list"
  fi
else
  echo "→ codex CLI not found in PATH; after installing it run:"
  echo "    codex plugin marketplace add $PLUGIN_REPO"
fi

# --- 7b. Install memory-watcher daemon -------------------------------------
# Watches ~/.codex/memories and ~/.codex/memories_extensions/chronicle for new
# auto-generated memories from Codex. Runs harvest.js on each new file → atom
# drafts → branch + push to KB. Auto-PR if CHRONICLE_AUTO_PR=1.

if "$PLUGIN_REPO/scripts/install-watcher.sh" 2>&1 | sed 's/^/  /'; then
  echo "✓ Memory watcher installed"
else
  echo "→ Memory watcher install failed; run manually: ./scripts/install-watcher.sh"
fi

# --- 8. Auto-source from shell rc ------------------------------------------

if [[ "$SKIP_SHELL_RC" -eq 0 ]]; then
  for RC in ~/.zshrc ~/.bashrc; do
    [[ -f "$RC" ]] || continue
    if ! grep -q 'source ~/.chronicle-team.env' "$RC" 2>/dev/null; then
      printf '\n# chronicle-team plugin env\nsource ~/.chronicle-team.env\n' >> "$RC"
      echo "→ Appended source line to $RC"
    fi
  done
fi

# --- 9. Smoke test ----------------------------------------------------------

# shellcheck disable=SC1090
source "$ENV_FILE"
SMOKE="$(TEAM="$TEAM" CHRONICLES_ROOT="$CHRONICLES_ROOT" node "$PLUGIN_DIR/mcp/search.js" "test" 1 2>/dev/null || true)"

echo ""
echo "✓ Setup complete."
echo "  Plugin source: $PLUGIN_DIR"
echo "  KB repo:       $KB_PATH"
echo "  Team:          $TEAM"
echo "  Env file:      $ENV_FILE"
echo ""
if [[ -n "$SMOKE" ]]; then
  echo "  MCP search smoke test: PASS (returned a chronicle)"
else
  echo "  MCP search smoke test: empty (KB has no chronicles yet — expected for a fresh scaffold)"
fi
echo ""
echo "Next steps:"
echo "  1. Open a new shell (or \`source ~/.chronicle-team.env\`)"
echo "  2. Run \`codex\` from any directory"
echo "  3. Inside Codex: \`/plugins\` → install + enable \"team-chronicles\""
echo "  4. User-level hooks already fire from ~/.codex/hooks.json regardless"
