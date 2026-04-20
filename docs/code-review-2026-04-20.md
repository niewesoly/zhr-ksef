# Code Review — 2026-04-20

Scope: full `src/` audit focused on `any` assertions, SOLID, DRY, and bad
patterns. Findings reference verified file:line locations. Recommendations
are grouped by severity; quick wins are called out separately.

Out of scope: feature correctness, security model (already documented in
`CLAUDE.md`), test coverage, build/lint signals.

---

## 1. Executive summary

The codebase is in good shape overall: strict TS config
(`verbatimModuleSyntax`, `NodeNext`), Zod at boundaries, RLS + envelope
encryption landed, explicit `any` essentially absent from `src/` (2
eslint-disabled occurrences in `pdf-table.ts`). The main debt falls into
three buckets:

1. **Silent non-null assertions (`!`) after DB access** — 7 `row!.id`
   sites across `sync.ts`, `tenants.ts`, `workflow/transition.ts` where
   an empty `.returning()` result would crash instead of raising a
   domain error.
2. **Duplicated logic between HTML and PDF renderers** — money/date
   formatters, address builder, annotation labels, payment-term labels
   all exist in both files; `buildAdresLines` is re-implemented in
   `pdf-renderer.ts` despite being already exported from `format.ts`.
3. **Fat route handlers + schema duplication** — Zod shapes for
   `InvoiceAction`, `KsefEnv`, `NIP`, list queries exist both in
   `api/openapi/schemas.ts` and inline in route files.

None of the findings below require architectural rework. Ranked fix list
is at the bottom.

---

## 2. Type-safety findings (`any`, `as`, `!`)

### 2.1 `src/visualization/pdf-table.ts:68, 76` — explicit `any[]` for style arrays
```ts
const cellStyles: any[] = [baseStyles.cell, { width: opts.width }];
const rowStyle:   any[] = [rowStyles.row];
```
Comment claims "style arrays are valid at runtime" — true, but
`@react-pdf/renderer` exports `Style`. The workaround hides shape drift.

**Fix:** `import type { Style } from "@react-pdf/renderer"` and type as
`Style[]`. Remove both eslint-disable lines.

### 2.2 `src/ksef/xades.ts:65, 71` — length fields not checked against remaining buffer
```ts
const rLen = derSig[offset]!;
...
const sLen = derSig[offset]!;
```
The surrounding tag checks `derSig[offset] === 0x02` mean a truncated
blob still hits the `throw` at line 79 (undefined !== 0x02). The real
gap is that `rLen` / `sLen` are trusted as-read: if either claims more
bytes than remain, `subarray` silently returns a short buffer and the
padded coord becomes wrong. No exception, wrong signature.

**Fix:** after reading `rLen` / `sLen`, assert
`offset + len <= derSig.length` and throw the same domain error used
at line 79.

### 2.3 `src/ksef/sync.ts:63` — non-null on `.returning()` row
```ts
const [row] = await tx.insert(syncRuns)...returning({ id: syncRuns.id });
return row!.id;
```
Pattern repeats at `tenants.ts:114, 188, 256` and `workflow/transition.ts`.
A failed insert (constraint, RLS rejection) silently yields `undefined`
and the `!` crashes the next line.

**Fix:** use a tiny helper `firstOrThrow<T>(rows: T[], msg: string): T` in
`src/db/index.ts`, then `return firstOrThrow(rows, "sync_runs insert returned empty").id;`.

### 2.4 `src/ksef/client.ts:62–64` — cast chain on error envelope (low severity)
```ts
const json = JSON.parse(body) as Record<string, unknown>;
const exception = json["exception"] as Record<string, unknown> | undefined;
const detailList = exception?.["exceptionDetailList"] as KsefExceptionDetail[] | undefined;
```
`Array.isArray(detailList)` on line 66 does guard the only field that
is actually iterated, so a schema drift on the error envelope falls
back to the generic message rather than crashing. The casts are
stylistic rather than dangerous.

**Fix (defer):** if this module grows more error-parsing paths, swap
to a Zod `KsefErrorEnvelope` + `safeParse`. Not urgent today.

### 2.5 `src/ksef/cert-validate.ts:74–75`, `src/ksef/crypto.ts:44` — `as string` on `publicKey.export`
Node's `KeyObject.export` is overloaded; TS can't narrow on the
`{ type, format }` options object, so `as string` is a one-liner to
satisfy the compiler.

**Fix:** wrap in a helper once:
```ts
function exportSpkiPem(k: KeyObject): string {
  const out = k.export({ type: "spki", format: "pem" });
  if (typeof out !== "string") throw new Error("Expected PEM string");
  return out;
}
```
Removes three `as string` casts and gives a loud error on the
impossible case.

### 2.6 `src/visualization/pdf-renderer.ts:425` — `as AdnotacjeInput` without guard
```ts
const flags = adnotacjeFlags(invoice.adnotacje as AdnotacjeInput);
```
`AdnotacjeInput` is the exact input type of `adnotacjeFlags`; if they
match, the cast is just noise. If they don't, the cast papers over a
bug.

**Fix:** align the types so the cast is not needed, or pass
`invoice.adnotacje` directly and let TS fail the build if shapes drift.

### 2.7 `src/visualization/html-renderer.tsx:756-760` — `!` after a check that does not narrow
```ts
if (skontoHasData) {
  ... payment.skonto!.warunki ...
  ... payment.skonto!.wysokosc ...
}
```
`skontoHasData` is computed earlier; TS cannot tie that boolean back to
`payment.skonto`, so `!` is required. That makes the invariant invisible
to the next reader.

**Fix:** lift the local binding:
```ts
const skonto = payment.skonto;
if (skonto && (skonto.warunki || skonto.wysokosc != null)) { ... skonto.warunki ... }
```

### 2.8 `src/api/routes/invoices.ts:194` — `row.parsedData as InvoiceFa3`
Drizzle stores this column as `jsonb` with no runtime schema. The cast
is load-bearing but unchecked; a row from an older parser version will
fail deep inside the renderer.

**Fix:** parse through a `InvoiceFa3` Zod schema once on read, then
treat the shape as trusted downstream. If the Zod shape is too large
today, at minimum log a warning when top-level required fields are
missing.

---

## 3. SOLID findings

### 3.1 SRP — `src/ksef/parser.ts` is a 845-line god module
`parseInvoiceFa3` at the bottom orchestrates 15+ local helpers that
each know a different sub-tree of FA(3): party, address, line items,
VAT buckets, rozliczenie, adnotacje, platnosc, warunki, stopka. They
share mutable utility helpers (`findFieldRecord`, `findFieldString`).

**Fix:** split into a folder:
```
src/ksef/parser/
  index.ts              // public parseInvoiceFa3 only
  xml-nav.ts            // findFieldRecord/String/Array, isRecord
  party.ts              // parseParty, parseAddress
  line-items.ts         // parseLineItem + rabat/GTU helpers
  vat-buckets.ts        // VAT_BUCKETS constant + reducer
  adnotacje.ts
  platnosc.ts
  rozliczenie.ts
```
Each file stays under ~200 lines. The public API (`parseInvoiceFa3`,
`InvoiceFa3` type) is unchanged, so no caller is affected.

### 3.2 SRP — route handlers own business logic
`src/api/routes/tenants.ts:140–201` (`PATCH /:id`) does auth check →
base64 validation → cert parsing → envelope encryption → Drizzle update
in one function. `src/api/routes/invoices.ts:63–90` builds a Drizzle
`AND` condition list inline.

**Fix:** introduce a thin service layer `src/services/tenant.ts`,
`src/services/invoice-query.ts`. Handlers stay ~15 lines: parse →
authorize → call service → respond. Makes services unit-testable
without Hono.

### 3.3 DIP — `src/ksef/auth.ts:35–50` module-level token cache
`const tokenCache = new Map<string, TokenCacheEntry>();` is a
process-local singleton. Multi-instance deploys (prod runs 2+
replicas behind a LB) each cache independently, so the "24h grace"
rotation promise in `CLAUDE.md` relies on sticky routing.

**Fix:** extract `interface TokenStore { get/set/invalidate/clearExpired }`,
default to `MemoryTokenStore`, leave a TODO for `RedisTokenStore` once
BullMQ's Redis is in scope. No behavioural change today, but the seam
exists.

### 3.4 OCP — `src/ksef/parser.ts:289–308` VAT_BUCKETS is positional
```ts
const VAT_BUCKETS = [
  { net: "P_13_1", tax: "P_14_1", taxPLN: "P_14_1W", stawka: ..., typ: ... },
  ...
];
```
Adding a bucket means aligning three field names + two labels by hand.
Misalignment silently misfiles VAT into the wrong bucket.

**Fix:** make each bucket a named tuple, and add a test that proves
every `P_13_N` has a matching `P_14_N` per FA(3) schema.

---

## 4. DRY findings

### 4.1 `buildAdresLines` duplicated
- `src/visualization/format.ts:48` — exported helper.
- `src/visualization/pdf-renderer.ts:220` — local re-implementation
  with the same logic but a baked-in `kraj()` reference.

**Fix:** delete the PDF local copy; import from `format.ts` and pass
`kraj` as the second argument (that is exactly why `format.ts` takes
it as a callback).

### 4.2 Money / date / quantity formatters drift between renderers
`format.ts` exports `fmtDate`, `fmtMoney`, `fmtQty`. Both renderers
re-declare `fmtMoneyStr` (missing from `format.ts`) and in
`pdf-renderer.ts:109–130` a private `fmtMoney` variant exists
alongside the shared one.

**Fix:** add `fmtMoneyStr` and the PDF variant to `format.ts`;
delete the locals.

### 4.3 Currency default asymmetry
- `html-renderer.tsx:655` defaults missing currency to `"PLN"`.
- `pdf-renderer.ts:501` passes `invoice.currency` through unchanged.

Output diverges for invoices with a null currency column — HTML shows
"PLN", PDF shows "—".

**Fix:** one helper `getCurrency(invoice): string` in `format.ts`
used by both. Decide intentionally whether `null → "PLN"` or `null → "—"`.

### 4.4 `value != null && value.trim() !== ""` pattern
Appears 15+ times across both renderers (e.g.
`html-renderer.tsx:229, 234, 249, 257, 262, 277`;
`pdf-renderer.ts:241, 244, 251, 257, 261`).

**Fix:** `export function hasText(s: string | null | undefined): s is string`
in `format.ts`. Replace sites over time; no urgency but it pays back
every time a new field is added.

### 4.5 `.catch(() => ({}))` on `c.req.json()` — 4 copies
`invoices.ts:118`, `sync.ts:31`, `tenants.ts:91`, `tenants.ts:144`.

Problem: malformed JSON body becomes `{}` which then fails Zod with
"field X is required" — the caller gets a confusing 400 instead of
"invalid JSON".

**Fix:** one middleware `parseJsonBody` that returns 400 with
`{ code: "malformed_json" }` on parse failure, otherwise stores the
parsed body on `c`. Routes then do `const body = c.get("body")`.

### 4.6 `Object.assign(new Error(...), { status })`
`tenants.ts:45, 84`.

**Fix:** a tiny `class HttpError extends Error { status: number }` in
`src/api/types.ts`, consumed by the existing error-handler middleware.
Removes the pattern in 2 spots today and gives future code an obvious
choice.

### 4.7 Retry / timeout repeated in `ksef/client.ts`
`ksefFetch` (l. 114–179) has a 3-try loop with AbortController timeout;
`ksefFetchBinary` (l. 192–207) and `ksefFetchXml` (l. 219–227) set up
the same AbortController but without retry.

**Fix:** one `withTimeout(fetch, init, ms)` helper + one `withRetry(fn,
{ tries, isRetryable })` wrapper. All three call sites compose them.
`pollExportStatus` in `exporter.ts:76` should also use `withRetry`
for its inner fetch — today a transient blip terminates the poll.

### 4.8 Retry constants scattered
`MAX_RETRIES`, `REQUEST_TIMEOUT_MS` redeclared in `client.ts`,
`auth.ts:15–17`, `exporter.ts:18–19`.

**Fix:** `src/ksef/config.ts` with `KSEF_HTTP_CONFIG = { maxRetries, requestTimeoutMs, pollIntervalMs, pollTimeoutMs } as const`.

### 4.9 `InvoiceAction` / `InvoiceStatus` / `KsefEnv` / `NIP` schema redeclared
- `src/workflow/state-machine.ts:5–13` — canonical types + exhaustiveness guard.
- `src/api/openapi/schemas.ts:32–34, 41, 173–182` — Zod enums.
- `src/api/routes/invoices.ts:30–39` — route-local Zod list-query schema.
- `src/api/routes/tenants.ts:23–24` — local `NIP`, `KSEF_ENV`.

**Fix:** define Zod schemas in `schemas.ts`, derive TS types with
`z.infer`, re-export for the state machine and routes. Keep the
state-machine exhaustiveness guard — it is the only place that
cross-checks against the drizzle enum.

---

## 5. Other bad patterns

### 5.1 `.returning()` result not defensively destructured (see 2.3)
Seven call sites across `sync.ts`, `tenants.ts`, `transition.ts`.
Bundled with 2.3 so the same helper fixes them all.

### 5.2 `stub = () => ({}) as never` in OpenAPI spec
`src/api/openapi/spec.ts:72`. The OpenAPI generator doesn't need real
handlers, but `as never` is a code smell — if the generator ever
introspects the handler it will explode.

**Fix:** `const stub: RouteHandler = () => new Response(null)`.

### 5.3 Status code coupled to Error instance (see 4.6)
The existing `src/api/middleware/error-handler.ts` already inspects
`err.status`. Same behaviour with a typed class is strictly better.

### 5.4 `sanitizeSyncError` loses the original error for debugging
`src/ksef/sync.ts:37–42` caps the stored `last_sync_error` at 1000
chars (correct per CLAUDE.md) but does not separately log the full
error first.

**Fix:** `childLog.error({ err }, "sync failed")` before sanitizing
and persisting.

### 5.5 Passphrase handling in `xades.ts:89–105`
Passphrase arrives as a `string`, which is immutable in V8 — it can
live in the heap until GC. Not exploitable by itself, but the
envelope encryption design implies a stronger posture.

**Fix:** accept `Buffer` (or `string` → `Buffer.from(...)` at the
boundary) and `buf.fill(0)` in a `finally`. Low priority but cheap.

### 5.6 `src/ksef/parser.ts:488` magic fallback chain
```ts
findFieldString(row, "Klucz")
  ?? findFieldString(row, "NazwaInformacji")
  ?? findFieldString(row, "Rodzaj")
  ?? ""
```
No comment on why three different field names can appear. Smells like
FA(2)/FA(3) compatibility that nobody remembers.

**Fix:** constant `DODATKOWY_OPIS_KEYS` with a comment anchored to the
FA schema version that introduced each.

### 5.7 Silent empty-object fallback
`src/ksef/parser.ts:788-789`:
```ts
const podmiot1 = findFieldRecord(faktura, "Podmiot1") ?? {};
const podmiot2 = findFieldRecord(faktura, "Podmiot2") ?? {};
```
An FA(3) without a seller or buyer is invalid. Returning an empty
record passes all-null data through `parseParty`.

**Fix:** throw a domain error if either is missing. The parser is
already allowed to throw.

### 5.8 Misleading field name — `uuid` stores a line ordinal
`src/ksef/parser.ts:433-434`:
```ts
lp:   findFieldNumber(row, "NrWierszaFa") ?? idx + 1, // number
uuid: findFieldString(row, "NrWierszaFa"),            // string | null
```
Both reads are against the same XML element `NrWierszaFa` ("line number
in invoice"). Extracting it as both a number (for ordering) and a
string (for reference) is defensible, but the field name `uuid` on the
string variant is misleading — it's a line ordinal, not a UUID. A
future reader will assume the string is globally unique.

**Fix:** rename `uuid` to `nrWierszaFa` (or drop it if the numeric
`lp` is enough for all callers). Update `InvoiceLineItem` in
`src/ksef/types.ts` accordingly.

### 5.9 Middleware mount path is implicit
`src/index.ts:69–78` mounts `authMiddleware`, `tenantScopeMiddleware`,
`tenantTxMiddleware` on `/tenants/:id/*`. Any future route that
forgets the `:id` prefix silently runs unauthenticated.

**Fix:** a helper `scopedTenantRouter()` that returns a pre-wired
sub-app; routes mount onto it. Makes the invariant a type, not a
convention.

---

## 6. Ranked fix list

**Quick wins (≤ 1h each, zero behavioural risk):**

1. Delete local `buildAdresLines` in `pdf-renderer.ts:220`; import
   from `format.ts` (§4.1).
2. Move `fmtMoneyStr` and the PDF `fmtMoney` variant to `format.ts`;
   delete locals (§4.2).
3. Add `hasText` helper, replace `.trim() !== ""` in the two
   renderers (§4.4).
4. Introduce `firstOrThrow` helper, replace 7 `row!.id` sites
   (§2.3, §5.1).
5. `HttpError` class, replace `Object.assign` pattern (§4.6, §5.3).
6. Add `parseJsonBody` middleware, replace 4 copies of
   `.catch(() => ({}))` (§4.5).
7. Decide currency default once in `format.ts` (§4.3).

**Medium (1 day each):**

8. Bounds-check `rLen` / `sLen` in ECDSA DER parsing (§2.2).
9. `withTimeout` + `withRetry` helpers; rewrite `ksefFetch*` in terms
   of them; apply to `pollExportStatus` (§4.7, §4.8).
10. Consolidate `InvoiceAction` / `KsefEnv` / `NIP` schemas in
    `api/openapi/schemas.ts`, derive TS types (§4.9).
11. `parsedData` read-side Zod parse or at minimum shape assertion
    (§2.8).
12. Throw on missing `Podmiot1`/`Podmiot2` (§5.7); rename `uuid`
    field on line items (§5.8).

**Structural (multi-day, coordinate with roadmap):**

13. Split `parser.ts` into `src/ksef/parser/` sub-modules (§3.1).
14. Extract `src/services/` layer for tenants and invoice queries;
    slim the route handlers (§3.2).
15. `TokenStore` abstraction for `auth.ts`; MemoryTokenStore default,
    Redis-backed implementation tracked for when multi-instance
    deploy is real (§3.3).

**Defer unless triggered:**

16. Zod-validate KSeF error envelope in `client.ts:62` (§2.4) —
    current `Array.isArray` guard is enough for today.
17. Typed `KsefError` hierarchy (would seed naturally from item 16).
18. Passphrase buffer-wipe (§5.5) — low practical payoff on V8.
