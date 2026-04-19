# FA(3) Parser Extensions & Renderer Parity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse FA(3) fields missing from `InvoiceFa3` (TP, P_6A, P_14_*W tax-in-PLN, rabat display, WZ numbers, FakturaZaliczkowa refs, OkresFa period) and render them in both HTML and PDF renderers so they match the KSeF schema.

**Architecture:** Each new field is added to the parser types, parsed from XML, rendered in both renderers, and tested with the extended fixture. Parser changes go to `src/ksef/parser.ts`, rendering to `src/visualization/pdf-renderer.ts` and `src/visualization/html-renderer.tsx`.

**Tech Stack:** `fast-xml-parser`, `@react-pdf/renderer`, Hono JSX, Node test runner.

---

## Context for implementer

- `src/ksef/parser.ts` uses `fast-xml-parser` with helpers: `findFieldString`, `findFieldNumber`, `findFieldRecord`, `findField`, `toArray`, `isRecord`.
- `src/visualization/pdf-renderer.ts` uses `createElement` as `h` — **no JSX**. Must stay `.ts`.
- `src/visualization/html-renderer.tsx` uses Hono JSX — use `class=` not `className=`.
- Table builders in `./pdf-table.ts`: `tableCell`, `tableRow`, `tableHeader`, `tableContainer`.
- Formatting helpers in `./format.ts`: `fmtDate`, `fmtMoney`, `fmtQty`, `buildAdresLines`.
- PDF renderer has its own `fmtDate`, `fmtMoney`, `fmtMoneyStr`, `fmtQty` defined inline.
- Package manager is `pnpm`. Tests: `pnpm test`. Build: `pnpm build`.
- Test fixtures live in `tests/fixtures/ksef/`. The `sample_fa3_extended.xml` fixture will be extended.
- The `InvoiceFa3` type is the single parsed invoice model used by both renderers.

## File structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/ksef/parser.ts` | Modify | Add TP flag, P_6A per-line date, P_14_*W tax-in-PLN columns, WZ per-line, FakturaZaliczkowa refs, OkresFa period to types and parsing |
| `src/visualization/pdf-renderer.ts` | Modify | Render TP badge, P_6A in line items, tax-in-PLN column in podsumowanieStawek, rabat column in wiersze, WZ in line items, FakturaZaliczkowa section, OkresFa in szczegoly |
| `src/visualization/html-renderer.tsx` | Modify | Same sections as PDF renderer |
| `tests/fixtures/ksef/sample_fa3_extended.xml` | Modify | Add TP, P_6A, P_14_*W, WZ, FakturaZaliczkowa, OkresFa elements |
| `tests/ksef/parser.test.ts` | Modify | Add tests for new parsed fields |

---

### Task 1: Add TP flag and P_6A per-line date to parser

**Files:**
- Modify: `src/ksef/parser.ts`
- Modify: `tests/fixtures/ksef/sample_fa3_extended.xml`

- [ ] **Step 1: Add `tp` to `InvoiceFa3` type**

In `src/ksef/parser.ts`, add to the `InvoiceFa3` interface after `adnotacje`:

```ts
  tp: boolean;
```

- [ ] **Step 2: Add `p6a` to `InvoiceLineItem` type**

In `src/ksef/parser.ts`, add to the `InvoiceLineItem` interface after `stanPrzed`:

```ts
  p6a: string | null;
```

- [ ] **Step 3: Parse TP flag in `parseInvoiceFa3`**

In the return object of `parseInvoiceFa3`, add after `adnotacje`:

```ts
    tp: findFieldString(fa, "TP") === "1",
```

- [ ] **Step 4: Parse P_6A in `parseLineItems`**

In `parseLineItems`, add to the returned object after `stanPrzed`:

```ts
      p6a: findFieldString(row, "P_6A"),
```

- [ ] **Step 5: Update test fixture**

In `tests/fixtures/ksef/sample_fa3_extended.xml`, add `<TP>1</TP>` inside `<Fa>` after `<RodzajFaktury>KOR</RodzajFaktury>`.

Add `<P_6A>2026-04-05</P_6A>` to the first `<FaWiersz>` after `<P_12_Zal_15>1</P_12_Zal_15>`.

- [ ] **Step 6: Update minimal invoice in test**

In `tests/visualization/pdf-renderer.test.ts`, add `tp: false` to the `minimal` object.

- [ ] **Step 7: Run tests**

Run: `pnpm test 2>&1`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/ksef/parser.ts tests/fixtures/ksef/sample_fa3_extended.xml tests/visualization/pdf-renderer.test.ts
git commit -m "feat(parser): add TP flag and P_6A per-line date"
```

---

### Task 2: Add P_14_*W tax-in-PLN to parser

**Files:**
- Modify: `src/ksef/parser.ts`
- Modify: `tests/fixtures/ksef/sample_fa3_extended.xml`

- [ ] **Step 1: Add `kwotaPodatkuPLN` to `TaxSummaryRow`**

In `src/ksef/parser.ts`, add to `TaxSummaryRow` after `kwotaBrutto`:

```ts
  kwotaPodatkuPLN: number | null;
```

- [ ] **Step 2: Update `parseTaxSummary` to read P_14_*W fields**

Update the `VAT_BUCKETS` constant to include a `taxPLN` field:

```ts
const VAT_BUCKETS: ReadonlyArray<{
  net: string;
  tax: string | null;
  taxPLN: string | null;
  label: string;
}> = [
  { net: "P_13_1", tax: "P_14_1", taxPLN: "P_14_1W", label: "23% lub 22%" },
  { net: "P_13_2", tax: "P_14_2", taxPLN: "P_14_2W", label: "8% lub 7%" },
  { net: "P_13_3", tax: "P_14_3", taxPLN: "P_14_3W", label: "5%" },
  { net: "P_13_4", tax: "P_14_4", taxPLN: "P_14_4W", label: "4% lub 3%" },
  { net: "P_13_5", tax: "P_14_5", taxPLN: "P_14_5W", label: "OSS" },
  { net: "P_13_6_1", tax: null, taxPLN: null, label: "0% (krajowe)" },
  { net: "P_13_6_2", tax: null, taxPLN: null, label: "0% WDT" },
  { net: "P_13_6_3", tax: null, taxPLN: null, label: "0% eksport" },
  { net: "P_13_7", tax: null, taxPLN: null, label: "zwolnione od podatku" },
  { net: "P_13_8", tax: null, taxPLN: null, label: "np. z wył. art. 100 ust. 1 pkt 4" },
  { net: "P_13_9", tax: null, taxPLN: null, label: "np. art. 100 ust. 1 pkt 4" },
  { net: "P_13_10", tax: null, taxPLN: null, label: "odwrotne obciążenie" },
  { net: "P_13_11", tax: null, taxPLN: null, label: "marża" },
];
```

In `parseTaxSummary`, read the PLN tax field:

```ts
    const taxPLN = bucket.taxPLN ? findFieldNumber(fa, bucket.taxPLN) : null;
    // ... existing logic ...
    rows.push({
      lp: lp++,
      label: bucket.label,
      kwotaNetto: netVal,
      kwotaPodatku: taxVal,
      kwotaBrutto: netVal + taxVal,
      kwotaPodatkuPLN: taxPLN,
    });
```

- [ ] **Step 3: Update test fixture**

In `tests/fixtures/ksef/sample_fa3_extended.xml`, add after `<P_14_1>184.00</P_14_1>`:

```xml
    <P_14_1W>793.96</P_14_1W>
```

And after `<P_14_2>16.00</P_14_2>`:

```xml
    <P_14_2W>69.00</P_14_2W>
```

- [ ] **Step 4: Run tests**

Run: `pnpm test 2>&1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ksef/parser.ts tests/fixtures/ksef/sample_fa3_extended.xml
git commit -m "feat(parser): add P_14_*W tax-in-PLN to tax summary"
```

---

### Task 3: Add rabat, WZ, FakturaZaliczkowa refs, and OkresFa to parser

**Files:**
- Modify: `src/ksef/parser.ts`
- Modify: `tests/fixtures/ksef/sample_fa3_extended.xml`

- [ ] **Step 1: Add `wz` to `InvoiceLineItem`**

In `src/ksef/parser.ts`, add to `InvoiceLineItem` after `p6a`:

```ts
  wz: string | null;
```

- [ ] **Step 2: Add `FakturaZaliczkowaRef` interface and fields to `InvoiceFa3`**

Add new interface after `DaneFaKorygowanej`:

```ts
export interface FakturaZaliczkowaRef {
  numer: string | null;
  dataWystawienia: string | null;
  nrKsef: string | null;
}
```

Add to `InvoiceFa3` after `stopka`:

```ts
  fakturaZaliczkowa: FakturaZaliczkowaRef[];
  okresFa: string | null;
```

- [ ] **Step 3: Parse WZ in `parseLineItems`**

In the returned object of `parseLineItems`, add after `p6a`:

```ts
      wz: findFieldString(row, "WZ"),
```

- [ ] **Step 4: Add `parseFakturaZaliczkowa` function**

Add after `parseDaneFaKorygowanej`:

```ts
function parseFakturaZaliczkowa(fa: Record<string, unknown>): FakturaZaliczkowaRef[] {
  return toArray(findField(fa, "ZamowienieWi662"))
    .filter(isRecord)
    .map((n) => ({
      numer: findFieldString(n, "NrZamowienia") ?? findFieldString(n, "NrWZ"),
      dataWystawienia: findFieldString(n, "DataZamowienia"),
      nrKsef: findFieldString(n, "NrKSeF"),
    }));
}
```

- [ ] **Step 5: Parse OkresFa and FakturaZaliczkowa in `parseInvoiceFa3`**

In the return object, add after `stopka`:

```ts
    fakturaZaliczkowa: parseFakturaZaliczkowa(fa),
    okresFa: findFieldString(fa, "OkresFa"),
```

- [ ] **Step 6: Add `FakturaZaliczkowa` to isArray list**

In the XMLParser config's `isArray` callback, add `"ZamowienieWi662"` to the list.

- [ ] **Step 7: Update test fixture**

In `tests/fixtures/ksef/sample_fa3_extended.xml`:

Add `<OkresFa>2026-04-01/2026-04-30</OkresFa>` inside `<Fa>` after `<P_6>`.

Add `<WZ>WZ/2026/04/001</WZ>` to the first `<FaWiersz>` after `<P_12_Zal_15>`.

- [ ] **Step 8: Update minimal invoice in test**

In `tests/visualization/pdf-renderer.test.ts`, add to the `minimal` object:

```ts
    fakturaZaliczkowa: [],
    okresFa: null,
```

- [ ] **Step 9: Run tests**

Run: `pnpm test 2>&1`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/ksef/parser.ts tests/fixtures/ksef/sample_fa3_extended.xml tests/visualization/pdf-renderer.test.ts
git commit -m "feat(parser): add WZ, FakturaZaliczkowa refs, and OkresFa"
```

---

### Task 4: Render new fields in PDF renderer

**Files:**
- Modify: `src/visualization/pdf-renderer.ts`

- [ ] **Step 1: Add TP badge after invoice type label in `naglowek`**

In `naglowek()`, after the `naglowekRodzaj` line, add:

```ts
      invoice.tp
        ? h(Text, { style: { fontSize: 7, color: "#b71c1c" } }, "Podmiot powiązany (TP)")
        : null,
```

- [ ] **Step 2: Add rabat and P_6A columns to `wiersze`**

In the `wiersze()` function, detect if any line has rabat or p6a:

```ts
  const hasRabat = invoice.lineItems.some((r) => r.rabat != null);
```

Add rabat column header after "Stawka" (before "Wartość netto"):

```ts
    ...(hasRabat ? [tableCell("Rabat %", { width: "8%", align: "right", isHeader: true })] : []),
```

Add rabat cell in data rows at the same position:

```ts
    ...(hasRabat ? [tableCell(r.rabat != null ? `${r.rabat}%` : "—", { width: "8%", align: "right" })] : []),
```

Adjust `nazwaSz` to account for the extra column:
```ts
  const nazwaSz = hasGtu && hasRabat ? "20%" : hasGtu ? "28%" : hasRabat ? "28%" : "36%";
```

If P_6A is present on a line, append it to the nazwa text:
```ts
    const nazwaText = [
      item.nazwa ?? "—",
      item.p12Zal15 ? "[zał. 15]" : null,
      item.stanPrzed ? "[stan przed]" : null,
      item.p6a ? `[dostawa: ${fmtDate(item.p6a)}]` : null,
    ].filter(Boolean).join(" ");
```

- [ ] **Step 3: Add tax-in-PLN column to `podsumowanieStawek`**

Detect if any row has `kwotaPodatkuPLN`:

```ts
  const hasPLN = rows.some((r) => r.kwotaPodatkuPLN != null);
```

If `hasPLN`, add an extra header column and data column:

```ts
    ...(hasPLN ? [tableCell("VAT (PLN)", { width: "18%", align: "right", isHeader: true })] : []),
```

Adjust other column widths when hasPLN is true:
- Lp: 6%, Stawka: 20%, Netto: 18%, VAT: 18%, VAT PLN: 18%, Brutto: 20%
- vs. current: Lp: 8%, Stawka: 24%, Netto: 22%, VAT: 22%, Brutto: 24%

- [ ] **Step 4: Add WZ display in line items**

Append WZ to the nazwa text in `wiersze()`:

```ts
      item.wz ? `[WZ: ${item.wz}]` : null,
```

- [ ] **Step 5: Add OkresFa to `szczegoly`**

In `szczegoly()`, add after the saleDate row:

```ts
  if (invoice.okresFa) rows.push(dlRow("Okres dostawy:", invoice.okresFa, true));
```

- [ ] **Step 6: Run tests**

Run: `pnpm test 2>&1`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/visualization/pdf-renderer.ts
git commit -m "feat(viz): render TP, rabat, P_6A, WZ, tax-in-PLN, OkresFa in PDF"
```

---

### Task 5: Render new fields in HTML renderer

**Files:**
- Modify: `src/visualization/html-renderer.tsx`

- [ ] **Step 1: Add TP badge in `Naglowek`**

In `Naglowek`, after the `ksef-naglowek__rodzaj` div, add:

```tsx
          {invoice.tp ? (
            <div style="font-size: 8pt; color: #b71c1c;">Podmiot powiązany (TP)</div>
          ) : null}
```

- [ ] **Step 2: Add rabat column and P_6A to `Wiersze`**

Detect `hasRabat`:

```tsx
  const hasRabat = lineItems.some((r) => r.rabat != null);
```

Add `<th class="num">Rabat %</th>` header when `hasRabat`.

Add rabat cell in data rows:

```tsx
                {hasRabat ? <td class="num">{row.rabat != null ? `${row.rabat}%` : "—"}</td> : null}
```

Append P_6A info to the name cell when present:

```tsx
                  {row.p6a ? <span class="ksef-note"> [dostawa: {fmtDate(row.p6a)}]</span> : null}
```

- [ ] **Step 3: Add tax-in-PLN column to `PodsumowanieStawek`**

Detect `hasPLN`:

```tsx
  const hasPLN = taxSummary.some((r) => r.kwotaPodatkuPLN != null);
```

Add column header and data cells when `hasPLN`.

- [ ] **Step 4: Add WZ to line items**

Append WZ info to the name cell:

```tsx
                  {row.wz ? <span class="ksef-note"> [WZ: {row.wz}]</span> : null}
```

- [ ] **Step 5: Add OkresFa to `Szczegoly`**

In `Szczegoly`, add after the saleDate entry:

```tsx
        {invoice.okresFa ? (
          <>
            <dt>Okres dostawy / usługi</dt>
            <dd>{invoice.okresFa}</dd>
          </>
        ) : null}
```

- [ ] **Step 6: Run tests**

Run: `pnpm test 2>&1`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/visualization/html-renderer.tsx
git commit -m "feat(viz): render TP, rabat, P_6A, WZ, tax-in-PLN, OkresFa in HTML"
```

---

### Task 6: Add parser tests for new fields

**Files:**
- Modify: `tests/ksef/parser.test.ts`

- [ ] **Step 1: Add test for TP flag**

```ts
test("parseInvoiceFa3 parses TP flag from extended fixture", () => {
  const xml = loadFixture("sample_fa3_extended.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-TP");
  assert.strictEqual(invoice.tp, true);
});
```

- [ ] **Step 2: Add test for P_6A per-line date**

```ts
test("parseInvoiceFa3 parses P_6A per-line date from extended fixture", () => {
  const xml = loadFixture("sample_fa3_extended.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-P6A");
  assert.strictEqual(invoice.lineItems[0].p6a, "2026-04-05");
  assert.strictEqual(invoice.lineItems[1].p6a, null);
});
```

- [ ] **Step 3: Add test for P_14_*W tax-in-PLN**

```ts
test("parseInvoiceFa3 parses P_14_*W tax-in-PLN from extended fixture", () => {
  const xml = loadFixture("sample_fa3_extended.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-PLN");
  const row23 = invoice.taxSummary.find((r) => r.label.startsWith("23%"));
  assert.ok(row23);
  assert.strictEqual(row23!.kwotaPodatkuPLN, 793.96);
});
```

- [ ] **Step 4: Add test for WZ**

```ts
test("parseInvoiceFa3 parses WZ from extended fixture", () => {
  const xml = loadFixture("sample_fa3_extended.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-WZ");
  assert.strictEqual(invoice.lineItems[0].wz, "WZ/2026/04/001");
  assert.strictEqual(invoice.lineItems[1].wz, null);
});
```

- [ ] **Step 5: Add test for OkresFa**

```ts
test("parseInvoiceFa3 parses OkresFa from extended fixture", () => {
  const xml = loadFixture("sample_fa3_extended.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-OKRES");
  assert.strictEqual(invoice.okresFa, "2026-04-01/2026-04-30");
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm test 2>&1`
Expected: PASS

- [ ] **Step 7: Run build**

Run: `pnpm build 2>&1`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add tests/ksef/parser.test.ts
git commit -m "test(parser): add tests for TP, P_6A, P_14_*W, WZ, OkresFa fields"
```
