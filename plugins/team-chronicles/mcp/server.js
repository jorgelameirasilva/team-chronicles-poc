#!/usr/bin/env node
// Chronicle MCP server. Exposes: search_chronicles, get_chronicle, propose_chronicle.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { search, format, loadChronicles } from './index.js';

// Codex doesn't expand ${VAR} inside .mcp.json. Pull from process env if set,
// otherwise fall back to the canonical symlink that setup.sh creates.
const FALLBACK = join(homedir(), '.chronicle-team-chronicles');
const ROOT = process.env.CHRONICLES_ROOT || FALLBACK;
if (!existsSync(ROOT)) {
  console.error(`CHRONICLES_ROOT not found at ${ROOT}. Run setup.sh first.`);
  process.exit(1);
}

const server = new Server(
  { name: 'chronicle', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_chronicles',
      description: 'Lexical search over team chronicles. Filters by team/repo scope.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          team:  { type: 'string', description: 'optional team slug' },
          repo:  { type: 'string', description: 'optional repo name' },
          limit: { type: 'number', default: 5 }
        },
        required: ['query']
      }
    },
    {
      name: 'get_chronicle',
      description: 'Fetch a single chronicle by id or relative path.',
      inputSchema: {
        type: 'object',
        properties: {
          idOrPath: { type: 'string' }
        },
        required: ['idOrPath']
      }
    },
    {
      name: 'propose_chronicle',
      description: 'Queue a draft chronicle for review. Writes to queue dir, does not commit.',
      inputSchema: {
        type: 'object',
        properties: {
          team: { type: 'string' },
          type: { type: 'string' },
          title: { type: 'string' },
          body:  { type: 'string' },
          tags:  { type: 'array', items: { type: 'string' } }
        },
        required: ['team', 'type', 'title', 'body']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === 'search_chronicles') {
    const results = search(ROOT, args.query, {
      team: args.team || process.env.CHRONICLE_TEAM,
      repo: args.repo,
      limit: args.limit || 5
    });
    const text = format(results) || 'No chronicles matched.';
    return { content: [{ type: 'text', text }] };
  }

  if (name === 'get_chronicle') {
    const docs = loadChronicles(ROOT);
    const hit = docs.find(d => d.frontmatter.id === args.idOrPath || d.path === args.idOrPath);
    if (!hit) return { content: [{ type: 'text', text: 'Not found.' }], isError: true };
    return { content: [{ type: 'text', text: readFileSync(hit.absPath, 'utf8') }] };
  }

  if (name === 'propose_chronicle') {
    const queueDir = process.env.CHRONICLE_QUEUE || join(process.env.HOME, '.chronicle-team/queue/drafts');
    mkdirSync(queueDir, { recursive: true });
    const slug = args.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const file = join(queueDir, `${Date.now()}-${slug}.md`);
    const today = new Date().toISOString().slice(0, 10);
    const body = `---
id: chr_draft_${Date.now()}
type: ${args.type}
team: ${args.team}
scope: { teams: [], repos: [], paths: [] }
tags: ${JSON.stringify(args.tags || [])}
confidence: medium
source: session
created: ${today}
updated: ${today}
---

# ${args.title}

${args.body}
`;
    writeFileSync(file, body);
    return { content: [{ type: 'text', text: `Queued: ${file}` }] };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('chronicle-mcp ready, root=' + ROOT);
