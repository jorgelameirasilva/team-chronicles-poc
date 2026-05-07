#!/usr/bin/env node
// Confluence space → chronicles/raw/confluence-YYYY-MM-DD/<page-slug>.md
//
// Env: CONFLUENCE_BASE_URL, CONFLUENCE_TOKEN (Atlassian API token), CONFLUENCE_SPACE
// Args: --since YYYY-MM-DD   filter modified-after
//       --limit N             cap pages (default 500)
//       --label <label>       only pages with this label
//       --skip-labels a,b,c   skip pages with any of these labels (default: private,draft,pii)
//       --dry-run             print what would be fetched, no writes
//
// Output: raw/confluence-<date>/<id>-<slug>.md  (frontmatter only, no chronicle id)
//         raw/confluence-<date>/_index.json     (manifest)

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const BASE = process.env.CONFLUENCE_BASE_URL;
const TOKEN = process.env.CONFLUENCE_TOKEN;
const SPACE = process.env.CONFLUENCE_SPACE;

if (!BASE || !TOKEN || !SPACE) {
  console.error('Missing env: CONFLUENCE_BASE_URL, CONFLUENCE_TOKEN, CONFLUENCE_SPACE');
  process.exit(2);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const SINCE = arg('--since', null);
const LIMIT = Number(arg('--limit', 500));
const LABEL = arg('--label', null);
const SKIP_LABELS = new Set(String(arg('--skip-labels', 'private,draft,pii')).split(','));
const DRY = process.argv.includes('--dry-run');

const today = new Date().toISOString().slice(0, 10);
const outDir = join(REPO_ROOT, 'chronicles', 'raw', `confluence-${today}`);
if (!DRY) mkdirSync(outDir, { recursive: true });

const auth = 'Basic ' + Buffer.from(`api:${TOKEN}`).toString('base64');

async function fetchPages() {
  const pages = [];
  let start = 0;
  const pageSize = 50;
  const cql = [
    `space = "${SPACE}"`,
    `type = page`,
    SINCE ? `lastmodified >= "${SINCE}"` : null,
    LABEL ? `label = "${LABEL}"` : null
  ].filter(Boolean).join(' AND ');

  while (pages.length < LIMIT) {
    const url = `${BASE}/rest/api/content/search?cql=${encodeURIComponent(cql)}&expand=body.storage,version,metadata.labels&start=${start}&limit=${pageSize}`;
    const res = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
    if (!res.ok) {
      console.error(`HTTP ${res.status} ${res.statusText} on ${url}`);
      process.exit(1);
    }
    const data = await res.json();
    const batch = data.results || [];
    if (!batch.length) break;
    pages.push(...batch);
    if (batch.length < pageSize) break;
    start += pageSize;
  }
  return pages.slice(0, LIMIT);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// Minimal storage-XHTML → markdown. Real impl should use turndown.
// Strips tags, preserves headings + lists + paragraphs.
function htmlToMd(html) {
  if (!html) return '';
  return html
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n${'#'.repeat(Number(n))} ${stripTags(t).trim()}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `- ${stripTags(t).trim()}\n`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `\n${stripTags(t).trim()}\n`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:ul|ol|div|span|strong|em|code|pre)[^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function stripTags(s) { return String(s).replace(/<[^>]+>/g, ''); }

const manifest = [];
const pages = await fetchPages();
console.error(`fetched ${pages.length} page(s) from space ${SPACE}`);

for (const p of pages) {
  const labels = (p.metadata?.labels?.results || []).map(l => l.name);
  if (labels.some(l => SKIP_LABELS.has(l))) {
    console.error(`skip ${p.id} (labels: ${labels.join(',')})`);
    continue;
  }
  const slug = slugify(p.title);
  const file = `${p.id}-${slug}.md`;
  const sourceUrl = `${BASE}${p._links?.webui || ''}`;
  const body = htmlToMd(p.body?.storage?.value || '');
  const md = `---
source: confluence
source_id: ${p.id}
source_url: ${sourceUrl}
title: ${JSON.stringify(p.title)}
labels: ${JSON.stringify(labels)}
fetched_at: ${new Date().toISOString()}
last_modified: ${p.version?.when || ''}
---

# ${p.title}

> Imported from Confluence. URL: ${sourceUrl}

${body}
`;
  if (DRY) {
    console.error(`would write ${file} (${body.length} chars)`);
  } else {
    writeFileSync(join(outDir, file), md);
  }
  manifest.push({ path: `chronicles/raw/confluence-${today}/${file}`, source_url: sourceUrl, source_id: p.id, title: p.title, labels });
}

if (!DRY) {
  writeFileSync(join(outDir, '_index.json'), JSON.stringify({ source: 'confluence', space: SPACE, fetched_at: new Date().toISOString(), count: manifest.length, items: manifest }, null, 2));
  console.error(`wrote ${manifest.length} files + _index.json to ${outDir}`);
  console.error(`next: invoke \`/ingest-source\` skill to convert raw → atoms`);
}
