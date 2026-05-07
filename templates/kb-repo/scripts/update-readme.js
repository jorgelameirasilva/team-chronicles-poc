#!/usr/bin/env node
// Splice the chronicle tree into README.md between markers.
// Markers: <!-- chronicle-tree:start --> ... <!-- chronicle-tree:end -->

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const README = join(__dirname, '..', 'README.md');
const START = '<!-- chronicle-tree:start -->';
const END = '<!-- chronicle-tree:end -->';

const tree = execFileSync('node', [join(__dirname, 'build-tree.js'), '--readme'], { encoding: 'utf8' });
const original = readFileSync(README, 'utf8');

if (!original.includes(START) || !original.includes(END)) {
  console.error(`README missing markers ${START} / ${END}. Add them first.`);
  process.exit(1);
}

const before = original.split(START)[0];
const after = original.split(END)[1];
const next = `${before}${START}\n${tree}\n${END}${after}`;

if (next === original) {
  console.log('README tree unchanged.');
  process.exit(0);
}

writeFileSync(README, next);
console.log('README tree updated.');
