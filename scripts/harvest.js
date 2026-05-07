#!/usr/bin/env node
// Real chronicle harvester. Replaces the stub.
//
// Inputs (one of):
//   - A Stop-hook transcript JSON queued by hooks/stop.sh
//   - A PreCompact-hook transcript JSON
//   - A markdown memory file from ~/.codex/memories/ (file watcher path)
//
// Pipeline:
//   1. Read input → build extraction prompt for codex exec
//   2. Run `codex exec --json --sandbox read-only` to extract durable atoms
//   3. For each atom, write a draft chronicle to $CHRONICLE_QUEUE/drafts/
//   4. If drafts exist + KB repo has a remote, branch + commit + push + open PR
//
// Idempotent. Safe to call concurrently — each invocation gets its own
// timestamped working dir.
//
// Env required:
//   CHRONICLES_KB_PATH   path to KB repo on disk (e.g. ~/dev/team-chronicles)
//   CHRONICLE_TEAM       team slug
// Optional:
//   CHRONICLE_QUEUE      drafts dir (default ~/.chronicle-team/queue)
//   CHRONICLE_AUTO_PR    "1" to auto-open PR (default: only commit + push branch)

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

const [, , inputPath] = process.argv;
if (!inputPath) {
  console.error('Usage: harvest.js <queue-item-path>');
  process.exit(1);
}

const KB = process.env.CHRONICLES_KB_PATH;
const TEAM = process.env.CHRONICLE_TEAM || 'default';
const QUEUE_ROOT = process.env.CHRONICLE_QUEUE || join(homedir(), '.chronicle-team/queue');
const DRAFTS = join(QUEUE_ROOT, 'drafts');
const AUTO_PR = process.env.CHRONICLE_AUTO_PR === '1';

if (!KB || !existsSync(KB)) {
  console.error(`CHRONICLES_KB_PATH not set or invalid: ${KB}`);
  process.exit(1);
}

mkdirSync(DRAFTS, { recursive: true });

// --- 1. Load input -----------------------------------------------------

let inputContent = '';
let inputKind = 'transcript';
try {
  const raw = readFileSync(inputPath, 'utf8');
  if (inputPath.endsWith('.md')) {
    inputContent = raw;
    inputKind = 'memory';
  } else {
    // Transcript JSON — flatten relevant turns
    let parsed; try { parsed = JSON.parse(raw); } catch { parsed = null; }
    if (parsed && Array.isArray(parsed.turns)) {
      inputContent = parsed.turns
        .filter(t => t.role === 'user' || t.role === 'assistant')
        .map(t => `## ${t.role}\n\n${t.content || ''}`)
        .join('\n\n');
    } else if (parsed && parsed.transcript) {
      inputContent = String(parsed.transcript);
    } else {
      inputContent = raw.slice(0, 50000);
    }
  }
} catch (err) {
  console.error(`harvest: failed to read ${inputPath}: ${err.message}`);
  process.exit(1);
}

if (inputContent.trim().length < 200) {
  console.error('harvest: input too short, nothing to extract');
  process.exit(0);
}

// --- 2. Run codex exec for atom extraction ----------------------------

const PROMPT = `You are a chronicle extractor for the team "${TEAM}".

Read the conversation/memory below. Identify durable, non-obvious team-level findings worth saving as chronicle atoms. SKIP ephemeral debugging, one-off bug fixes, personal preferences, and anything containing secrets.

For each atom, classify it as one of: decision, pattern, runbook, reference, fact, feedback.

Output ONLY a JSON array on a single line. No prose, no code fences. Each entry:

{
  "type": "decision" | "pattern" | "runbook" | "reference" | "fact" | "feedback",
  "title": "imperative or noun phrase, <70 chars",
  "tags": ["short", "kebab-case", "tags"],
  "body": "Lead with the rule/fact. Then **Why:** line. Then **How to apply:** line. Markdown ok. Max 30 lines.",
  "confidence": "high" | "medium" | "low"
}

If nothing durable is present, output exactly: []

Be conservative. 0-3 atoms typical. Never invent details. Reject anything containing API keys, tokens, customer names, internal hostnames, or PII.

=== Input (${inputKind}) ===

${inputContent.slice(0, 80000)}

=== End ===

Output the JSON array now:`;

const tmpOut = join(QUEUE_ROOT, `extract-${Date.now()}-${randomBytes(3).toString('hex')}.txt`);

let codexAvailable = true;
try { execFileSync('codex', ['--version'], { stdio: 'pipe' }); }
catch { codexAvailable = false; }

if (!codexAvailable) {
  console.error('harvest: codex CLI not in PATH; skipping extraction');
  process.exit(0);
}

const result = spawnSync('codex', [
  'exec',
  '--sandbox', 'read-only',
  '--ephemeral',
  '-o', tmpOut,
  '-'
], { input: PROMPT, encoding: 'utf8', timeout: 5 * 60 * 1000 });

if (result.status !== 0) {
  console.error(`harvest: codex exec failed (status=${result.status})`);
  if (result.stderr) console.error(result.stderr.slice(0, 500));
  process.exit(0);
}

let raw = '';
try { raw = readFileSync(tmpOut, 'utf8'); } catch { raw = result.stdout || ''; }

// Strip code fences if Codex wrapped output
raw = raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

let atoms = [];
try {
  atoms = JSON.parse(raw);
  if (!Array.isArray(atoms)) throw new Error('not an array');
} catch (err) {
  // Try to find a JSON array inside the response
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    try { atoms = JSON.parse(match[0]); } catch { atoms = []; }
  }
}

if (!atoms.length) {
  console.error('harvest: no atoms extracted');
  process.exit(0);
}

console.error(`harvest: extracted ${atoms.length} atom(s)`);

// --- 3. Write drafts --------------------------------------------------

const today = new Date().toISOString().slice(0, 10);
const writtenDrafts = [];

for (const atom of atoms) {
  if (!atom.title || !atom.type || !atom.body) continue;
  if (containsSecrets(atom.body) || containsSecrets(atom.title)) {
    console.error(`harvest: skipped atom "${atom.title}" — possible secret`);
    continue;
  }
  const id = `chr_draft_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
  const slug = slugify(atom.title);
  const file = join(DRAFTS, `${id}-${slug}.md`);
  const tagsArr = Array.isArray(atom.tags) ? atom.tags : [];
  const fm = `---
id: ${id}
type: ${atom.type}
team: ${TEAM}
scope: { teams: [], repos: [], paths: [] }
tags: ${JSON.stringify(tagsArr)}
confidence: ${atom.confidence || 'medium'}
source: ${inputKind === 'memory' ? 'codex-memory' : 'session'}
created: ${today}
updated: ${today}
---

# ${atom.title}

${atom.body}
`;
  writeFileSync(file, fm);
  writtenDrafts.push(file);
}

console.error(`harvest: wrote ${writtenDrafts.length} draft(s) to ${DRAFTS}`);

if (!writtenDrafts.length) process.exit(0);

// --- 4. Branch + commit + push to KB repo -----------------------------

if (!existsSync(join(KB, '.git'))) {
  console.error(`harvest: ${KB} is not a git repo; drafts left in ${DRAFTS}`);
  process.exit(0);
}

const branch = `chronicle/auto-${today}-${randomBytes(3).toString('hex')}`;

function git(...args) {
  return spawnSync('git', ['-C', KB, ...args], { encoding: 'utf8' });
}

git('fetch', 'origin', '--quiet');
git('checkout', '-q', '-b', branch);

let staged = 0;
for (const draft of writtenDrafts) {
  const head = readFileSync(draft, 'utf8').match(/^---[\s\S]*?\ntype:\s*(\S+)/);
  const type = head ? head[1] : 'fact';
  let dir;
  switch (type) {
    case 'decision': dir = `chronicles/teams/${TEAM}/decisions`; break;
    case 'pattern':  dir = `chronicles/shared/patterns`; break;
    case 'runbook':  dir = `chronicles/teams/${TEAM}/runbooks`; break;
    default:         dir = `chronicles/teams/${TEAM}`;
  }
  const target = join(KB, dir, basename(draft));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(draft, 'utf8'));
  spawnSync('git', ['-C', KB, 'add', target], { encoding: 'utf8' });
  staged++;
}

if (!staged) {
  git('checkout', '-q', '-');
  process.exit(0);
}

git('-c', 'user.email=chronicle-bot@local', '-c', 'user.name=chronicle-bot',
  'commit', '-q', '-m', `chronicles: auto-harvest ${writtenDrafts.length} draft(s) from ${inputKind}`);

const push = git('push', '-u', 'origin', branch);
if (push.status === 0) {
  console.error(`harvest: pushed ${branch} (${staged} drafts)`);
  // Drafts moved into KB, clear the queue copies
  for (const d of writtenDrafts) try { execFileSync('rm', ['-f', d]); } catch {}

  if (AUTO_PR) {
    const ghCheck = spawnSync('gh', ['--version'], { stdio: 'pipe' });
    if (ghCheck.status === 0) {
      const pr = spawnSync('gh', ['pr', 'create', '--fill', '--head', branch], {
        cwd: KB, encoding: 'utf8'
      });
      if (pr.status === 0) console.error(`harvest: opened PR ${pr.stdout.trim()}`);
      else console.error(`harvest: gh pr create failed: ${pr.stderr}`);
    }
  }
} else {
  console.error(`harvest: push failed; branch ${branch} stays local`);
  console.error(push.stderr);
}

git('checkout', '-q', '-');

// --- helpers ----------------------------------------------------------

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

function containsSecrets(s) {
  if (!s) return false;
  const patterns = [
    /\b(?:sk|pk|api)[-_]?(?:live|test|prod)?[-_]?[a-zA-Z0-9]{16,}/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bghp_[A-Za-z0-9]{36}/,
    /\bxox[baprs]-[A-Za-z0-9-]+/,
    /-----BEGIN [A-Z ]+PRIVATE KEY-----/
  ];
  return patterns.some(p => p.test(s));
}
