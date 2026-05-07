#!/usr/bin/env node
// Validate every chronicle file: required frontmatter, length, scope shape, id format.
// Exit non-zero on any failure. Used by .github/workflows/chronicle-validate.yml

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const ROOT = join(REPO_ROOT, 'chronicles');

const REQUIRED = ['id', 'type', 'team', 'scope', 'tags', 'confidence', 'created', 'updated'];
const TYPES = new Set(['decision', 'pattern', 'runbook', 'reference', 'fact', 'feedback', 'user', 'project', 'incident', 'service', 'person']);
const CONFIDENCE = new Set(['high', 'medium', 'low']);
const ID_RE = /^chr_[a-zA-Z0-9_]+$/;
const SKIP = new Set(['index.md', 'log.md', 'AGENTS.md', 'README.md', 'CODEOWNERS']);

function walk(dir) {
  const out = [];
  let entries; try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.md') && !SKIP.has(name)) out.push(p);
  }
  return out;
}

const errors = [];
const ids = new Map();

for (const path of walk(ROOT)) {
  const rel = path.slice(REPO_ROOT.length + 1);
  let raw; try { raw = readFileSync(path, 'utf8'); } catch { continue; }
  let parsed; try { parsed = matter(raw); } catch (e) { errors.push(`${rel}: frontmatter parse failed`); continue; }
  const fm = parsed.data || {};

  if (!fm.id) {
    errors.push(`${rel}: missing 'id' frontmatter (non-chronicle markdown should not live under chronicles/ outside special files)`);
    continue;
  }

  for (const k of REQUIRED) {
    if (fm[k] === undefined || fm[k] === null) errors.push(`${rel}: missing required frontmatter '${k}'`);
  }

  if (!ID_RE.test(fm.id)) errors.push(`${rel}: id '${fm.id}' does not match ${ID_RE}`);
  if (ids.has(fm.id)) errors.push(`${rel}: duplicate id '${fm.id}' (also in ${ids.get(fm.id)})`);
  else ids.set(fm.id, rel);

  if (fm.type && !TYPES.has(fm.type)) errors.push(`${rel}: unknown type '${fm.type}'`);
  if (fm.confidence && !CONFIDENCE.has(fm.confidence)) errors.push(`${rel}: invalid confidence '${fm.confidence}'`);

  const scope = fm.scope || {};
  for (const k of ['teams', 'repos', 'paths']) {
    if (scope[k] !== undefined && !Array.isArray(scope[k])) errors.push(`${rel}: scope.${k} must be an array`);
  }

  const lineCount = parsed.content.split('\n').length;
  if (lineCount > 200) errors.push(`${rel}: body is ${lineCount} lines (max 200; split atom)`);

  if (!parsed.content.match(/^#\s+.+/m)) errors.push(`${rel}: missing H1 title`);
}

// Validate supersedes references resolve
for (const path of walk(ROOT)) {
  const rel = path.slice(REPO_ROOT.length + 1);
  let raw; try { raw = readFileSync(path, 'utf8'); } catch { continue; }
  let parsed; try { parsed = matter(raw); } catch { continue; }
  const fm = parsed.data || {};
  if (fm.supersedes && !ids.has(fm.supersedes)) {
    errors.push(`${rel}: supersedes '${fm.supersedes}' does not exist`);
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} validation error(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`✓ ${ids.size} chronicles validated.`);
