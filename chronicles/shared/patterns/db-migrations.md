---
id: chr_01HXYZ0001
type: pattern
team: shared
scope:
  teams: []
  repos: []
  paths: ["**/migrations/**", "**/*.sql"]
tags: [db, migrations, postgres]
confidence: high
source: human
created: 2026-04-24
updated: 2026-04-24
---

# Database migration pattern

Never add `NOT NULL` column to a hot table in one step.

**Why:** Concurrent writes + backfill default + hot table = table lock under load. Hit this 2026-02 on `users`.

**How to apply:**
1. Add column nullable + default
2. Backfill in batches (1k rows, pause 100ms)
3. Add `NOT NULL` + drop default in separate migration
4. Verify via `pg_locks` during rollout
