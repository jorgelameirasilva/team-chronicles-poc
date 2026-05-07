#!/usr/bin/env node
// Database schema → chronicles/raw/database-YYYY-MM-DD/<schema>.<table>.md
//
// Env: DATABASE_URL    postgres:// or mysql:// (read-only credentials required)
// Args: --schema <name>      restrict to one schema (default: public for pg, db name for mysql)
//       --tables a,b,c       restrict to listed tables
//       --skip-tables a,b    skip listed tables (default: schema_migrations, ar_internal_metadata)
//       --dry-run            print what would be fetched, no writes
//
// Output: raw/database-<date>/<schema>.<table>.md  (frontmatter only, no chronicle id)
//         raw/database-<date>/_index.json
//
// Currently supports Postgres via the `pg` package (lazy-required so the script can be
// installed without the dep until first use). MySQL path is a TODO stub.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('DATABASE_URL not set'); process.exit(2); }

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const SCHEMA = arg('--schema', 'public');
const ONLY = String(arg('--tables', '')).split(',').filter(Boolean);
const SKIP = new Set(String(arg('--skip-tables', 'schema_migrations,ar_internal_metadata')).split(','));
const DRY = process.argv.includes('--dry-run');

if (!URL.startsWith('postgres://') && !URL.startsWith('postgresql://')) {
  console.error('Only postgres URLs supported in this stub. MySQL: TODO.');
  process.exit(2);
}

const { default: pg } = await import('pg').catch(() => {
  console.error('Missing dep: pg. Install with `npm install pg` at repo root.');
  process.exit(2);
});

const today = new Date().toISOString().slice(0, 10);
const outDir = join(REPO_ROOT, 'chronicles', 'raw', `database-${today}`);
if (!DRY) mkdirSync(outDir, { recursive: true });

const client = new pg.Client({ connectionString: URL });
await client.connect();

// Refuse if user has write privileges on the target schema.
const privCheck = await client.query(`
  SELECT has_schema_privilege(current_user, $1, 'CREATE') AS can_create
`, [SCHEMA]);
if (privCheck.rows[0]?.can_create) {
  console.error(`Refusing: current_user has CREATE on schema ${SCHEMA}. Use a read-only role.`);
  await client.end();
  process.exit(1);
}

const tablesQ = `
  SELECT table_name, obj_description(c.oid) AS comment
  FROM information_schema.tables t
  JOIN pg_class c ON c.relname = t.table_name
  WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
  ORDER BY table_name
`;
const tables = (await client.query(tablesQ, [SCHEMA])).rows.filter(t =>
  !SKIP.has(t.table_name) && (!ONLY.length || ONLY.includes(t.table_name))
);

const manifest = [];
for (const t of tables) {
  const cols = (await client.query(`
    SELECT column_name, data_type, is_nullable, column_default,
           col_description(($1 || '.' || $2)::regclass, ordinal_position) AS comment
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [SCHEMA, t.table_name])).rows;

  const indexes = (await client.query(`
    SELECT i.relname AS name, ix.indisunique AS unique, pg_get_indexdef(i.oid) AS def
    FROM pg_class t_, pg_class i, pg_index ix
    WHERE t_.oid = ix.indrelid AND i.oid = ix.indexrelid AND t_.relname = $1
  `, [t.table_name])).rows;

  const fks = (await client.query(`
    SELECT conname AS name, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t_ ON t_.oid = c.conrelid
    WHERE t_.relname = $1 AND c.contype = 'f'
  `, [t.table_name])).rows;

  const lines = [];
  lines.push(`---`);
  lines.push(`source: database`);
  lines.push(`source_kind: postgres`);
  lines.push(`schema: ${SCHEMA}`);
  lines.push(`table: ${t.table_name}`);
  lines.push(`fetched_at: ${new Date().toISOString()}`);
  lines.push(`---`);
  lines.push(``);
  lines.push(`# ${SCHEMA}.${t.table_name}`);
  lines.push(``);
  if (t.comment) { lines.push(`> ${t.comment}`); lines.push(``); }
  lines.push(`## Columns`);
  lines.push(``);
  lines.push(`| Column | Type | Null | Default | Comment |`);
  lines.push(`|--------|------|------|---------|---------|`);
  for (const c of cols) {
    lines.push(`| ${c.column_name} | ${c.data_type} | ${c.is_nullable} | ${c.column_default || ''} | ${(c.comment || '').replace(/\|/g, '\\|')} |`);
  }
  if (indexes.length) {
    lines.push(``);
    lines.push(`## Indexes`);
    lines.push(``);
    for (const i of indexes) lines.push(`- \`${i.name}\`${i.unique ? ' (UNIQUE)' : ''}: \`${i.def}\``);
  }
  if (fks.length) {
    lines.push(``);
    lines.push(`## Foreign keys`);
    lines.push(``);
    for (const f of fks) lines.push(`- \`${f.name}\`: \`${f.def}\``);
  }

  const file = `${SCHEMA}.${t.table_name}.md`;
  if (DRY) {
    console.error(`would write ${file} (${cols.length} cols, ${indexes.length} idx, ${fks.length} fk)`);
  } else {
    writeFileSync(join(outDir, file), lines.join('\n') + '\n');
  }
  manifest.push({ path: `chronicles/raw/database-${today}/${file}`, schema: SCHEMA, table: t.table_name, columns: cols.length });
}

if (!DRY) {
  writeFileSync(join(outDir, '_index.json'), JSON.stringify({ source: 'database', schema: SCHEMA, fetched_at: new Date().toISOString(), count: manifest.length, items: manifest }, null, 2));
  console.error(`wrote ${manifest.length} table(s) + _index.json to ${outDir}`);
  console.error(`next: invoke \`/ingest-source\` skill to convert raw → atoms`);
}

await client.end();
