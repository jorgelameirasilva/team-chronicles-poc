#!/usr/bin/env node
// Stub harvester. Real impl: spawn sandboxed Codex agent with prompt to extract chronicles.
// POC version: log and append transcript metadata to a log file.

import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [, , payloadPath] = process.argv;
if (!payloadPath) process.exit(0);

let payload;
try {
  payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
} catch {
  process.exit(0);
}

const logDir = join(process.env.HOME, '.chronicle-team', 'queue');
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, 'harvest.log');

const stamp = new Date().toISOString();
appendFileSync(logFile, `[${stamp}] queued ${payloadPath} (${Object.keys(payload).length} keys)\n`);

// TODO: invoke `codex exec` with extraction prompt, capture output, write drafts,
// call `gh pr create` for each candidate. Gated behind CHRONICLE_HARVEST=1.
