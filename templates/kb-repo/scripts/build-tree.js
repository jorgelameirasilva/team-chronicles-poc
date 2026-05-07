#!/usr/bin/env node
// Build chronicle visualizations.
//
// Outputs:
//   --readme               README tree section (mindmap + graph + tree) → stdout
//   --mermaid              Single mermaid graph → stdout
//   --mindmap              Mermaid mindmap (Obsidian-radial) → stdout
//   --json                 Tree JSON → stdout
//   --html <path>          Interactive d3 force-directed viewer → file
//   --index <scope>        Rendered scope/index.md content → stdout
//
// Optional:
//   --highlight <id|path>  Highlight a node (PR diff use)
//   --root <path>          Override CHRONICLES_ROOT

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
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

const TYPE_ICON = {
  decision: '📋', pattern: '🔁', runbook: '📕', reference: '🔗',
  fact: '📌', feedback: '💬', incident: '🚨', service: '⚙️',
  person: '👤', user: '👤', project: '🎯'
};
const TYPE_COLOR = {
  decision: '#fef3c7', pattern: '#dbeafe', runbook: '#fee2e2',
  reference: '#e0e7ff', fact: '#f3f4f6', feedback: '#fce7f3',
  incident: '#fecaca', service: '#d1fae5', person: '#fef3c7',
  user: '#fef3c7', project: '#e0e7ff'
};

function walk(dir) {
  const out = [];
  let entries; try { entries = readdirSync(dir); } catch { return out; }
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

function extractTitle(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
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
      expires: d.fm.expires,
      related: d.fm.related || []
    });
  }
  return root;
}

function toJSON(node) {
  return {
    name: node.name,
    chronicles: node.chronicles,
    children: [...node.children.values()].map(toJSON)
  };
}

function flatChronicles(node, list = []) {
  for (const c of node.chronicles) list.push(c);
  for (const child of node.children.values()) flatChronicles(child, list);
  return list;
}

function safeId(s) { return s.replace(/[^a-zA-Z0-9_]/g, '_'); }

// --- Renderer: Markdown tree -----------------------------------------------

function renderMarkdownTree(node, depth = 0) {
  const lines = [];
  const indent = '  '.repeat(depth);
  if (depth > 0) lines.push(`${indent}- 📁 **${node.name}/**`);
  for (const c of node.chronicles) {
    const icon = TYPE_ICON[c.type] || '📄';
    const tagStr = c.tags.length ? ` <sub>${c.tags.map(t => `\`${t}\``).join(' ')}</sub>` : '';
    lines.push(`${indent}  - ${icon} [${c.title}](chronicles/${c.file}) <code>${c.id}</code>${tagStr}`);
  }
  for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(...renderMarkdownTree(child, depth + 1));
  }
  return lines;
}

// --- Renderer: Mermaid graph TD (radiating tree) ---------------------------

function renderMermaid(root, highlight) {
  const lines = [
    '```mermaid',
    'graph TD',
    '  classDef hi fill:#fde68a,stroke:#b45309,stroke-width:3px,color:#000;',
    '  classDef root fill:#1e293b,stroke:#0f172a,color:#fff,font-weight:bold;',
    '  classDef dir fill:#f1f5f9,stroke:#94a3b8,color:#0f172a;'
  ];
  for (const [type, color] of Object.entries(TYPE_COLOR)) {
    lines.push(`  classDef t_${type} fill:${color},stroke:#475569,color:#0f172a;`);
  }
  const edges = [];
  const nodes = new Set();
  const highlights = new Set();

  function visit(node, parentId, depth) {
    const isRoot = depth === 0;
    const nid = safeId(`d_${node.name}_${parentId || 'root'}`);
    if (!nodes.has(nid)) {
      const label = isRoot ? `🧠 ${node.name}` : `📁 ${node.name}`;
      lines.push(`  ${nid}["${label}"]:::${isRoot ? 'root' : 'dir'}`);
      nodes.add(nid);
    }
    if (parentId) edges.push(`  ${parentId} --> ${nid}`);
    for (const c of node.chronicles) {
      const cid = safeId(c.id || `f_${c.file}`);
      if (!nodes.has(cid)) {
        const icon = TYPE_ICON[c.type] || '📄';
        const label = c.title.replace(/"/g, "'").slice(0, 50);
        const cls = TYPE_COLOR[c.type] ? `t_${c.type}` : 'dir';
        lines.push(`  ${cid}["${icon} ${label}"]:::${cls}`);
        lines.push(`  click ${cid} "chronicles/${c.file}" "Open chronicle"`);
        nodes.add(cid);
      }
      edges.push(`  ${nid} --> ${cid}`);
      if (highlight && (c.id === highlight || c.file === highlight || c.file.endsWith(highlight))) {
        highlights.add(cid);
      }
    }
    for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      visit(child, nid, depth + 1);
    }
  }

  visit(root, null, 0);
  lines.push(...edges);
  for (const h of highlights) lines.push(`  class ${h} hi`);
  lines.push('```');
  return lines.join('\n');
}

// --- Renderer: Mermaid mindmap (Obsidian-radial) ---------------------------

function renderMindmap(root) {
  const lines = ['```mermaid', 'mindmap', '  root((🧠 Chronicles))'];

  function visit(node, depth) {
    const indent = '  '.repeat(depth + 1);
    for (const c of node.chronicles) {
      const icon = TYPE_ICON[c.type] || '📄';
      const label = c.title.replace(/[()[\]{}"']/g, '').slice(0, 40);
      lines.push(`${indent}${icon} ${label}`);
    }
    for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`${indent}📁 ${child.name}`);
      visit(child, depth + 1);
    }
  }

  visit(root, 0);
  lines.push('```');
  return lines.join('\n');
}

// --- Renderer: per-scope index.md content ----------------------------------

function renderIndex(scope, docs) {
  const scopeRoot = scope === 'shared' || scope.startsWith('teams/') ? scope : null;
  if (!scopeRoot) throw new Error(`Unknown scope: ${scope}`);

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
    const list = byType.get(t);
    if (!list?.length) continue;
    const heading = t.charAt(0).toUpperCase() + t.slice(1) + 's';
    const icon = TYPE_ICON[t] || '📄';
    lines.push(`## ${icon} ${heading}`);
    for (const d of list.sort((a, b) => (a.fm.updated || '').localeCompare(b.fm.updated || ''))) {
      const title = extractTitle(d.body) || basename(d.rel, '.md');
      const relFromScope = d.rel.slice(scopeRoot.length + 1);
      const tags = (d.fm.tags || []).map(x => `\`${x}\``).join(' ');
      lines.push(`- [${title}](${relFromScope}) <code>${d.fm.id}</code>${tags ? ` — ${tags}` : ''}`);
    }
    lines.push('');
  }
  if (!lines.length) lines.push('_(empty)_');
  return lines.join('\n').trim();
}

// --- Renderer: Interactive d3 force-directed HTML --------------------------

function renderHTML(tree, allDocs) {
  const flat = flatChronicles(tree);
  const idToNode = new Map();
  const nodes = flat.map((c, idx) => {
    const n = {
      id: c.id,
      label: c.title,
      type: c.type || 'other',
      team: c.team || '',
      tags: c.tags,
      file: c.file,
      group: c.type || 'other'
    };
    idToNode.set(c.id, n);
    return n;
  });
  const links = [];
  for (const c of flat) {
    for (const rel of c.related || []) {
      if (idToNode.has(rel)) links.push({ source: c.id, target: rel });
    }
  }

  const data = JSON.stringify({ nodes, links });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Chronicles knowledge graph</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
  #header { padding: 12px 20px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
  #header h1 { margin: 0; font-size: 16px; font-weight: 600; }
  #header .stats { font-size: 12px; color: #94a3b8; }
  #search { padding: 6px 10px; background: #1e293b; border: 1px solid #334155; color: #e2e8f0; border-radius: 4px; font-size: 12px; width: 200px; }
  #graph { width: 100vw; height: calc(100vh - 50px); }
  .node circle { cursor: pointer; stroke: #475569; stroke-width: 1.5px; }
  .node text { font-size: 11px; fill: #cbd5e1; pointer-events: none; user-select: none; }
  .node.faded { opacity: 0.15; }
  .node.match circle { stroke: #fbbf24; stroke-width: 3px; }
  .link { stroke: #475569; stroke-opacity: 0.5; }
  .link.faded { stroke-opacity: 0.05; }
  #legend { position: absolute; top: 60px; right: 20px; background: rgba(15,23,42,0.9); padding: 10px 14px; border: 1px solid #334155; border-radius: 4px; font-size: 11px; }
  #legend .item { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
  #legend .swatch { width: 10px; height: 10px; border-radius: 50%; }
  #tooltip { position: absolute; background: #1e293b; border: 1px solid #475569; padding: 8px 12px; border-radius: 4px; font-size: 12px; pointer-events: none; opacity: 0; transition: opacity 0.15s; max-width: 280px; }
  #tooltip .title { font-weight: 600; margin-bottom: 4px; }
  #tooltip .meta { color: #94a3b8; font-size: 11px; }
  #tooltip .tags { margin-top: 4px; }
  #tooltip .tag { display: inline-block; background: #334155; padding: 1px 6px; border-radius: 2px; margin-right: 4px; font-size: 10px; }
</style>
</head>
<body>
<div id="header">
  <div>
    <h1>🧠 Chronicles knowledge graph</h1>
    <div class="stats">${nodes.length} atoms · ${links.length} links · drag to rearrange · click to open</div>
  </div>
  <input id="search" type="search" placeholder="Filter by title, id, tag…" />
</div>
<svg id="graph"></svg>
<div id="tooltip"></div>
<div id="legend"></div>
<script>
const DATA = ${data};
const TYPE_COLOR = ${JSON.stringify(TYPE_COLOR)};
const TYPE_ICON = ${JSON.stringify(TYPE_ICON)};

const svg = d3.select('#graph');
const tooltip = d3.select('#tooltip');
const legend = d3.select('#legend');

// Legend
const types = [...new Set(DATA.nodes.map(n => n.type))].sort();
legend.selectAll('div.item').data(types).enter().append('div').attr('class', 'item').html(t => \`
  <div class="swatch" style="background:\${TYPE_COLOR[t] || '#64748b'}"></div>
  <span>\${TYPE_ICON[t] || '📄'} \${t}</span>
\`);

let width = window.innerWidth;
let height = window.innerHeight - 50;
svg.attr('viewBox', \`0 0 \${width} \${height}\`);

const sim = d3.forceSimulation(DATA.nodes)
  .force('link', d3.forceLink(DATA.links).id(d => d.id).distance(80))
  .force('charge', d3.forceManyBody().strength(-200))
  .force('center', d3.forceCenter(width/2, height/2))
  .force('collide', d3.forceCollide(20));

const g = svg.append('g');

const link = g.append('g').selectAll('line')
  .data(DATA.links).enter().append('line').attr('class', 'link');

const node = g.append('g').selectAll('g')
  .data(DATA.nodes).enter().append('g').attr('class', 'node');

node.append('circle')
  .attr('r', 8)
  .attr('fill', d => TYPE_COLOR[d.type] || '#64748b');

node.append('text')
  .attr('dx', 12)
  .attr('dy', 4)
  .text(d => d.label.length > 32 ? d.label.slice(0, 30) + '…' : d.label);

node.on('mouseover', (e, d) => {
  tooltip.style('opacity', 1)
    .style('left', (e.pageX + 12) + 'px')
    .style('top', (e.pageY + 12) + 'px')
    .html(\`
      <div class="title">\${TYPE_ICON[d.type] || '📄'} \${d.label}</div>
      <div class="meta">\${d.id} · \${d.type}\${d.team ? ' · ' + d.team : ''}</div>
      \${d.tags.length ? '<div class="tags">' + d.tags.map(t => \`<span class="tag">\${t}</span>\`).join('') + '</div>' : ''}
    \`);
})
.on('mouseout', () => tooltip.style('opacity', 0))
.on('click', (e, d) => { window.location.href = 'chronicles/' + d.file; })
.call(d3.drag()
  .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
  .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
  .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

sim.on('tick', () => {
  link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
  node.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
});

svg.call(d3.zoom().on('zoom', e => g.attr('transform', e.transform)));

document.getElementById('search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  if (!q) {
    node.classed('faded', false).classed('match', false);
    link.classed('faded', false);
    return;
  }
  const matchSet = new Set();
  DATA.nodes.forEach(n => {
    if (n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q))) matchSet.add(n.id);
  });
  node.classed('match', d => matchSet.has(d.id))
      .classed('faded', d => !matchSet.has(d.id));
  link.classed('faded', d => !matchSet.has(d.source.id) && !matchSet.has(d.target.id));
});

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight - 50;
  svg.attr('viewBox', \`0 0 \${width} \${height}\`);
  sim.force('center', d3.forceCenter(width/2, height/2)).alpha(0.3).restart();
});
</script>
</body>
</html>`;
}

// --- Dispatch --------------------------------------------------------------

const docs = loadAll(ROOT);
const tree = buildTree(docs);
const flat = flatChronicles(tree);

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(toJSON(tree), null, 2) + '\n');
} else if (process.argv.includes('--mindmap')) {
  process.stdout.write(renderMindmap(tree) + '\n');
} else if (process.argv.includes('--mermaid')) {
  process.stdout.write(renderMermaid(tree, HIGHLIGHT) + '\n');
} else if (process.argv.includes('--readme')) {
  if (!flat.length) {
    process.stdout.write('### 🧠 Knowledge tree\n\n_(empty — no chronicles yet. Run `/import-knowledge` or `/promote-memory` to seed.)_\n');
  } else {
    const md = renderMarkdownTree(tree).join('\n');
    const mermaid = renderMermaid(tree, null);
    const mindmap = renderMindmap(tree);
    const stats = `**${flat.length} atom${flat.length === 1 ? '' : 's'}** across **${countDirs(tree) - 1} location${countDirs(tree) - 1 === 1 ? '' : 's'}**`;
    process.stdout.write(`### 🧠 Knowledge tree

${stats}. [Open the interactive graph →](docs/index.html) (requires GitHub Pages enabled on this repo).

${mindmap}

<details>
<summary>📁 Tree view</summary>

${md}

</details>

<details>
<summary>🔗 Hierarchy graph</summary>

${mermaid}

</details>
`);
  }
} else if (process.argv.includes('--html')) {
  const out = arg('--html');
  if (typeof out !== 'string') {
    console.error('--html requires an output path');
    process.exit(1);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderHTML(tree, docs));
  console.error(`wrote ${out} (${flat.length} nodes)`);
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
  build-tree.js --mindmap
  build-tree.js --json
  build-tree.js --html <path>          # interactive d3 viewer
  build-tree.js --index <scope>        # scope: shared | teams/<slug>`);
  process.exit(1);
}

function countDirs(node) {
  let n = 1;
  for (const child of node.children.values()) n += countDirs(child);
  return n;
}
