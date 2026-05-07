---
name: import-knowledge
description: Bulk-import external knowledge sources into the chronicles knowledge base. Currently supports Confluence spaces, database schemas (Postgres/MySQL), Notion, Google Drive, and Slack exports. Use when seeding a fresh KB ("import our Confluence space", "map the prod database", "ingest the engineering wiki", "bootstrap chronicles from existing docs") or when adding a brand-new system to the team that needs full coverage.
---

# import-knowledge

One skill, many adapters. Pulls bulk content from an external system into `chronicles/raw/<source>-<YYYY-MM-DD>/`, then chains into `ingest-source` to convert raw → atoms → draft PR.

This is the **bootstrap** path — opposite of `promote-memory` (one atom from a session) or `ingest-source` (one already-local document). Use when you need to seed or re-seed the KB at scale.

## Sources supported

| Source | Adapter script | Required env |
|---|---|---|
| Confluence | `scripts/import/confluence.js` | `CONFLUENCE_BASE_URL`, `CONFLUENCE_TOKEN`, `CONFLUENCE_SPACE` |
| Database (Postgres/MySQL) | `scripts/import/database.js` | `DATABASE_URL` |
| Notion | `scripts/import/notion.js` (stub) | `NOTION_TOKEN`, `NOTION_DB_ID` |
| Google Drive folder | `scripts/import/gdrive.js` (stub) | `GDRIVE_FOLDER_ID`, OAuth |
| Slack export ZIP | `scripts/import/slack.js` (stub) | local ZIP path |

## When to invoke

- User: "import our Confluence space", "bootstrap KB from wiki", "map the database schema as chronicles", "seed chronicles from `<source>`"
- A team is onboarding chronicles for the first time
- A new system / service joins the company and needs coverage

## How

1. **Pick source + scope** with the user. Confirm:
   - Which space / DB / folder
   - Target team (scopes write paths)
   - Filters: page-label, schema name, modified-since date
2. **Run adapter** — outputs markdown files into `chronicles/raw/<source>-<YYYY-MM-DD>/`. Source files keep their original titles + add a manifest `_index.json` listing `{path, source_url, fetched_at}`.
3. **Pre-flight scrub**:
   - Run gitleaks on the raw output dir. Abort on any hit.
   - Run a privacy pass: redact emails, internal hostnames, customer names. Skill flags candidates; user approves before continue.
4. **Invoke `ingest-source`** in batch mode: for each file under `raw/<source>-<date>/`, extract atoms via MCP `propose_chronicle`. Cross-link atoms within the same source via `related:`.
5. **Append `log.md`** entries:
   `## [YYYY-MM-DD HH:MM] import | <source>:<scope> → N atoms (raw/<source>-<date>/)`
6. **Open PR**: branch `chronicle/import-<source>-<date>`. PR description includes the manifest + summary count per type.

## Confluence adapter

```bash
export CONFLUENCE_BASE_URL=https://acme.atlassian.net/wiki
export CONFLUENCE_TOKEN=<api-token>          # never commit
export CONFLUENCE_SPACE=ENG
node scripts/import/confluence.js --since 2026-01-01 --limit 200
```

Pulls pages via `/rest/api/content`, paginates, converts storage XHTML → markdown via `turndown`. Skips pages with the `private`, `draft`, or `pii` labels.

## Database adapter

```bash
export DATABASE_URL=postgres://readonly@prod-replica/app
node scripts/import/database.js --schema public --output reference
```

Introspects `information_schema` for tables, columns, indexes, FKs, comments. Emits one markdown file per table to `raw/database-<date>/<schema>.<table>.md`. Generated atoms become `type: reference`, tagged with schema name. Read-only credentials only — adapter refuses if user has write privs.

## Skip / never

- Never import secrets — gitleaks gate is not optional
- Never auto-merge import PR — review gate enforced via CODEOWNERS
- Never delete raw/ files post-import — atoms cite them by path
- Never import customer data (PII) without explicit user opt-in per source

## Post

Tell user:
- "Imported N raw files from `<source>` into `raw/<source>-<date>/`."
- "Generated M draft atoms across types: decision=X, pattern=Y, reference=Z."
- "PR opened: `<url>`. Tree-diff comment will appear on the PR when CI completes."
