---
name: promote-memory
description: Convert a durable fact, decision, or pattern from current session into a draft team chronicle PR. Use when user says "remember this for the team", "add to our knowledge base", or when you detect a non-obvious team-level learning.
---

# promote-memory

Turn session knowledge into a reviewed team chronicle.

## When to invoke

- User: "save this for the team", "make this a chronicle", "add to KB"
- You identified a durable, non-obvious finding that applies beyond current session
- A correction from the user that should not repeat ("we never do X because Y")

## Pre-flight

1. Scrub secrets/PII. Reject if any token, key, email, or internal hostname remains.
2. Pick team (default: `CHRONICLE_TEAM` env).
3. Pick type: `decision` | `pattern` | `runbook` | `reference` | `fact` | `feedback`.
4. Tag with relevant keywords.

## How

Call `chronicle.propose_chronicle` MCP tool with `{team, type, title, body, tags}`. Body must:

- Lead with the rule/fact
- Include `**Why:**` line (reason/incident)
- Include `**How to apply:**` line (when/where it kicks in)

## Post

Tell user: "Queued draft at `<file>`. Run `./scripts/commit-drafts.sh` to open PR."
