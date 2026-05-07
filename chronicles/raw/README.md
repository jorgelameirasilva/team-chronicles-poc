# raw/

Drop sources here. PDFs, articles, postmortems, RFCs, Slack exports, transcripts.

The `ingest-source` skill (or a cron `codex exec`) reads anything new in this directory, extracts atoms, opens a draft chronicle PR, and appends an entry to the appropriate `log.md`. Source files stay in place — chronicles cite them by relative path.

## Naming

`YYYY-MM-DD-<slug>.<ext>`

Example: `2026-05-07-rfc-auth-rotation.pdf`, `2026-05-07-incident-pagerduty.md`.

## What gets extracted

- `decision` atoms when a doc records a choice + rationale
- `pattern` atoms for recurring shapes / how-to
- `runbook` atoms for ordered remediation steps
- `reference` atoms for canonical pointers (dashboards, APIs, owners)
- `fact` / `feedback` for durable observations or corrections

## What does NOT get extracted

- One-off bug fixes (lives in commit history)
- Personal preferences (those go to Codex Memories, not team chronicles)
- Anything containing secrets — gitleaks rejects on PR
