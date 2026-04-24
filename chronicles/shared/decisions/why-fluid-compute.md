---
id: chr_01HXYZ0002
type: decision
team: shared
scope:
  teams: []
  repos: []
  paths: []
tags: [vercel, fluid-compute, edge, runtime]
confidence: high
source: human
created: 2026-04-24
updated: 2026-04-24
---

# Default runtime is Fluid Compute, not Edge

All Vercel functions default to Fluid Compute. Edge Functions deprecated path.

**Why:** Edge runtime compat gaps hit us 3x (Node APIs missing, bundle size, cold starts on rare regions). Fluid same price, same regions, full Node.js, reuses instances.

**How to apply:**
- New function: no runtime config needed (Fluid = default)
- Middleware: same, uses Fluid under hood
- Only opt into edge if provably latency-critical AND Node APIs unused
