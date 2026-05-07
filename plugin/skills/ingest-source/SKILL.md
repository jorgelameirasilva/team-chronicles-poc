---
name: ingest-source
description: Compile a raw source (PDF, article, postmortem, RFC, transcript) sitting in `chronicles/raw/` into one or more draft chronicle atoms. Use when the user says "ingest this", "add this doc to the KB", "compile the raw folder", or when running a scheduled ingestion pass over `chronicles/raw/`.
---

# ingest-source

Karpathy LLM Wiki pattern, adapted for team chronicles. Source documents land in `chronicles/raw/`. This skill turns them into reviewed atoms in `chronicles/teams/<team>/` or `chronicles/shared/`.

## When to invoke

- User: "ingest `<file>`", "compile raw/", "build chronicles from this doc"
- A new file appears in `chronicles/raw/` since the last entry in the relevant `log.md`
- After a long session, user says "save the durable findings as chronicles"

## Pre-flight

1. Identify source. If user gave a path, use it. Else list `chronicles/raw/` and pick the newest unprocessed file (cross-check against `log.md` entries).
2. Run gitleaks against the source — abort on any hit.
3. Confirm team scope with the user: default `CHRONICLE_TEAM`, override if the doc clearly belongs elsewhere.

## How

1. Read the raw source end to end.
2. Extract atoms. One atom per durable concept, one file per atom.
   - `decision`: choice + rationale + alternatives considered
   - `pattern`: recurring shape, repeatable how-to
   - `runbook`: ordered steps, oncall-ready
   - `reference`: canonical pointer (dashboard, owner, API)
   - `fact` / `feedback`: durable observation or correction
3. For each atom call MCP `chronicle.propose_chronicle` with `{team, type, title, body, tags}`.
4. Body must:
   - Lead with the rule/fact (one sentence)
   - `**Why:**` line (reason; cite source path under `raw/`)
   - `**How to apply:**` line (when / where it kicks in)
   - Cross-link related atoms with `[[chr_id]]` and frontmatter `related: [chr_id, ...]`
5. Append one entry to the appropriate `log.md`:
   `## [YYYY-MM-DD HH:MM] ingest | raw/<file> → <chr_id_1>, <chr_id_2>`

## Skip

- Do not extract one-off bug fixes, ephemeral states, or personal preferences
- Do not delete the source file — chronicles cite it by path
- Do not exceed 150 lines per atom; split or reduce instead

## Post

Tell user: "Queued N drafts at `<queue>`. Run `./scripts/commit-drafts.sh` to open PR. PR will auto-comment with a tree diagram showing where each atom lands."
