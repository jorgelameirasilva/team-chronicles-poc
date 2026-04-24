---
id: chr_01HXYZ0003
type: reference
team: platform
scope:
  teams: [platform]
  repos: [auth-gateway]
  paths: []
tags: [auth, service, jwt, session]
confidence: high
source: human
created: 2026-04-24
updated: 2026-04-24
---

# auth-gateway service overview

Owner: @platform-team. Repo: `github.com/org/auth-gateway`.

## Role

Central JWT issuer + session validator. Fronts all user-facing APIs.

## Key invariants

- Token TTL check uses `<=`, not `<`. Off-by-one caused 2026-02 incident.
- Session tokens NEVER written to application logs (legal req, see `private/compliance/`)
- All new endpoints must pass `BotID` check before auth middleware

## Upstream deps

- Postgres `auth` db (Neon, Vercel Marketplace)
- Vercel Edge Config for feature flags
- `@clerk/backend` for OAuth

## Dashboards

- Latency: grafana.internal/d/auth-latency
- Error rate: grafana.internal/d/auth-errors
