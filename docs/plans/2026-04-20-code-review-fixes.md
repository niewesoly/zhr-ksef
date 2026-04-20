# Code-Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the 12 quick-win + medium-tier fixes from
`docs/code-review-2026-04-20.md` (fix-list items 1–12). Preserve the
current 122/122 test green state throughout; add new tests where
helpers or middleware are introduced.

**Architecture:** Each task is a small, independently-committable
refactor. Ordering respects dependencies — helpers land before their
consumers adopt them. No behavioral changes in routes or parser
outputs, except where the review explicitly flagged a bug
(`Podmiot1`/`Podmiot2` guard, `uuid` rename, ECDSA bounds check).

**Tech Stack:** TypeScript (`NodeNext`, `verbatimModuleSyntax`), Hono,
Drizzle, Zod, `@react-pdf/renderer`, pino, Node built-in test runner
(`pnpm test` → `node --import tsx --test`).

**Structural items out of scope** (tracked separately, review items
13–15): splitting `parser.ts` into sub-modules, extracting a
`src/services/` layer, abstracting the token cache behind a
`TokenStore` interface.

**Before starting:**
- Confirm a clean baseline: `pnpm test` → 122/122 pass.
- Work directly on `main` or a short-lived branch. No worktree needed;
  all tasks are small and localized.

---

## Task 1: Dedupe `buildAdresLines`

Fix-list item 1. Reference: review §4.1.

**Files:**
- Modify: `src/visualization/pdf-renderer.ts:220-224` (delete local fn)
- Modify: `src/visualization/pdf-renderer.ts:229-230` (update call sites)

**Step 1: Check the shared helper signature**

Read `src/visualization/format.ts:48-55`. Confirm signature:
```ts
export function buildAdresLines(
  adres: { adresL1: string | null; adresL2: string | null; kodKraju: string | null } | null,
  krajFn: (code: string | null) => string | null,
): string[]
```

**Step 2: Add import in pdf-renderer.ts**

Find the existing import from `./format.js` (around line 5–10) and add
`buildAdresLines` to the import list. Example:
```ts
import { fmtDate, buildAdresLines } from "./format.js";
```

**Step 3: Delete local implementation**

Remove lines 220–224 of `pdf-renderer.ts`:
```ts
function buildAdresLines(addr: { ... } | null): string[] {
  if (!addr) return [];
  ...
}
```

**Step 4: Update call sites to pass `kraj` callback**

Lines 230–231 currently:
```ts
const adresLines = buildAdresLines(p.adres);
const adresKorespLines = buildAdresLines(p.adresKoresp);
```

Change to:
```ts
const adresLines = buildAdresLines(p.adres, kraj);
const adresKorespLines = buildAdresLines(p.adresKoresp, kraj);
```

`kraj` is the dictionary lookup already imported at the top of the file.

**Step 5: Run tests**

Run: `pnpm test`
Expected: 122/122 pass. PDF renderer test is the key guard here.

**Step 6: Commit**

```bash
git add src/visualization/pdf-renderer.ts
git commit -m "refactor(visualization): dedupe buildAdresLines against format.ts"
```

---

## Task 2: Consolidate money / quantity formatters in `format.ts`

Fix-list item 2. Reference: review §4.2.

**Files:**
- Modify: `src/visualization/format.ts` (add `fmtMoneyStr` plus any
  other formatters the renderers re-declare locally)
- Modify: `src/visualization/html-renderer.tsx` (delete local
  `fmtMoneyStr`, import from format)
- Modify: `src/visualization/pdf-renderer.ts` (delete local
  `fmtMoneyStr` and any `fmtMoney` variant, import from format)

**Step 1: Inventory the locals**

Run: `grep -n "function fmt" src/visualization/html-renderer.tsx src/visualization/pdf-renderer.ts`
Record which `fmtMoneyStr` / `fmtMoney` variants exist locally.

**Step 2: Write tests for any new export**

Open `tests/visualization/format.test.ts` — add tests for
`fmtMoneyStr` covering:
- `fmtMoneyStr(null, "PLN")` → `"—"`
- `fmtMoneyStr(0, "PLN")` → `"0.00 PLN"` (or whatever the existing
  inline logic produced — copy exact behavior)
- `fmtMoneyStr(123.4, "EUR")` → `"123.40 EUR"`
- `fmtMoneyStr(100, null)` → behavior matches inline version

**Step 3: Run new tests to verify they fail**

Run: `pnpm test -- --test-name-pattern="fmtMoneyStr"`
Expected: FAIL — export does not exist yet.

**Step 4: Add exports to format.ts**

Copy the local implementations verbatim into `format.ts` as exported
functions. Do not change behavior — bit-exact output is what the
existing renderer tests rely on.

**Step 5: Run new tests to verify they pass**

Run: `pnpm test -- --test-name-pattern="fmtMoneyStr"`
Expected: PASS.

**Step 6: Delete locals and add imports**

Remove the local declarations in both renderer files; extend the
existing `import ... from "./format.js"` to include the new exports.

**Step 7: Run full suite**

Run: `pnpm test`
Expected: 122/122 + the new format tests pass.

**Step 8: Commit**

```bash
git add src/visualization/format.ts \
        src/visualization/html-renderer.tsx \
        src/visualization/pdf-renderer.ts \
        tests/visualization/format.test.ts
git commit -m "refactor(visualization): move fmtMoneyStr to shared format module"
```

---

## Task 3: Add `hasText` helper

Fix-list item 3. Reference: review §4.4.

**Files:**
- Modify: `src/visualization/format.ts` (add export)
- Modify: `tests/visualization/format.test.ts` (add tests)

**Step 1: Write failing tests**

In `tests/visualization/format.test.ts`:
```ts
test("hasText returns false for null/undefined/empty/whitespace", () => {
  assert.strictEqual(hasText(null), false);
  assert.strictEqual(hasText(undefined), false);
  assert.strictEqual(hasText(""), false);
  assert.strictEqual(hasText("   "), false);
});

test("hasText returns true and narrows when string has non-whitespace", () => {
  const x: string | null = "abc";
  if (hasText(x)) {
    // TS should accept this without `!`
    assert.strictEqual(x.length, 3);
  } else {
    assert.fail("expected hasText to narrow to string");
  }
});
```

**Step 2: Run tests to confirm failure**

Run: `pnpm test -- --test-name-pattern="hasText"`
Expected: FAIL.

**Step 3: Implement**

Append to `src/visualization/format.ts`:
```ts
/**
 * Returns true only when the input is a non-empty, non-whitespace string.
 * Acts as a type guard so callers can drop `!` inside the branch.
 */
export function hasText(s: string | null | undefined): s is string {
  return s != null && s.trim() !== "";
}
```

**Step 4: Run tests**

Run: `pnpm test -- --test-name-pattern="hasText"`
Expected: PASS.

**Step 5: Adopt at 3-5 call sites (do not do all 15+ — YAGNI)**

Pick the most visible sites and replace the pattern. Candidates
(verified in review §4.4):
- `html-renderer.tsx:229, 234, 249, 257, 262, 277`
- `pdf-renderer.ts:241, 244, 251, 257, 261`

Rule: only convert spots where the branch body actually benefits from
the type narrowing. Skip spots where the current code reads fine.

**Step 6: Run full suite**

Run: `pnpm test`
Expected: 122/122 + new format tests pass.

**Step 7: Commit**

```bash
git add src/visualization/format.ts \
        tests/visualization/format.test.ts \
        src/visualization/html-renderer.tsx \
        src/visualization/pdf-renderer.ts
git commit -m "feat(visualization): add hasText type guard; adopt at key call sites"
```

---

## Task 4: Centralize currency default

Fix-list item 7. Reference: review §4.3.

Today `html-renderer.tsx:655` defaults to `"PLN"` when currency is
null; `pdf-renderer.ts:501` does not.

**Files:**
- Modify: `src/visualization/format.ts` (add `getCurrencyOrDash`)
- Modify: `src/visualization/html-renderer.tsx:655`
- Modify: `src/visualization/pdf-renderer.ts:501`
- Modify: `tests/visualization/format.test.ts`

**Step 1: Decide the default**

Read `src/ksef/types.ts` for the `currency` field. The current HTML
default is `"PLN"` — keep that behavior (it matches ziher's output).
Rename the helper `getCurrencyOrPln`.

**Step 2: Write failing test**

```ts
test("getCurrencyOrPln falls back to PLN for null/undefined", () => {
  assert.strictEqual(getCurrencyOrPln(null), "PLN");
  assert.strictEqual(getCurrencyOrPln(undefined), "PLN");
  assert.strictEqual(getCurrencyOrPln("EUR"), "EUR");
  assert.strictEqual(getCurrencyOrPln(""), "PLN"); // empty string → PLN
});
```

**Step 3: Implement**

```ts
export function getCurrencyOrPln(c: string | null | undefined): string {
  return c && c.trim() !== "" ? c : "PLN";
}
```

**Step 4: Run test**

Run: `pnpm test -- --test-name-pattern="getCurrencyOrPln"`
Expected: PASS.

**Step 5: Replace the two call sites**

- `html-renderer.tsx:655` →
  `const currency = getCurrencyOrPln(invoice.currency);`
- `pdf-renderer.ts:501` →
  `const currency = getCurrencyOrPln(invoice.currency);`

**Step 6: Run full suite**

Run: `pnpm test`
Expected: 122/122 + new format tests pass. (PDF snapshot-ish tests
may need regeneration if any fixture had null currency; check output
first.)

**Step 7: Commit**

```bash
git add src/visualization/format.ts \
        tests/visualization/format.test.ts \
        src/visualization/html-renderer.tsx \
        src/visualization/pdf-renderer.ts
git commit -m "refactor(visualization): centralize currency fallback in format.getCurrencyOrPln"
```

---

## Task 5: Add `firstOrThrow` helper; replace 7 `row!.id` sites

Fix-list item 4. Reference: review §2.3, §5.1.

**Files:**
- Modify: `src/db/index.ts` (add helper)
- Create: `tests/db/first-or-throw.test.ts`
- Modify: `src/ksef/sync.ts:63`
- Modify: `src/api/routes/tenants.ts:114, 188` (plus rotate-key site)
- Modify: `src/workflow/transition.ts` (find `row!` sites)

**Step 1: Locate all 7 sites**

Run: `grep -rn "row!\.\|updated!\|deleted\[0\]" src/`
Record the list. Expect: `sync.ts:63`, `tenants.ts:114, 188`, and
any sites in `rotate-key`, `transition.ts`.

**Step 2: Write failing test**

Create `tests/db/first-or-throw.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { firstOrThrow } from "../../src/db/index.js";

test("firstOrThrow returns first row", () => {
  assert.deepStrictEqual(firstOrThrow([{ id: "a" }], "empty"), { id: "a" });
});

test("firstOrThrow throws on empty array with given message", () => {
  assert.throws(
    () => firstOrThrow([], "sync_runs insert returned empty"),
    /sync_runs insert returned empty/,
  );
});
```

**Step 3: Run tests — confirm failure**

Run: `pnpm test -- --test-name-pattern="firstOrThrow"`
Expected: FAIL (import error).

**Step 4: Implement**

Append to `src/db/index.ts`:
```ts
/**
 * Return the first element of `rows`, or throw an Error if the array is
 * empty. Use after Drizzle `.returning()` to fail loudly when an
 * insert/update did not produce the expected row (RLS rejection,
 * constraint violation consumed by the driver, etc).
 */
export function firstOrThrow<T>(rows: T[], message: string): T {
  const [first] = rows;
  if (first === undefined) throw new Error(message);
  return first;
}
```

**Step 5: Run tests — confirm pass**

Run: `pnpm test -- --test-name-pattern="firstOrThrow"`
Expected: PASS.

**Step 6: Replace call sites**

For each site found in Step 1, convert:
```ts
const [row] = await tx.insert(foo).values(...).returning(...);
return row!.id;
```
into:
```ts
const rows = await tx.insert(foo).values(...).returning(...);
return firstOrThrow(rows, "insert foo returned empty").id;
```

Use descriptive messages per call site — they will appear in logs.
Example for `sync.ts:63`: `"sync_runs insert returned empty"`.
Example for `tenants.ts:114`: `"tenants insert returned empty"`.

**Step 7: Run full suite**

Run: `pnpm test`
Expected: 122/122 + new db tests pass.

**Step 8: Commit**

```bash
git add src/db/index.ts \
        tests/db/first-or-throw.test.ts \
        src/ksef/sync.ts \
        src/api/routes/tenants.ts \
        src/workflow/transition.ts
git commit -m "refactor(db): add firstOrThrow; replace row! assertions on .returning()"
```

---

## Task 6: `HttpError` class; replace `Object.assign(new Error)`

Fix-list item 5. Reference: review §4.6, §5.3.

**Files:**
- Modify: `src/api/types.ts` (export `HttpError`)
- Modify: `src/api/middleware/error-handler.ts` (consume it)
- Modify: `src/api/routes/tenants.ts:45, 84`
- Create: `tests/api/http-error.test.ts`

**Step 1: Check what the error handler reads today**

Read `src/api/middleware/error-handler.ts`. Confirm whether it
inspects `err.status` for the existing `Object.assign` pattern. If
not, the existing 400/403 responses may be routed through
`HTTPException` already — in that case we align to `HTTPException`
instead of inventing a new class.

If the existing pattern relies on `err.status`, proceed with
`HttpError`. If it relies on `HTTPException`, skip class creation
and just migrate the two `Object.assign` sites to
`throw new HTTPException(403, { message: "forbidden" })`.

**Step 2: Based on Step 1, pick the path**

- **Path A (existing `err.status` consumer):** add `HttpError` class.
- **Path B (Hono `HTTPException` consumer):** migrate to
  `HTTPException` directly.

The rest of the task assumes Path A. For Path B skip to Step 6.

**Step 3 (Path A): Write failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../../src/api/types.js";

test("HttpError exposes status and message", () => {
  const e = new HttpError(403, "forbidden");
  assert.strictEqual(e.status, 403);
  assert.strictEqual(e.message, "forbidden");
  assert.ok(e instanceof Error);
});
```

Run: `pnpm test -- --test-name-pattern="HttpError"` → FAIL.

**Step 4 (Path A): Implement**

Append to `src/api/types.ts`:
```ts
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}
```

Run the test → PASS.

**Step 5 (Path A): Update error-handler if needed**

If the handler was checking `"status" in err`, narrow that to
`err instanceof HttpError` for cleaner types.

**Step 6 (both paths): Migrate call sites**

`tenants.ts:45`:
```ts
throw new HttpError(400, `${label} is empty or not valid base64`);
// or (Path B):
throw new HTTPException(400, { message: `${label} is empty or not valid base64` });
```

`tenants.ts:84`:
```ts
throw new HttpError(403, "forbidden");
// or (Path B):
throw new HTTPException(403, { message: "forbidden" });
```

**Step 7: Run full suite**

Run: `pnpm test`
Expected: 122/122 + (Path A) HttpError tests pass.

**Step 8: Commit**

```bash
git add src/api/types.ts \
        src/api/middleware/error-handler.ts \
        src/api/routes/tenants.ts \
        tests/api/http-error.test.ts
git commit -m "refactor(api): replace Object.assign error pattern with typed HttpError"
```

---

## Task 7: `parseJsonBody` middleware; replace 4 `.catch(() => ({}))`

Fix-list item 6. Reference: review §4.5.

**Files:**
- Create: `src/api/middleware/parse-json-body.ts`
- Create: `tests/api/middleware/parse-json-body.test.ts`
- Modify: `src/api/types.ts` (extend `AppVariables` with `body`)
- Modify: `src/api/routes/invoices.ts:118`
- Modify: `src/api/routes/sync.ts:31`
- Modify: `src/api/routes/tenants.ts:91, 144`

**Step 1: Decide the shape**

Middleware parses JSON once. On parse failure returns 400
`{ error: "malformed_json", correlation_id }`. Stores the parsed
value at `c.set("body", parsed)`. Downstream handlers pull it with
`c.get("body")` and pass it to their Zod schema.

**Step 2: Extend `AppVariables`**

In `src/api/types.ts`:
```ts
export interface AppVariables {
  correlationId: string;
  logger: Logger;
  tenant: Tenant;
  tx: Tx;
  body: unknown; // set by parseJsonBody middleware on mutating routes
}
```

Note: `unknown` forces handlers to Zod-parse before use. Good.

**Step 3: Write failing test**

`tests/api/middleware/parse-json-body.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { parseJsonBody } from "../../../src/api/middleware/parse-json-body.js";

test("parseJsonBody stores parsed body on context", async () => {
  const app = new Hono();
  app.post("/", parseJsonBody, (c) => c.json({ got: c.get("body") }));

  const res = await app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ a: 1 }),
  });

  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { got: { a: 1 } });
});

test("parseJsonBody returns 400 on malformed JSON", async () => {
  const app = new Hono();
  app.post("/", parseJsonBody, (c) => c.json({ got: c.get("body") }));

  const res = await app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });

  assert.strictEqual(res.status, 400);
  const json = await res.json() as { error: string };
  assert.strictEqual(json.error, "malformed_json");
});
```

Run: FAIL (module not found).

**Step 4: Implement**

`src/api/middleware/parse-json-body.ts`:
```ts
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";

export const parseJsonBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "malformed_json" }, 400);
  }
  c.set("body", body);
  await next();
};
```

**Step 5: Run middleware tests**

Run: `pnpm test -- --test-name-pattern="parseJsonBody"`
Expected: PASS.

**Step 6: Migrate the 4 route sites**

At each of `invoices.ts:118`, `sync.ts:31`, `tenants.ts:91`,
`tenants.ts:144`:
- Add `parseJsonBody` to the route's middleware chain (inline in the
  `.post`/`.patch` call).
- Replace:
  ```ts
  const body = await c.req.json().catch(() => ({}));
  ```
  with:
  ```ts
  const body = c.get("body");
  ```

Example for `invoices.ts:118`:
```ts
invoicesRouter.post("/:iid/transition", parseJsonBody, async (c) => {
  const body = c.get("body");
  const parsed = transitionSchema.parse(body);
  ...
});
```

**Step 7: Run full suite**

Run: `pnpm test`
Expected: 122/122 + middleware tests pass.

**Step 8: Commit**

```bash
git add src/api/middleware/parse-json-body.ts \
        src/api/types.ts \
        tests/api/middleware/parse-json-body.test.ts \
        src/api/routes/invoices.ts \
        src/api/routes/sync.ts \
        src/api/routes/tenants.ts
git commit -m "refactor(api): parseJsonBody middleware; unified 400 on bad JSON"
```

---

## Task 8: Rename misleading `uuid` field; guard `Podmiot1`/`Podmiot2`

Fix-list item 12. References: review §5.7, §5.8.

Two parser fixes bundled — both small, both in `src/ksef/parser.ts`.

**Files:**
- Modify: `src/ksef/types.ts` (rename `uuid` → `nrWierszaFa` on line item)
- Modify: `src/ksef/parser.ts:433-434` (rename)
- Modify: `src/ksef/parser.ts:788-789` (throw on missing party)
- Modify: Any HTML/PDF renderer or other consumer that reads
  `lineItem.uuid`
- Modify: `tests/ksef/parser.test.ts` (rename + new guard test)

**Step 1: Find consumers of `lineItem.uuid`**

Run: `grep -rn "\.uuid" src/visualization/ src/ksef/`
Expected: one or two references in renderers; none in sync path.

**Step 2: Rename in the type**

In `src/ksef/types.ts` (around line 60–61):
```ts
export interface InvoiceLineItem {
  lp: number;
  nrWierszaFa: string | null; // was `uuid`
  ...
}
```

**Step 3: Rename in parser**

`parser.ts:434`:
```ts
nrWierszaFa: findFieldString(row, "NrWierszaFa"),
```

**Step 4: Update renderer call sites**

Rename any `.uuid` reads to `.nrWierszaFa`.

**Step 5: Update parser tests**

Any assertion on `lineItem.uuid` → `lineItem.nrWierszaFa`.

**Step 6: Run tests**

Run: `pnpm test`
Expected: 122/122 pass (same tests, renamed field).

**Step 7: Commit the rename**

```bash
git add src/ksef/types.ts src/ksef/parser.ts \
        src/visualization/ tests/ksef/parser.test.ts
git commit -m "refactor(ksef): rename lineItem.uuid to nrWierszaFa (it's a line ordinal, not a UUID)"
```

**Step 8: Write failing test for Podmiot guard**

In `tests/ksef/parser.test.ts`:
```ts
test("parseInvoiceFa3 throws when Podmiot1 (seller) is missing", () => {
  const xml = `<?xml version="1.0"?><Faktura><Fa><RodzajFaktury>VAT</RodzajFaktury></Fa></Faktura>`;
  assert.throws(() => parseInvoiceFa3(xml), /Podmiot1|sprzedaw/i);
});

test("parseInvoiceFa3 throws when Podmiot2 (buyer) is missing", () => {
  const xml = `<?xml version="1.0"?><Faktura>
    <Podmiot1><DaneIdentyfikacyjne><NIP>1234567890</NIP></DaneIdentyfikacyjne></Podmiot1>
    <Fa><RodzajFaktury>VAT</RodzajFaktury></Fa>
  </Faktura>`;
  assert.throws(() => parseInvoiceFa3(xml), /Podmiot2|nabywc/i);
});
```

Run → FAIL (currently returns null-filled party).

**Step 9: Implement guard**

`parser.ts:788-789` → replace:
```ts
const podmiot1 = findFieldRecord(faktura, "Podmiot1") ?? {};
const podmiot2 = findFieldRecord(faktura, "Podmiot2") ?? {};
```
with:
```ts
const podmiot1 = findFieldRecord(faktura, "Podmiot1");
if (!podmiot1) throw new Error("Brak elementu Podmiot1 (sprzedawca) w XML");
const podmiot2 = findFieldRecord(faktura, "Podmiot2");
if (!podmiot2) throw new Error("Brak elementu Podmiot2 (nabywca) w XML");
```

**Step 10: Run tests**

Run: `pnpm test`
Expected: PASS (new guard tests + existing 122/122).

**⚠ Regression check:** any fixture XML in
`tests/helpers/fixtures.ts` that previously parsed without Podmiot2
(e.g. certain internal documents) will now throw. Update the
fixture or catch the exception — do not weaken the guard.

**Step 11: Commit**

```bash
git add src/ksef/parser.ts tests/ksef/parser.test.ts
git commit -m "fix(ksef): throw on missing Podmiot1/Podmiot2 instead of silent null-filled party"
```

---

## Task 9: Bounds-check ECDSA DER length fields

Fix-list item 8. Reference: review §2.2.

**Files:**
- Modify: `src/ksef/xades.ts:60-80`
- Create or extend: `tests/ksef/xades.test.ts` (if one doesn't exist,
  add a targeted test for `ecDerToRawSignature`)

**Step 1: Check if `ecDerToRawSignature` is exported or internal**

Read `src/ksef/xades.ts`. If it's internal (not exported), either
export it for test purposes or test through the public signer with a
stubbed malformed DER input. Prefer exporting as
`/** @internal */ export function ecDerToRawSignature(...)`.

**Step 2: Write failing test for truncated DER**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ecDerToRawSignature } from "../../src/ksef/xades.js";

test("ecDerToRawSignature throws on truncated DER where rLen exceeds buffer", () => {
  // SEQUENCE tag + len, INTEGER tag, length=10 but only 2 bytes follow
  const bad = Buffer.from([0x30, 0x04, 0x02, 0x0A, 0x01, 0x02]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});

test("ecDerToRawSignature throws on truncated DER where sLen exceeds buffer", () => {
  // Valid r (1 byte), then INTEGER tag, length=99, no bytes
  const bad = Buffer.from([0x30, 0x06, 0x02, 0x01, 0xAB, 0x02, 0x63]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});
```

Run → FAIL (currently returns a short/wrong buffer silently).

**Step 3: Add bounds checks**

In `xades.ts`, after reading each length byte:
```ts
const rLen = derSig[offset]!;
offset++;
if (offset + rLen > derSig.length) {
  throw new Error("Nieprawidłowy format podpisu DER ECDSA");
}
const r = derSig.subarray(offset, offset + rLen);
offset += rLen;
if (derSig[offset] === 0x02) {
  offset++;
  const sLen = derSig[offset]!;
  offset++;
  if (offset + sLen > derSig.length) {
    throw new Error("Nieprawidłowy format podpisu DER ECDSA");
  }
  const s = derSig.subarray(offset, offset + sLen);
  ...
}
```

**Step 4: Run tests**

Run: `pnpm test`
Expected: 122/122 + new xades tests pass.

**Step 5: Commit**

```bash
git add src/ksef/xades.ts tests/ksef/xades.test.ts
git commit -m "fix(ksef): bounds-check ECDSA DER length fields against remaining buffer"
```

---

## Task 10: `withTimeout` + `withRetry` helpers for KSeF client

Fix-list item 9. References: review §4.7, §4.8.

Applies to `ksef/client.ts` (three fetch variants) and
`ksef/exporter.ts` (polling inner fetch). De-dupes `MAX_RETRIES` /
`REQUEST_TIMEOUT_MS` scattered across `client.ts`, `auth.ts:15-17`,
`exporter.ts:18-19`.

**Files:**
- Create: `src/ksef/http-helpers.ts` (`withTimeout`, `withRetry`)
- Create: `src/ksef/config.ts` (`KSEF_HTTP_CONFIG`)
- Modify: `src/ksef/client.ts` (rewrite three fetch functions)
- Modify: `src/ksef/auth.ts` (import config)
- Modify: `src/ksef/exporter.ts` (import config; wrap poll fetch)
- Create: `tests/ksef/http-helpers.test.ts`

**Step 1: Extract config**

`src/ksef/config.ts`:
```ts
export const KSEF_HTTP_CONFIG = {
  maxRetries: 3,
  requestTimeoutMs: 30_000,
  pollIntervalMs: 5_000,
  pollTimeoutMs: 300_000,
} as const;
```

**Step 2: Write failing test for `withTimeout`**

```ts
test("withTimeout aborts slow fetch", async () => {
  await assert.rejects(
    withTimeout(
      (signal) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted")))),
      50,
    ),
    /aborted/,
  );
});

test("withTimeout passes through on fast resolve", async () => {
  const out = await withTimeout(async () => "ok", 100);
  assert.strictEqual(out, "ok");
});
```

**Step 3: Write failing test for `withRetry`**

```ts
test("withRetry retries on transient failure and succeeds", async () => {
  let calls = 0;
  const out = await withRetry(
    async () => { calls++; if (calls < 2) throw new Error("flake"); return 42; },
    { maxRetries: 3, isRetryable: () => true, backoffMs: () => 1 },
  );
  assert.strictEqual(out, 42);
  assert.strictEqual(calls, 2);
});

test("withRetry throws the last error after maxRetries", async () => {
  await assert.rejects(
    withRetry(
      async () => { throw new Error("boom"); },
      { maxRetries: 2, isRetryable: () => true, backoffMs: () => 1 },
    ),
    /boom/,
  );
});
```

**Step 4: Implement helpers**

`src/ksef/http-helpers.ts`:
```ts
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryOptions {
  maxRetries: number;
  isRetryable: (err: unknown) => boolean;
  backoffMs?: (attempt: number) => number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const backoff = opts.backoffMs ?? ((a) => 2 ** a * 1000);
  let lastError: unknown;
  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!opts.isRetryable(err)) throw err;
      if (attempt < opts.maxRetries - 1) {
        await new Promise((r) => setTimeout(r, backoff(attempt)));
      }
    }
  }
  throw lastError ?? new Error("retries exhausted");
}
```

**Step 5: Run helper tests**

Run: `pnpm test -- --test-name-pattern="withTimeout|withRetry"`
Expected: PASS.

**Step 6: Rewrite `ksefFetch`, `ksefFetchBinary`, `ksefFetchXml`**

Keep `KsefApiError` as the non-retryable terminal error. Wrap each
fetch as:
```ts
return withRetry(
  () => withTimeout(
    (signal) => fetch(url, { ...init, signal }).then(handleResponse),
    KSEF_HTTP_CONFIG.requestTimeoutMs,
  ),
  {
    maxRetries: KSEF_HTTP_CONFIG.maxRetries,
    isRetryable: (e) => !(e instanceof KsefApiError),
  },
);
```

Preserve the 429 handling in `ksefFetch` (the `Retry-After`-driven
sleep). `ksefFetchBinary` and `ksefFetchXml` gain retry coverage
they did not have.

**Step 7: Rewrite `exporter.ts` poll inner fetch**

In `pollExportStatus`, wrap the inner `ksefFetch` call in
`withRetry` (or simply rely on `ksefFetch`'s built-in retry now that
it goes through `withRetry`). Confirm a transient network blip no
longer terminates the poll.

**Step 8: Remove duplicated constants**

Delete local `MAX_RETRIES` / `REQUEST_TIMEOUT_MS` in `client.ts`,
`auth.ts`, `exporter.ts`. Import from `./config.js`.

**Step 9: Run full suite**

Run: `pnpm test`
Expected: 122/122 + new helper tests pass.

**Step 10: Commit**

```bash
git add src/ksef/http-helpers.ts src/ksef/config.ts \
        src/ksef/client.ts src/ksef/auth.ts src/ksef/exporter.ts \
        tests/ksef/http-helpers.test.ts
git commit -m "refactor(ksef): extract withTimeout/withRetry; unify HTTP config"
```

---

## Task 11: Consolidate `InvoiceAction` / `KsefEnv` / `NIP` Zod schemas

Fix-list item 10. Reference: review §4.9.

Today: `schemas.ts` defines all three as the canonical Zod enums;
`invoices.ts:30-39` redeclares invoice status literals inline;
`tenants.ts:23-24` redeclares `NIP` and `KSEF_ENV`.

**Files:**
- Modify: `src/api/routes/invoices.ts` (import from schemas.ts)
- Modify: `src/api/routes/tenants.ts` (import from schemas.ts)
- Optionally extend: `src/api/openapi/schemas.ts` (add
  `InvoiceListQuery` if not already present, so both the route and
  the OpenAPI doc share the same schema)

**Step 1: Inventory**

Read `src/api/openapi/schemas.ts` — confirm `Nip`, `KsefEnv`,
`InvoiceStatus`, `InvoiceAction` are already exported. Note the
exact export names (case may differ from what routes declared
locally).

**Step 2: Migrate `tenants.ts`**

Replace the local `NIP` and `KSEF_ENV` at `tenants.ts:23-24` with:
```ts
import { Nip, KsefEnv } from "../openapi/schemas.js";
```
Update references (`NIP` → `Nip`, `KSEF_ENV` → `KsefEnv`). All local
`createTenantSchema` / `patchTenantSchema` now reference these
imports.

**Step 3: Migrate `invoices.ts`**

`invoices.ts:30-39` defines `listQuerySchema` inline. Extract an
`InvoiceListQuery` Zod schema to `schemas.ts` (so the OpenAPI doc
stays accurate) and import it:
```ts
export const InvoiceListQuery = z.object({
  status: InvoiceStatus.optional(),
  nip: z.string().max(20).optional(),
  dateFrom: DateStr.optional(),
  dateTo: DateStr.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
}).openapi("InvoiceListQuery");
```

Then `invoices.ts:30-39` becomes:
```ts
import { InvoiceListQuery } from "../openapi/schemas.js";
// ...
const query = InvoiceListQuery.parse(
  Object.fromEntries(new URL(c.req.url).searchParams),
);
```

Similar for any action enum used in the transition endpoint — import
`InvoiceAction` rather than re-declaring.

**Step 4: Run tests**

Run: `pnpm test`
Expected: 122/122 pass (same shapes, one source of truth).

**Step 5: Commit**

```bash
git add src/api/routes/invoices.ts \
        src/api/routes/tenants.ts \
        src/api/openapi/schemas.ts
git commit -m "refactor(api): consolidate NIP/KsefEnv/InvoiceStatus/InvoiceAction schemas"
```

---

## Task 12: Validate `parsedData` on read

Fix-list item 11. Reference: review §2.8.

Today `invoices.ts:194` does `row.parsedData as InvoiceFa3` with no
runtime shape check. A row written by an older parser version can
slip into the HTML/PDF renderer and crash deep in a component.

**Files:**
- Modify: `src/ksef/types.ts` (export a Zod schema for `InvoiceFa3`
  or, if too large, a narrower top-level "has required fields"
  schema)
- Modify: `src/api/routes/invoices.ts:194` (validate on read)

**Step 1: Decide scope**

Check the size of the `InvoiceFa3` type. A full mirroring Zod schema
may be 200+ lines and duplicate the parser output. **YAGNI** — the
review calls out "at minimum log a warning when top-level required
fields are missing." Do the narrower version.

**Step 2: Add a narrow top-level schema**

In `src/ksef/types.ts` (or a new `src/ksef/invoice-fa3-schema.ts`):
```ts
import { z } from "zod";

// Minimal top-level shape assertion for rows written by earlier parser
// versions. Fails loudly if required fields were never populated.
export const InvoiceFa3ShapeCheck = z.object({
  ksefNumber: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  issueDate: z.string().nullable(),
  seller: z.unknown(), // deeper validation is parser's job
  buyer: z.unknown(),
  lineItems: z.array(z.unknown()),
}).passthrough();
```

**Step 3: Modify invoices.ts**

`invoices.ts:194`:
```ts
// Before:
return { ksefNumber: row.ksefNumber, parsed: row.parsedData as InvoiceFa3 };

// After:
const shapeCheck = InvoiceFa3ShapeCheck.safeParse(row.parsedData);
if (!shapeCheck.success) {
  c.get("logger").warn(
    { issues: shapeCheck.error.issues, invoiceId: row.id },
    "parsedData failed shape check; falling through to renderer anyway",
  );
}
return { ksefNumber: row.ksefNumber, parsed: row.parsedData as InvoiceFa3 };
```

The cast is kept (downstream types need it) but we now get a log
line when shape drift exists. Future work can escalate the warn to
a 500 once all old rows are migrated.

**Step 4: Run tests**

Run: `pnpm test`
Expected: 122/122 pass. No behavioral change on good data.

**Step 5: Commit**

```bash
git add src/ksef/types.ts src/api/routes/invoices.ts
git commit -m "feat(api): shape-check parsedData on invoice read; log drift"
```

---

## Done criteria

- `pnpm test` → 122 + new tests pass (expect ~140 after).
- `git log --oneline` shows 12 focused commits, one per task.
- `grep -rn "as any\|: any\b" src/` shows only the two eslint-disabled
  lines in `pdf-table.ts` (if Task 2 did not touch them).
- `grep -rn "row!\." src/` returns nothing.
- `grep -rn "\.catch(() => ({}))" src/` returns nothing.
- `grep -rn "Object\.assign(new Error" src/` returns nothing.

## What's NOT in this plan

Tracked for follow-up plans (review §3 structural items):
- Split `parser.ts` into `src/ksef/parser/` sub-modules.
- Extract `src/services/` layer; slim route handlers.
- `TokenStore` abstraction for `ksef/auth.ts`.

Deferred unless triggered (review §6 defer list):
- Zod-validate KSeF error envelope in `client.ts:62`.
- Typed `KsefError` hierarchy.
- Passphrase buffer-wipe in `xades.ts`.
