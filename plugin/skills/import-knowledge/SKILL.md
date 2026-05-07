---
name: import-knowledge
description: Bulk-import external knowledge sources into the chronicles knowledge base by delegating entirely to existing Codex plugins (Rovo for Atlassian, native connectors for Notion / Drive / Slack, the database plugin for schema introspection). No tokens, no env vars — Codex already holds the org auth. Use when seeding a fresh KB ("import our Confluence space", "map the prod database", "ingest the engineering wiki") or when adding a brand-new system to the team that needs full coverage.
---

# import-knowledge

Bootstrap path. Pulls bulk content into `chronicles/raw/<source>-<YYYY-MM-DD>/`, then chains into `ingest-source` to convert raw → atoms → draft PR.

Opposite of `promote-memory` (one atom from a session) and `ingest-source` (one already-local document). Use when seeding or re-seeding the KB at scale.

## Core principle

**Never call external APIs directly.** Every supported source already has a Codex plugin / connector / MCP that owns auth + audit + rate-limit. This skill is glue: ask the right plugin, write results to `raw/`, chain into ingestion.

## Sources + delegate

| Source | Delegate to | Ask for | Output dir |
|---|---|---|---|
| Confluence | `@rovo` (Atlassian Rovo plugin) | space + filters → pages w/ id, title, url, labels, body, last-modified | `raw/confluence-<date>/` |
| Jira | `@rovo` | project + JQL → issues w/ key, summary, description, status, comments | `raw/jira-<date>/` |
| Notion | Notion plugin | workspace / db id → pages w/ properties + body | `raw/notion-<date>/` |
| Google Drive | Drive plugin | folder id → docs w/ title + body | `raw/gdrive-<date>/` |
| Slack | Slack plugin | channel + date range → messages w/ thread structure | `raw/slack-<channel>-<date>/` |
| Database | DB plugin / MCP (already configured in Codex) | database name + schema → tables w/ columns, indexes, FKs, comments | `raw/database-<dbname>-<date>/` |

## When to invoke

- User: "import our Confluence space `<X>`"
- User: "map the `<dbname>` database as chronicles"
- User: "bootstrap KB from wiki / Notion / Drive"
- A team is onboarding chronicles for the first time
- A new system / service joins the company and needs coverage

## Flow (any source)

1. **Ask the user only what's missing** — name of space / project / db / channel + target team. **Never** ask for tokens, hosts, URLs, or credentials.
2. **Confirm scope**: filters (labels / JQL / modified-since), skip rules (`private`, `draft`, `pii`, `wip` by default), team scope for resulting atoms.
3. **Delegate to plugin**: invoke the Codex plugin for the source via `@<plugin>` or natural-language reference. Capture structured response (one record per page / issue / table).
4. **Write to `raw/`**: one markdown file per record. Frontmatter encodes provenance; body is the imported content.

   ```yaml
   ---
   source: confluence | jira | notion | gdrive | slack | database
   source_id: <id>
   source_url: <url>           # if applicable
   title: <title>
   labels: [...]               # if applicable
   fetched_at: <ISO>
   last_modified: <ISO>        # if applicable
   ---

   # <title>

   <body>
   ```

5. **Manifest**: write `_index.json` in the output dir listing every file with `{path, source_id, source_url, title}`.
6. **Pre-flight scrub**:
   - Run gitleaks against the output dir. Abort on hit.
   - Privacy pass: redact emails, internal hostnames, customer names. Flag candidates; user approves before continuing.
7. **Chain to `ingest-source`**: invoke for each file under the new `raw/` dir. Cross-link atoms from the same source via `related:`.
8. **Append `log.md`**: `## [YYYY-MM-DD HH:MM] import | <source>:<scope> → N atoms (raw/<source>-<date>/)`.
9. **Open PR**: branch `chronicle/import-<source>-<date>`. PR description includes the delegate plugin used, query/filters, manifest summary, and atom counts per type.

## Database-specific notes

- Codex DB plugin is already configured — just ask the user "which database?" by name.
- For each table, capture: columns (name, type, nullable, default, comment), indexes, foreign keys, table comment.
- Generated atoms become `type: reference`, tagged with schema + table.
- One atom per table by default. Combine into a single atom only when the table is trivial and tightly coupled to a parent.

## Skip / never

- Never ask for tokens, API keys, connection strings, or hostnames — that's the plugin's job
- Never call external APIs directly when a Codex plugin exists — bypasses org auth + audit
- Never auto-merge import PR — CODEOWNERS gate enforced
- Never delete raw/ files post-import — atoms cite them by path
- Never import customer data (PII) without explicit user opt-in per source
- gitleaks gate is not optional

## Post

Tell user:
- "Imported N raw records from `<source>` into `raw/<source>-<date>/` via `<plugin>`."
- "Generated M draft atoms across types: decision=X, pattern=Y, reference=Z."
- "PR opened: `<url>`. Tree-diff comment will appear on the PR when CI completes."
