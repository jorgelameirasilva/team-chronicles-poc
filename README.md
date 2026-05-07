# chronicle-team

Codex plugin that teaches Codex how to **create and maintain** a team knowledge base. Two-repo architecture:

| Repo | Role |
|---|---|
| **This one** (chronicle-team plugin) | Tooling — hooks, skills, MCP server, install + bootstrap scripts. Lives in `~/.codex/plugins/chronicle-team`. |
| **Knowledge-base repo** (separate, you create it) | Data — chronicles markdown atoms, indexes, raw sources, activity logs, CI workflows. Path tracked via `CHRONICLES_KB_PATH`. |

Plugin is single-install. KB repo is per-team or per-org and bootstrapped from `templates/kb-repo/` in this repo.

## Quick start

```bash
# 0. Codex hooks on
echo -e '[features]\ncodex_hooks = true' >> ~/.codex/config.toml

# 1. Clone plugin repo
git clone https://github.com/jorgelameirasilva/team-chronicles-poc.git
cd team-chronicles-poc

# 2. MCP deps
cd plugin/mcp && npm install && cd ../..

# 3. Install (will prompt for KB path or scaffold a new one)
./scripts/install.sh

# 4. Source env, set team, start codex
echo 'source ~/.chronicle-team.env' >> ~/.zshrc
source ~/.chronicle-team.env
export CHRONICLE_TEAM=platform
codex
```

## What `install.sh` does

1. Resolves the KB repo path:
   - `--kb <path>` flag, OR
   - `CHRONICLES_KB_PATH` env, OR
   - existing entry in `~/.chronicle-team.env`, OR
   - interactive prompt — offers to scaffold a new KB via `bootstrap-kb.sh`
2. Symlinks `~/.codex/plugins/chronicle-team` → this repo's `plugin/`
3. Symlinks `~/.chronicle-team-chronicles` → `<kb-path>/chronicles`
4. Copies `plugin/hooks.json` → `~/.codex/hooks.json` (or backs up + asks for hand-merge)
5. Writes `~/.chronicle-team.env` with `CHRONICLE_PLUGIN`, `CHRONICLES_KB_PATH`, `CHRONICLES_ROOT`, `CHRONICLE_QUEUE`, `CHRONICLE_TEAM`

## Bootstrap a new KB repo

```bash
./scripts/bootstrap-kb.sh ~/dev/team-chronicles --name team-chronicles --gh-create --private
```

Or invoke `/bootstrap-kb` inside Codex — skill walks you through the same flow interactively.

What it produces:
- New git repo at `<target>` initialized from `templates/kb-repo/`
- `npm install` for the tree/lint/validate scripts
- Optional `gh repo create` push
- `CHRONICLES_KB_PATH` updated in `~/.chronicle-team.env`
- `~/.chronicle-team-chronicles` repointed to the new KB

## Plugin pieces

```
plugin/
  plugin.toml           # registers skills + MCP server
  hooks.json            # SessionStart / UserPromptSubmit / Stop
  hooks/                # hook shell scripts
  skills/
    consult-chronicle/  # explicit search
    promote-memory/     # session → draft chronicle
    ingest-source/      # one raw doc → atoms
    import-knowledge/   # bulk via Codex plugins (Rovo/Notion/Drive/Slack/DB)
    lint-chronicles/    # weekly audit pass
    bootstrap-kb/       # scaffold a new KB repo
  mcp/
    server.js           # MCP server: search_chronicles, get_chronicle, propose_chronicle
    index.js            # shared loader + lexical search
    search.js           # CLI one-shot wrapper
```

## KB repo template

Everything that lives **inside** the KB repo ships from `templates/kb-repo/`:

```
templates/kb-repo/
  README.md                       # KB-side README with tree marker
  package.json                    # gray-matter dep for tree/lint scripts
  .gitignore
  chronicles/
    AGENTS.md                     # writing rules for chronicle authors
    CODEOWNERS                    # PR approval gates per scope
    registry.json                 # team / scope metadata
    raw/README.md                 # ingest convention
    shared/index.md               # auto-curated index
    shared/log.md                 # append-only activity log
    teams/.gitkeep
    private/.gitkeep
    projects/.gitkeep
  scripts/
    build-tree.js                 # markdown / mermaid / JSON tree, scoped indexes
    update-readme.js              # splices tree into README between markers
    update-indexes.js             # splices per-scope indexes
    pr-comment.js                 # builds PR comment with new node highlighted
    validate-chronicles.js        # frontmatter + length + supersedes lint
    commit-drafts.sh              # moves queued drafts → branch → PR
  .github/workflows/
    chronicle-pr-tree.yml         # PR comment with knowledge tree
    chronicle-readme.yml          # main push: regenerate README + indexes
    chronicle-validate.yml        # frontmatter + gitleaks gate
```

The KB repo is purely data + CI. The plugin never lives inside it.

## Flow

1. **SessionStart** hook: pulls latest chronicles from KB repo, primes session
2. **UserPromptSubmit** hook: lexical retrieval injects relevant chronicles wrapped in `<team-chronicle>` blocks
3. **Stop** hook: harvester scans transcript, queues candidate chronicles
4. **Ingestion**: `/ingest-source` (single doc) or `/import-knowledge` (bulk, via Codex plugins)
5. **Promotion**: `/promote-memory` mid-session
6. **PR review**: KB repo's `chronicle-pr-tree` workflow comments a knowledge-tree mermaid with each new atom highlighted
7. **Merge**: KB repo's `chronicle-readme` workflow regenerates README + every `index.md`, commits as `chronicle-bot`
8. **Lint**: weekly `/lint-chronicles` audits stale, orphan, contradictory atoms

## Status

POC. Lexical search only. Embedding upgrade tracked on the plugin side. Real `harvest.js` `codex exec` extraction still stubbed.
