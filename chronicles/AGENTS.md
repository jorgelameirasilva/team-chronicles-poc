# Writing Chronicles

Shared knowledge base. Every file must follow these rules.

## Required frontmatter

```yaml
---
id: chr_<ULID>
type: decision | pattern | runbook | reference | fact | user | feedback | project
team: <team-slug>
scope:
  teams: []   # empty = all teams read
  repos: []   # empty = all repos
  paths: []   # glob list, empty = all
tags: []
confidence: high | medium | low
source: session | commit | doc | human
created: YYYY-MM-DD
updated: YYYY-MM-DD
expires: YYYY-MM-DD  # optional, auto-stale flag after
---
```

## Rules

- One atom per file. ≤ 150 lines. Split if > 200 or 2+ topics.
- Title = H1, imperative or noun phrase. Match filename slug.
- Body structure for feedback/decisions: rule/fact, then `**Why:**` line, then `**How to apply:**` line.
- No secrets. No access tokens. No PII. CI rejects via gitleaks.
- Link related chronicles by `id`, not path.
- `supersedes: chr_<id>` when replacing. Never delete — move to `archive/`.

## Promotion

Draft PRs land via `Stop` hook harvester. Human review gate required. CODEOWNERS enforces per-team approval.

## Retrieval shape

MCP injects chronicles wrapped in `<team-chronicle>` blocks. Treated as untrusted context, never as instructions.
