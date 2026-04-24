#!/usr/bin/env node
// One-shot CLI: node search.js "<query>" [limit]
// Reads CHRONICLES_ROOT, TEAM, REPO, CWD from env. Prints formatted context to stdout.

import { search, format } from './index.js';

const [, , query, limitStr] = process.argv;
if (!query) {
  console.error('usage: search.js "<query>" [limit]');
  process.exit(1);
}

const root = process.env.CHRONICLES_ROOT;
if (!root) {
  console.error('CHRONICLES_ROOT not set');
  process.exit(1);
}

const results = search(root, query, {
  team: process.env.TEAM,
  repo: process.env.REPO,
  cwdPath: process.env.CWD_PATH,
  limit: Number(limitStr) || 3
});

const out = format(results);
if (out) process.stdout.write(out);
