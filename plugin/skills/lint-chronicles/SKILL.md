---
name: lint-chronicles
description: Audit chronicles for staleness, orphans, contradictions, broken supersedes chains, missing tags, expired entries. Use on a cron (weekly), when user says "lint chronicles", "audit the KB", "find stale memories", or before a major release.
---

# lint-chronicles

Periodic maintenance pass over `chronicles/`. Opens a single PR with batched fixes.

## When to invoke

- Weekly cron via `codex exec`
- User: "lint chronicles", "audit KB", "find stale entries", "show orphans"
- Before regenerating the README tree manually

## Checks

1. **Expired**: `expires:` in frontmatter is past `today`. Flag for archive or refresh.
2. **Orphans**: chronicle has no inbound `related:` reference and no inbound `[[chr_id]]` from any `index.md` or other chronicle body.
3. **Broken supersedes**: `supersedes: chr_X` where `chr_X` does not exist or itself supersedes the current one (cycle).
4. **Missing required frontmatter**: `id`, `type`, `team`, `scope`, `tags`, `confidence`, `created`, `updated`.
5. **Length**: > 200 lines → split candidate.
6. **Contradiction**: two chronicles with overlapping tags + opposite assertions on the same subject (heuristic — flag for human review, never auto-resolve).
7. **Tag drift**: same concept tagged inconsistently (`db-migration` vs `db-migrations` vs `database-migrations`).
8. **Index drift**: index.md does not match actual files present.

## How

1. Walk `chronicles/`, parse all frontmatter via `plugin/mcp/index.js#loadChronicles`.
2. Run each check above, accumulate findings into a structured report.
3. Auto-fix the safe class only:
   - Re-render every `index.md` via `node scripts/build-tree.js --index <scope>`
   - Re-render README tree via `node scripts/build-tree.js --readme`
4. Open one PR: branch `chronicle/lint-YYYY-MM-DD`, body = findings table, commits = auto-fixes.
5. Append `log.md` entry per scope: `## [YYYY-MM-DD HH:MM] lint | findings: N | auto-fix: M`.

## Never

- Auto-delete chronicles. Always move to `archive/` instead.
- Auto-resolve contradictions. Flag and stop.
- Rewrite chronicle bodies. Index/tree are the only auto-edited files.
