#!/usr/bin/env bash
set -euo pipefail

# Move queued drafts into chronicles/ tree, open PR.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUEUE="$HOME/.chronicle-team/queue/drafts"
CHRONICLES="$REPO_ROOT/chronicles"

if [[ ! -d "$QUEUE" ]] || [[ -z "$(ls -A "$QUEUE" 2>/dev/null)" ]]; then
  echo "No drafts queued."
  exit 0
fi

cd "$REPO_ROOT"
BRANCH="chronicle/draft-$(date +%s)"
git checkout -b "$BRANCH"

for f in "$QUEUE"/*.md; do
  [[ -f "$f" ]] || continue
  # Extract team from frontmatter
  TEAM=$(grep -m1 '^team:' "$f" | awk '{print $2}')
  TYPE=$(grep -m1 '^type:' "$f" | awk '{print $2}')
  SLUG=$(basename "$f" .md | sed 's/^[0-9]*-//')

  case "$TYPE" in
    decision) DIR="$CHRONICLES/teams/$TEAM/decisions" ;;
    pattern)  DIR="$CHRONICLES/shared/patterns" ;;
    runbook)  DIR="$CHRONICLES/teams/$TEAM/runbooks" ;;
    *)        DIR="$CHRONICLES/teams/$TEAM" ;;
  esac

  mkdir -p "$DIR"
  mv "$f" "$DIR/$SLUG.md"
  git add "$DIR/$SLUG.md"
  echo "staged $DIR/$SLUG.md"
done

git commit -m "chronicles: draft batch $(date +%F)"
echo ""
echo "Branch $BRANCH committed. Push + open PR:"
echo "  git push -u origin $BRANCH && gh pr create --fill"
