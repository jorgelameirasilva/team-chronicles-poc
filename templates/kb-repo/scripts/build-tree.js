#!/usr/bin/env node
// Build chronicle tree visualizations.
//
// Outputs:
//   --readme           Print README tree section (between markers) to stdout
//   --mermaid          Print mermaid graph to stdout
//   --json             Print tree JSON to stdout
//   --index <scope>    Print rendered <scope>/index.md content to stdout
//                      scope = "shared" | "teams/<slug>"
//
// Optional:
//   --highlight <id|path>   Highlight a node in the mermaid output (PR diff use)
//   --root <path>           Override CHRONICLES_ROOT
//
// Examples:
//   node scripts/build-tree.js --readme
//   node scripts/build-tree.js --mermaid --highlight chr_01HXYZ0002
//   node scripts/build-tree.js --index shared
//   node scripts/build-tree.js --json | jq

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const ROOT = arg('--root', join(REPO_ROOT, 'chronicles'));
const HIGHLIGHT = arg('--highlight', null);

function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

function loadAll(root) {
  const docs = [];
  for (const path of walk(root)) {
    let raw; try { raw = readFileSync(path, 'utf8'); } catch { continue; }
    let parsed; try { parsed = matter(raw); } catch { continue; }
    const fm = parsed.data || {};
    const rel = relative(root, path);
    docs.push({ rel, path, fm, body: parsed.content, isChronicle: !!fm.id });
  }
  return docs;
}

function buildTree(docs) {
  const root = { name: 'chronicles', children: new Map(), chronicles: [] };
  for (const d of docs) {
    if (!d.isChronicle) continue;
    const parts = d.rel.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.children.has(seg)) {
        node.children.set(seg, { name: seg, children: new Map(), chronicles: [] });
      }
      node = node.children.get(seg);
    }
    node.chronicles.push({
      id: d.fm.id,
      title: extractTitle(d.body) || basename(d.rel, '.md'),
      type: d.fm.type,
      team: d.fm.team,
      tags: d.fm.tags || [],
      file: d.rel,
      updated: d.fm.updated,
      expires: d.fm.expires
    });
  }
  return root;
}

function extractTitle(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function toJSON(node) {
  return {
    name: node.name,
    chronicles: node.chronicles,
    children: [...node.children.values()].map(toJSON)
  };
}

function renderMarkdownTree(node, depth = 0) {
  const lines = [];
  const indent = '  '.repeat(depth);
  if (depth > 0) lines.push(`${indent}- **${node.name}/**`);
  for (const c of node.chronicles) {
    lines.push(`${indent}  - [${c.title}](chronicles/${c.file}) — \`${c.id}\` — ${c.type}${c.tags.length ? ` — ${c.tags.join(', ')}` : ''}`);
  }
  for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(...renderMarkdownTree(child, depth + 1));
  }
  return lines;
}

function safeId(s) {
  return s.replace(/[^a-zA-Z0-9_]/g, '_');
}

function renderMermaid(root, highlight) {
  const lines = ['```mermaid', 'graph LR', '  classDef hi fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#000;', '  classDef chr fill:#e0f2fe,stroke:#0369a1,color:#000;', '  classDef dir fill:#f3f4f6,stroke:#6b7280,color:#000;'];
  const edges = [];
  const nodes = new Set();
  const highlights = new Set();

  function visit(node, parentId) {
    const nid = safeId(`d_${node.name}_${parentId || 'root'}`);
    if (!nodes.has(nid)) {
      lines.push(`  ${nid}["📁 ${node.name}"]:::dir`);
      nodes.add(nid);
    }
    if (parentId) edges.push(`  ${parentId} --> ${nid}`);
    for (const c of node.chronicles) {
      const cid = safeId(c.id || `f_${c.file}`);
      if (!nodes.has(cid)) {
        const label = c.title.replace(/"/g, "'").slice(0, 60);
        lines.push(`  ${cid}["📄 ${label}<br/><small>${c.id}</small>"]:::chr`);
        lines.push(`  click ${cid} "chronicles/${c.file}" "Open chronicle"`);
        nodes.add(cid);
      }
      edges.push(`  ${nid} --> ${cid}`);
      if (highlight && (c.id === highlight || c.file === highlight || c.file.endsWith(highlight))) {
        highlights.add(cid);
      }
    }
    for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      visit(child, nid);
    }
  }

  visit(root, null);
  lines.push(...edges);
  for (const h of highlights) lines.push(`  class ${h} hi`);
  lines.push('```');
  return lines.join('\n');
}

function renderIndex(scope, docs) {
  let scopeRoot;
  if (scope === 'shared') scopeRoot = 'shared';
  else if (scope.startsWith('teams/')) scopeRoot = scope;
  else throw new Error(`Unknown scope: ${scope}`);

  const inScope = docs.filter(d => d.isChronicle && d.rel.startsWith(scopeRoot + '/'));
  const byType = new Map();
  for (const d of inScope) {
    const t = d.fm.type || 'other';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(d);
  }

  const order = ['decision', 'pattern', 'runbook', 'reference', 'fact', 'feedback', 'incident', 'service', 'person', 'other'];
  const lines = [];
  for (const t of order) {
    const docs = byType.get(t);
    if (!docs?.length) continue;
    const heading = t.charAt(0).toUpperCase() + t.slice(1) + 's';
    lines.push(`## ${heading}`);
    for (const d of docs.sort((a, b) => (a.fm.updated || '').localeCompare(b.fm.updated || ''))) {
      const title = extractTitle(d.body) || basename(d.rel, '.md');
      const relFromScope = d.rel.slice(scopeRoot.length + 1);
      const tags = (d.fm.tags || []).join(', ');
      lines.push(`- [${title}](${relFromScope}) — \`${d.fm.id}\`${tags ? ` — ${tags}` : ''}`);
    }
    lines.push('');
  }
  if (!lines.length) lines.push('_(empty)_');
  return lines.join('\n').trim();
}

const docs = loadAll(ROOT);
const tree = buildTree(docs);

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(toJSON(tree), null, 2) + '\n');
} else if (process.argv.includes('--mermaid')) {
  process.stdout.write(renderMermaid(tree, HIGHLIGHT) + '\n');
} else if (process.argv.includes('--readme')) {
  const md = renderMarkdownTree(tree).join('\n');
  const mermaid = renderMermaid(tree, null);
  process.stdout.write(`### Knowledge tree\n\n${mermaid}\n\n<details>\n<summary>Markdown view</summary>\n\n${md}\n\n</details>\n`);
} else if (process.argv.includes('--index')) {
  const scope = arg('--index');
  if (typeof scope !== 'string') {
    console.error('--index requires a scope: shared | teams/<slug>');
    process.exit(1);
  }
  process.stdout.write(renderIndex(scope, docs) + '\n');
} else {
  console.error(`Usage:
  build-tree.js --readme
  build-tree.js --mermaid [--highlight <id|file>]
  build-tree.js --json
  build-tree.js --index <scope>      # scope: shared | teams/<slug>`);
  process.exit(1);
}
