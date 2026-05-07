# chronicle-team

Codex plugin that teaches Codex how to **create and maintain** a team knowledge base. Two-repo architecture:

| Repo | Role |
|---|---|
| **This one** (chronicle-team plugin) | Tooling — hooks, skills, MCP server, install + bootstrap scripts. Lives in `~/.codex/plugins/chronicle-team`. |
| **Knowledge-base repo** (separate, you create it) | Data — chronicles markdown atoms, indexes, raw sources, activity logs, CI workflows. Path tracked via `CHRONICLES_KB_PATH`. |

Plugin is single-install. KB repo is per-team or per-org and bootstrapped from `templates/kb-repo/` in this repo.

## Quick start

One command. Non-interactive. Pass the KB repo (URL or local path) and a team slug. Done.

```bash
git clone https://github.com/jorgelameirasilva/team-chronicles-poc.git
cd team-chronicles-poc

# Pick ONE of the three:

# A. KB already on GitHub — clone + wire
./scripts/setup.sh --kb git@github.com:acme/team-chronicles.git --team platform

# B. KB already on disk — wire only
./scripts/setup.sh --kb ~/dev/team-chronicles --team platform

# C. Brand new KB — scaffold from template + push to GitHub + wire
./scripts/setup.sh --kb ~/dev/team-chronicles --team platform --gh-create

# Open a new shell (or `source ~/.chronicle-team.env`) — done.
codex
```

`setup.sh` does everything: enables `codex_hooks`, clones / scaffolds the KB, symlinks plugin into `~/.codex/plugins/`, copies `hooks.json`, writes `~/.chronicle-team.env`, installs MCP deps, appends `source` line to `~/.zshrc` / `~/.bashrc`, runs an MCP smoke test.

### setup.sh flags

| Flag | Meaning |
|---|---|
| `--kb <url\|path>` | **Required.** Git URL → cloned. Existing local path → used. Missing path → scaffolded from `templates/kb-repo/`. |
| `--team <slug>` | **Required.** Sets `CHRONICLE_TEAM` (e.g. `platform`, `growth`). |
| `--into <path>` | Where to clone a URL (default: `~/dev/<repo-name>`). |
| `--gh-create` | When scaffolding a missing path, also `gh repo create --push`. |
| `--gh-private` / `--gh-public` | Visibility for `--gh-create` (default: private). |
| `--gh-name <name>` | Override repo name on GitHub. |
| `--no-shell-rc` | Skip auto-appending source line to `~/.zshrc` / `~/.bashrc`. |

## What setup.sh does

1. Resolves `--kb`:
   - URL → `git clone` to `~/dev/<repo-name>` (or `--into`); pulls if already cloned
   - Existing path → uses it (must contain `chronicles/`)
   - Missing path → invokes `bootstrap-kb.sh` to scaffold from `templates/kb-repo/`
2. Ensures `[features] codex_hooks = true` in `~/.codex/config.toml`
3. Symlinks `~/.codex/plugins/chronicle-team` → this repo's `plugin/`
4. Symlinks `~/.chronicle-team-chronicles` → `<kb-path>/chronicles`
5. Copies `plugin/hooks.json` → `~/.codex/hooks.json` (backs up any existing)
6. Writes `~/.chronicle-team.env` with `CHRONICLE_PLUGIN`, `CHRONICLES_KB_PATH`, `CHRONICLES_ROOT`, `CHRONICLE_QUEUE`, `CHRONICLE_TEAM`
7. `npm install` in `plugin/mcp/`
8. Appends `source ~/.chronicle-team.env` to `~/.zshrc` and `~/.bashrc` if absent
9. Runs MCP search smoke test, prints PASS / empty

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

## Plugin layout (canonical Codex marketplace format)

Per [`codex-rs/core-plugins/src/marketplace.rs`](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/marketplace.rs): `marketplace.json` lives at `.agents/plugins/marketplace.json` (repo-scoped); plugin `source.path` is resolved relative to **repo root**, not relative to `marketplace.json`.

```
.agents/plugins/marketplace.json    # registers team-chronicles
plugins/team-chronicles/             # ./plugins/<name> resolves here from repo root
  .codex-plugin/plugin.json          # JSON manifest (name, version, paths, interface)
  .mcp.json                          # MCP server config
  hooks.json                         # SessionStart / UserPromptSubmit / Stop
  hooks/                             # hook shell scripts
  skills/
    consult-chronicle/               # explicit search
    promote-memory/                  # session → draft chronicle
    ingest-source/                   # one raw doc → atoms
    import-knowledge/                # bulk via Codex plugins (Rovo/Notion/Drive/Slack/DB)
    lint-chronicles/                 # weekly audit pass
    bootstrap-kb/                    # scaffold a new KB repo
  mcp/
    server.js                        # MCP server: search_chronicles, get_chronicle, propose_chronicle
    index.js                         # shared loader + lexical search
    search.js                        # CLI one-shot wrapper
```

`setup.sh` runs `codex plugin marketplace add <repo-root>` so Codex finds the marketplace.json. The plugin then shows up under `/plugins` for install + enable. User-level `~/.codex/hooks.json` is also written so hooks fire regardless of plugin install state.

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
