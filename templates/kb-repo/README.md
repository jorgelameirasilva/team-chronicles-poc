# {{KB_NAME}}

Team knowledge base. Powered by the [chronicle-team Codex plugin](https://github.com/jorgelameirasilva/team-chronicles-poc).

This repo holds the data — atoms, indexes, raw sources, activity logs. The plugin (separate repo) holds the tooling that teaches Codex how to read, create, and maintain this knowledge base.

## Layout

```
chronicles/
  raw/             # drop sources here; ingest-source skill compiles into atoms
  shared/          # cross-team chronicles + index.md + log.md
  teams/<slug>/    # team-scoped chronicles + index.md + log.md
  private/         # access-controlled (security, compliance)
  projects/        # cross-cutting initiatives
  AGENTS.md        # writing rules for chronicles
  CODEOWNERS       # PR approval gates per scope
  registry.json    # team / scope metadata
.github/workflows/ # CI: validate, regenerate README tree, comment on PRs
scripts/           # tree, validate, pr-comment, update-readme/indexes
```

## Bootstrap

Plugin walks you through this. If doing it manually:

```bash
# Install deps used by CI scripts
npm install

# Wire as the active KB for the chronicle-team plugin
export CHRONICLES_KB_PATH="$PWD"
# Or: add to ~/.chronicle-team.env (created by plugin's install.sh)

# Push to GitHub
gh repo create {{KB_NAME}} --private --source=. --push
```

## Skills (provided by the plugin)

- `consult-chronicle` — explicit search when auto-retrieval missed
- `promote-memory` — convert session knowledge → draft chronicle
- `ingest-source` — compile a single raw doc → draft chronicle atoms
- `import-knowledge` — bulk import via existing Codex plugins (Rovo, Notion, Drive, Slack, DB)
- `lint-chronicles` — audit stale / orphan / contradictory entries
- `bootstrap-kb` — scaffold a new KB repo (used once)

## Frontmatter

```yaml
---
id: chr_01HXYZ
type: decision|pattern|runbook|reference|fact|feedback|user|project
team: platform
scope: { teams: [], repos: [], paths: [] }   # empty = all
tags: [auth, migrations]
related: [chr_01HXYZ0002]                    # backlinks (optional)
supersedes: chr_01HXYZ0001                   # when replacing (optional)
confidence: high|medium|low
source: session|commit|doc|human|raw
created: 2026-04-24
updated: 2026-04-24
expires: 2026-10-24                          # optional
---
```

## PR experience

Every PR touching `chronicles/**` triggers `chronicle-pr-tree`: bot posts a knowledge-tree mermaid diagram with each new atom highlighted and clickable. Push to `main` triggers `chronicle-readme`: regenerates the tree below + every `index.md`, commits as `chronicle-bot`.

## Knowledge tree

<!-- chronicle-tree:start -->
_(empty — no chronicles yet)_
<!-- chronicle-tree:end -->

## Status

POC. Lexical search on the plugin side. CI tree visualization + auto-README live.
