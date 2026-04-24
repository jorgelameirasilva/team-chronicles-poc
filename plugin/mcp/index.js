// Shared chronicle loader + lexical search. Used by server.js and search.js.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import matter from 'gray-matter';
import { minimatch } from 'minimatch';

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','he','in','is',
  'it','its','of','on','that','the','to','was','were','will','with','this',
  'how','what','why','when','where','which','who','do','does','i','you','we'
]);

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

export function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.md') && name !== 'AGENTS.md') out.push(p);
  }
  return out;
}

export function loadChronicles(root) {
  const files = walk(root);
  const docs = [];
  for (const path of files) {
    let raw;
    try { raw = readFileSync(path, 'utf8'); } catch { continue; }
    let parsed;
    try { parsed = matter(raw); } catch { continue; }
    const fm = parsed.data || {};
    if (!fm.id) continue; // skip non-chronicle md (e.g. AGENTS.md, READMEs)
    const rel = relative(root, path);
    const tokens = tokenize(
      [fm.id, (fm.tags || []).join(' '), parsed.content].join(' ')
    );
    docs.push({
      path: rel,
      absPath: path,
      frontmatter: fm,
      body: parsed.content,
      tokens
    });
  }
  return docs;
}

export function filterByScope(docs, { team, repo, cwdPath, privatePaths = ['private/**'] }) {
  return docs.filter(d => {
    const rel = d.path.replace(/\\/g, '/');

    // Private paths never retrieved automatically
    if (privatePaths.some(g => minimatch(rel, g))) return false;

    const scope = d.frontmatter.scope || {};

    // Team scope: empty = all
    if (scope.teams?.length && team && !scope.teams.includes(team)) return false;

    // Repo scope
    if (scope.repos?.length && repo && !scope.repos.includes(repo)) return false;

    // Path scope (cwd-relative glob)
    if (scope.paths?.length && cwdPath) {
      if (!scope.paths.some(g => minimatch(cwdPath, g))) return false;
    }

    return true;
  });
}

export function score(queryTokens, doc) {
  if (!queryTokens.length) return 0;
  const qSet = new Set(queryTokens);
  let hits = 0;
  const docFreq = new Map();
  for (const t of doc.tokens) docFreq.set(t, (docFreq.get(t) || 0) + 1);
  for (const t of qSet) if (docFreq.has(t)) hits += Math.log(1 + docFreq.get(t));

  // Boost: tag match
  const tags = (doc.frontmatter.tags || []).map(s => s.toLowerCase());
  for (const t of qSet) if (tags.includes(t)) hits += 2;

  // Boost: recency
  const updated = doc.frontmatter.updated ? Date.parse(doc.frontmatter.updated) : 0;
  const ageDays = (Date.now() - updated) / 86400000;
  if (ageDays < 30) hits += 0.5;

  return hits;
}

export function search(root, query, { team, repo, cwdPath, limit = 5 } = {}) {
  const docs = loadChronicles(root);
  const scoped = filterByScope(docs, { team, repo, cwdPath });
  const qTokens = tokenize(query);
  const ranked = scoped
    .map(d => ({ doc: d, score: score(qTokens, d) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return ranked;
}

export function format(results) {
  if (!results.length) return '';
  return results.map(r => {
    const fm = r.doc.frontmatter;
    return `<team-chronicle id="${fm.id}" path="${r.doc.path}" score="${r.score.toFixed(2)}">
${r.doc.body.trim()}
</team-chronicle>`;
  }).join('\n\n');
}
