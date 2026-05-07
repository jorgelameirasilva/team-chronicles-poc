---
name: bootstrap-kb
description: Scaffold a brand-new chronicles knowledge-base repo from the plugin's template. Use when the user is setting up team chronicles for the first time, says "create a new KB repo", "bootstrap chronicles for our team", "set up the knowledge base", or when the plugin is installed but no KB repo is configured yet.
---

# bootstrap-kb

Creates a new git repo from `templates/kb-repo/` in the plugin, optionally pushes it to GitHub, and wires it as the active KB for the chronicle-team plugin.

## When to invoke

- User: "create a new chronicles repo", "scaffold the KB", "set up team chronicles"
- Plugin's `SessionStart` hook runs but `CHRONICLES_KB_PATH` is unset → ask the user if they want to bootstrap one
- Onboarding a new team / org to chronicles

## Pre-flight — ask the user

1. **Target path**: where to create the repo locally (default suggestion: `~/dev/<kb-name>`)
2. **KB name**: repo / package name (default: directory basename, e.g. `team-chronicles`)
3. **GitHub**: create remote repo? (`--gh-create`) — yes/no
4. **Visibility**: `--private` (default) or `--public` if creating remote
5. **Confirm** target path is empty / does not exist

## How

Invoke the bootstrap script:

```bash
$CHRONICLE_PLUGIN/../scripts/bootstrap-kb.sh <target-path> --name <kb-name> [--gh-create] [--private|--public]
```

Script will:
1. Copy `templates/kb-repo/` to target path
2. Substitute `{{KB_NAME}}` in scaffold's README and `package.json`
3. `git init -b main` + initial commit
4. `npm install` (gray-matter for tree/lint scripts)
5. If `--gh-create`: `gh repo create <name> --private --source=. --push`
6. Append/update `CHRONICLES_KB_PATH` in `~/.chronicle-team.env`
7. Refresh `~/.chronicle-team-chronicles` symlink to `<target>/chronicles`

## After bootstrap

Tell the user:

1. `source ~/.chronicle-team.env` to pick up new env in current shell
2. The new repo is now the active KB — plugin hooks will read/write here
3. Suggest first action: `/import-knowledge` to seed the KB from Confluence/Notion/DB
4. Or `/promote-memory` during a real session to file the first hand-curated atom

## Skip / never

- Never overwrite an existing non-empty target path
- Never push public unless user explicitly asked
- Never run if `CHRONICLES_KB_PATH` already points to a working repo — ask first if user wants to switch
- Never skip the GitHub auth check (`gh auth status`) before `--gh-create`

## Post

Tell user:
- "Scaffolded `<name>` at `<path>`."
- "Active KB is now `<path>`. CHRONICLES_KB_PATH updated in `~/.chronicle-team.env`."
- If pushed: "Remote: `https://github.com/<user>/<name>`"
- "Next: `/import-knowledge` to seed it, or `/promote-memory` mid-session to file the first atom."
