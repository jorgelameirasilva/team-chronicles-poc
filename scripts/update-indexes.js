#!/usr/bin/env node
// Splice rendered indexes into every chronicles/<scope>/index.md
// Markers: <!-- chronicle-index:start --> ... <!-- chronicle-index:end -->

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CHRONICLES = join(REPO_ROOT, 'chronicles');
const BUILD = join(__dirname, 'build-tree.js');
const START = '<!-- chronicle-index:start -->';
const END = '<!-- chronicle-index:end -->';

function listScopes() {
  const scopes = [];
  if (existsSync(join(CHRONICLES, 'shared/index.md'))) scopes.push('shared');
  const teamsDir = join(CHRONICLES, 'teams');
  if (existsSync(teamsDir)) {
    for (const t of readdirSync(teamsDir)) {
      if (statSync(join(teamsDir, t)).isDirectory() && existsSync(join(teamsDir, t, 'index.md'))) {
        scopes.push(`teams/${t}`);
      }
    }
  }
  return scopes;
}

let changed = 0;
for (const scope of listScopes()) {
  const indexFile = join(CHRONICLES, scope, 'index.md');
  const original = readFileSync(indexFile, 'utf8');
  if (!original.includes(START) || !original.includes(END)) {
    console.error(`SKIP ${scope}: missing markers`);
    continue;
  }
  const rendered = execFileSync('node', [BUILD, '--index', scope], { encoding: 'utf8' }).trim();
  const before = original.split(START)[0];
  const after = original.split(END)[1];
  const next = `${before}${START}\n${rendered}\n${END}${after}`;
  if (next !== original) {
    writeFileSync(indexFile, next);
    console.log(`UPDATED ${scope}/index.md`);
    changed++;
  }
}
console.log(`${changed} index file(s) changed.`);
