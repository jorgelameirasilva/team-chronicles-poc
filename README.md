# team-chronicles-poc

Shared team knowledge base for Codex. Git-backed markdown + MCP retrieval + hooks for auto-sync, auto-consult, auto-promote.

## Layout

```
chronicles/        # source of truth, one dir per team, shared/ cross-team
plugin/            # chronicle-team Codex plugin (hooks + skills + MCP)
scripts/           # install + harvest + utility
```

## Quick start

```bash
# 1. install Node deps for MCP server
cd plugin/mcp && npm install && cd ../..

# 2. wire hooks + MCP into ~/.codex/
./scripts/install.sh

# 3. set team (retrieval scope)
export CHRONICLE_TEAM=platform

# 4. start codex in any repo
codex
```

## Flow

1. `SessionStart` hook: pulls latest chronicles, primes session
2. `UserPromptSubmit` hook: semantic/lexical retrieval injects relevant chronicles
3. `Stop` hook: harvester scans transcript, opens PR with candidate chronicles
4. `/consult-chronicle` / `/promote-memory` skills for manual control

## Frontmatter

```yaml
---
id: chr_01HXYZ
type: decision|pattern|runbook|reference|fact
team: platform
scope: { teams: [], repos: [], paths: [] }  # empty = all
tags: [auth, migrations]
confidence: high
created: 2026-04-24
expires: 2026-10-24
---
```

## Status

POC. Lexical search only. Embedding upgrade tracked in `scripts/reindex.js` stub.
