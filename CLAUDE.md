# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repo is a **fresh Hono scaffold** (single `src/index.ts` returning "Hello Hono!"). The target architecture is documented in the implementation plan at `~/.claude/plans/validated-sauteeing-raccoon.md` — **read that plan before making substantive changes**; it is the source of truth for model, modules, API surface, and security decisions.

## Commands

Package manager is **pnpm** (lockfile present; do not switch to npm/yarn).

```bash
pnpm install       # install deps
pnpm dev           # tsx watch src/index.ts → http://localhost:3000
pnpm build         # tsc → dist/
pnpm start         # node dist/index.js
```

There is no test runner, linter, or formatter configured yet. When adding one, update this file.

## What this service is

`zhr-ksef` is a standalone TypeScript microservice being extracted from the **ziher** Rails monolith. It integrates with **KSeF** (Krajowy System e-Faktur — the Polish national e-invoicing system). Ziher will become a client of this service via REST + API key; it no longer holds KSeF certs or runs sync jobs itself.

The service is **multi-tenant**: each tenant has its own NIP, X.509 cert + private key, sync schedule, and row-isolated data.

## Architecture (target — per the plan)

Stack decisions are fixed in the plan; do not substitute alternatives without discussion:

- **Hono** on **Node.js** (Node required — uses `node:crypto` for RSA/ECDSA/AES)
- **PostgreSQL + Drizzle ORM** with SQL migrations
- **BullMQ + Redis** for scheduled sync and PDF rendering workers
- **Zod** for all request/config validation
- **fast-xml-parser** for KSeF XML (with `processEntities: false` — XXE hardening)
- **@react-pdf/renderer** for PDF (deliberately avoiding headless Chrome)
- **XAdES-BASELINE-B** signatures are built as strings, not via DOM (port from Ruby impl)

Planned source layout — modules live under `src/{api,ksef,workflow,visualization,jobs,db,lib}`. See plan §"Kluczowe moduły serwisu" for the full tree.

### Data model (key invariants)

- `invoices.ksef_number` is **unique per tenant**, not globally: `UNIQUE(tenant_id, ksef_number)`.
- Invoice status is a state machine: `synced → pending → unassigned → assigned → imported`, with `dismissed` as a sink. Transitions are validated server-side and recorded in `invoice_events` (audit trail).
- A single endpoint handles all transitions: `POST /invoices/:iid/transition` with an `action` discriminator.

### Security model (non-negotiable — read before touching auth, crypto, or DB)

- **Envelope encryption** for tenant secrets: per-tenant DEK (AES-256-GCM) wraps `cert_pem` / `key_pem` / `key_passphrase`; DEK itself is wrapped by a KEK from `ENCRYPTION_KEY` env. Compromising one tenant must not leak others.
- **API keys** are bcrypt-hashed (cost 12); compare with `bcrypt.compare` (constant-time). Rotation has a 24h grace period.
- **Certs are uploaded once** via `PATCH /tenants/:id`; sync and other ops **always** read certs from DB. Never accept cert/key material in per-request bodies for sync operations.
- **PostgreSQL RLS** on `invoices`, `invoice_events`, `sync_runs`. Every request must `SET LOCAL app.tenant_id = ?` — a buggy query missing `WHERE tenant_id` must not leak cross-tenant data.
- **SSRF protection**: `api_url` is an enum (`production` / `test` / `demo`), never free text. URLs returned by KSeF responses must be validated (HTTPS, `.mf.gov.pl` suffix, no private-IP resolution) before fetching.
- **pino redaction** list is explicit — include `cert_pem`, `key_pem`, `key_passphrase`, `x-api-key` headers. Error responses in production return a correlation ID, never a stack trace. `last_sync_error` is sanitized and capped at 1000 chars (no PEM blocks).
- Rate limits are **tiered** per endpoint class (list / detail / sync / cert upload / unauthenticated). See plan §"Rate limiting".
- XML ≤ 10MB, ZIP ≤ 100MB / ≤ 1000 entries — enforce before parsing.

### Crypto porting note

The XAdES and KSeF auth flow (`challenge → XAdES sign → poll → redeem`) is being ported from Ruby. The Ruby impl builds XML as strings (not via a DOM) — keep that approach in TS to preserve byte-exact canonicalization. This module is the highest-risk piece; it needs tests before anything else depends on it.

## Implementation order

Per the plan, work proceeds:

1. Scaffold infra (Hono + Drizzle + BullMQ + Docker, network isolation, Redis AUTH)
2. Security foundations (envelope encryption, bcrypt, RLS, pino redaction) — **before** any business logic
3. Crypto / XAdES port (with tests)
4. KSeF HTTP client (retry, SSRF guard)
5. Sync pipeline (export → decrypt → parse → persist, idempotent)
6. REST API (tenants with cert validation, invoices, sync)
7. Workflow state machine + transition endpoint
8. Visualization (HTML with CSP, PDF in worker)
9. Ziher integration (`KsefApiClient` wrapper, controller migration)
10. Tests (unit crypto/parser/encryption, integration sync + tenant isolation, E2E API)

Do not skip ahead — security foundations must land before crypto handling real keys, and crypto must have tests before sync depends on it.

## TypeScript config notes

- `"module": "NodeNext"` + `"type": "module"` → use explicit `.js` extensions in relative imports when needed by NodeNext resolution.
- `"jsxImportSource": "hono/jsx"` is set, so JSX in this repo is Hono JSX (server-rendered), **not** React. The `@react-pdf/renderer` integration (when added) uses its own React runtime and should be scoped to the PDF module only.
- `"verbatimModuleSyntax": true` — use `import type` for type-only imports.
