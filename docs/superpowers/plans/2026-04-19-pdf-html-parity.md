# PDF–HTML Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all sections present in the HTML renderer but missing from the PDF renderer — CorrectionReason, AdditionalInfo, Rozliczenie tables (obciazenia/odliczenia), daneRejestrowe in party cards, Lp. column in PodsumowanieStawek, and kodUE/nrVatUE in parties — so both renderers produce visually equivalent output.

**Architecture:** Each missing section is added as a new function in `pdf-renderer.ts` following the existing pattern (`createElement` as `h`, no JSX). The `buildDocument` function gains the new sections in the same order as the HTML renderer's `InvoiceHtml`. Already-parsed fields (`additionalInfo`, `correctionReason`, `rozliczenie.obciazenia/odliczenia`, `daneRejestrowe`, `kodUE/nrVatUE`) are used directly — no parser changes needed.

**Tech Stack:** `@react-pdf/renderer`, React `createElement`, existing `pdf-table.ts` builders, Node test runner.

---

## Context for implementer

- `src/visualization/pdf-renderer.ts` uses `createElement` as `h` — **no JSX**. The `tsconfig.json` sets `jsxImportSource: "hono/jsx"`, so `.tsx` files get Hono's factory. This file MUST stay `.ts`.
- Table builders are imported from `./pdf-table.js`: `tableCell`, `tableRow`, `tableHeader`, `tableContainer`.
- Formatting helpers are defined at the top of the file: `fmtDate`, `fmtMoney`, `fmtMoneyStr`, `fmtQty`.
- The `dlRow(label, value, two?)` helper renders a definition-list row (label+value in a flex row).
- The `sectionTitle(text)` helper renders a gray section heading bar.
- Package manager is `pnpm`. Tests: `pnpm test`. Build: `pnpm build`.
- Test fixtures live in `tests/fixtures/ksef/`. The `sample_fa3_extended.xml` fixture already contains `DodatkowyOpis`, `Rozliczenie` with `Obciazenia`/`Odliczenia`, `DaneRejestrowe`, and correction data (`RodzajFaktury=KOR`, `PrzyczynaKorekty` is not in fixture but `correctionReason` is parsed from `Fa.PrzyczynaKorekty`).
- The `InvoiceFa3` type (in `src/ksef/parser.ts`) already has all the fields we need: `correctionReason`, `additionalInfo`, `rozliczenie.obciazenia`/`rozliczenie.odliczenia`, party `daneRejestrowe`, `kodUE`/`nrVatUE`.

## File structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/visualization/pdf-renderer.ts` | Modify | Add `correctionReason()`, `additionalInfo()` functions; expand `rozliczenie()` with obciazenia/odliczenia tables; expand `podmiotCard()` with daneRejestrowe + kodUE/nrVatUE; add Lp. column to `podsumowanieStawek()`; fix section order in `buildDocument()` |
| `tests/visualization/pdf-renderer.test.ts` | Modify | Add regression tests that verify PDFs render without error for the extended fixture (which has all these sections) |
| `tests/fixtures/ksef/sample_fa3_extended.xml` | Modify | Add `PrzyczynaKorekty` element and `KodUE`/`NrVatUE` on Podmiot2 to exercise the new sections |

---

### Task 1: Add `PrzyczynaKorekty` and `KodUE`/`NrVatUE` to the test fixture

**Files:**
- Modify: `tests/fixtures/ksef/sample_fa3_extended.xml`

- [ ] **Step 1: Add PrzyczynaKorekty to the fixture**

In `tests/fixtures/ksef/sample_fa3_extended.xml`, inside the `<Fa>` element, after the `<OkresFaKorygowanej>` line (line 115), add:

```xml
    <PrzyczynaKorekty>Błędna cena jednostkowa w pozycji 1</PrzyczynaKorekty>
```

- [ ] **Step 2: Add KodUE and NrVatUE to Podmiot2**

In the same fixture, inside `<Podmiot2>` after `<DaneIdentyfikacyjne>`, add EU VAT fields. Replace the `<DaneIdentyfikacyjne>` block (around lines 55-58) with:

```xml
    <DaneIdentyfikacyjne>
      <NIP>6808208874</NIP>
      <KodUE>PL</KodUE>
      <NrVatUE>6808208874</NrVatUE>
      <Nazwa>Jednostka Samorządu Terytorialnego — Test</Nazwa>
    </DaneIdentyfikacyjne>
```

- [ ] **Step 3: Run tests to verify fixture still parses correctly**

Run: `pnpm test 2>&1`
Expected: All tests PASS (the extended fixture is already used by existing tests)

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/ksef/sample_fa3_extended.xml
git commit -m "test: add PrzyczynaKorekty and KodUE/NrVatUE to extended fixture"
```

---

### Task 2: Add `correctionReason` section to PDF renderer

**Files:**
- Modify: `src/visualization/pdf-renderer.ts`

- [ ] **Step 1: Add the `correctionReason` function**

Add this function after the `daneFaKorygowanej` function (after line 202):

```ts
function correctionReasonSection(invoice: InvoiceFa3): ReactElement | null {
  const reason = invoice.correctionReason ?? invoice.przyczynaKorekty;
  if (!reason) return null;
  return h(
    View,
    { style: styles.section, wrap: false },
    sectionTitle("Przyczyna korekty"),
    h(Text, { style: { fontStyle: "italic", fontSize: 8 } }, reason),
  );
}
```

- [ ] **Step 2: Add it to `buildDocument` after `daneFaKorygowanej`**

In the `buildDocument` function, add `correctionReasonSection(invoice)` right after `daneFaKorygowanej(invoice)`:

```ts
      naglowek(invoice),
      daneFaKorygowanej(invoice),
      correctionReasonSection(invoice),
      podmioty(invoice),
```

- [ ] **Step 3: Run tests**

Run: `pnpm test 2>&1`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/visualization/pdf-renderer.ts
git commit -m "feat(viz): add correctionReason section to PDF renderer"
```

---

### Task 3: Add `additionalInfo` section to PDF renderer

**Files:**
- Modify: `src/visualization/pdf-renderer.ts`

- [ ] **Step 1: Add the `additionalInfoSection` function**

Add this function after the `stopka` function (before `buildDocument`):

```ts
function additionalInfoSection(invoice: InvoiceFa3): ReactElement | null {
  if (invoice.additionalInfo.length === 0) return null;

  const headerCells = [
    tableCell("Lp.", { width: "8%", isHeader: true }),
    tableCell("Klucz", { width: "42%", isHeader: true }),
    tableCell("Wartość", { width: "50%", isHeader: true }),
  ];

  const dataRows = invoice.additionalInfo.map((row, i) =>
    tableRow([
      tableCell(String(row.lp), { width: "8%" }),
      tableCell(row.rodzaj, { width: "42%" }),
      tableCell(row.tresc, { width: "50%" }),
    ], { index: i }),
  );

  return h(
    View,
    { style: styles.section },
    sectionTitle("Informacje dodatkowe"),
    tableContainer(tableHeader(headerCells), dataRows),
  );
}
```

- [ ] **Step 2: Add it to `buildDocument` after `stopka`**

In the `buildDocument` function, add `additionalInfoSection(invoice)` as the last section:

```ts
      warunkiTransakcji(invoice),
      stopka(invoice),
      additionalInfoSection(invoice),
```

- [ ] **Step 3: Run tests**

Run: `pnpm test 2>&1`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/visualization/pdf-renderer.ts
git commit -m "feat(viz): add additionalInfo section to PDF renderer"
```

---

### Task 4: Add obciazenia/odliczenia tables to `rozliczenie` in PDF renderer

**Files:**
- Modify: `src/visualization/pdf-renderer.ts`

- [ ] **Step 1: Replace the `rozliczenie` function**

Replace the entire `rozliczenie` function with:

```ts
function rozliczenie(invoice: InvoiceFa3): ReactElement | null {
  const rozl = invoice.rozliczenie;
  if (!rozl) return null;
  const { sumaObciazen, sumaOdliczen, doZaplaty, doRozliczenia } = rozl;
  const hasEntries = rozl.obciazenia.length > 0 || rozl.odliczenia.length > 0;
  if (!hasEntries && sumaObciazen == null && sumaOdliczen == null && doZaplaty == null && doRozliczenia == null) return null;
  const currency = invoice.currency;

  const parts: (ReactElement | null)[] = [];

  if (rozl.obciazenia.length > 0) {
    parts.push(h(Text, { style: styles.bankTitle }, "Obciążenia"));
    parts.push(
      tableContainer(
        tableHeader([
          tableCell("Kwota", { width: "35%", align: "right", isHeader: true }),
          tableCell("Powód", { width: "65%", isHeader: true }),
        ]),
        rozl.obciazenia.map((o, i) =>
          tableRow([
            tableCell(fmtMoney(o.kwota, currency), { width: "35%", align: "right" }),
            tableCell(o.powod ?? "—", { width: "65%" }),
          ], { index: i }),
        ),
      ),
    );
  }

  if (rozl.odliczenia.length > 0) {
    parts.push(h(Text, { style: [styles.bankTitle, { marginTop: 3 }] }, "Odliczenia"));
    parts.push(
      tableContainer(
        tableHeader([
          tableCell("Kwota", { width: "35%", align: "right", isHeader: true }),
          tableCell("Powód", { width: "65%", isHeader: true }),
        ]),
        rozl.odliczenia.map((o, i) =>
          tableRow([
            tableCell(fmtMoney(o.kwota, currency), { width: "35%", align: "right" }),
            tableCell(o.powod ?? "—", { width: "65%" }),
          ], { index: i }),
        ),
      ),
    );
  }

  const dlRows: ReactElement[] = [];
  if (sumaObciazen != null) dlRows.push(dlRow("Suma obciążeń:", fmtMoney(sumaObciazen, currency), true));
  if (sumaOdliczen != null) dlRows.push(dlRow("Suma odliczeń:", fmtMoney(sumaOdliczen, currency), true));
  if (doZaplaty != null) dlRows.push(dlRow("Do zapłaty:", fmtMoney(doZaplaty, currency), true));
  if (doRozliczenia != null) dlRows.push(dlRow("Do rozliczenia:", fmtMoney(doRozliczenia, currency), true));

  return h(
    View,
    { style: styles.section },
    sectionTitle("Rozliczenie"),
    ...parts.filter(Boolean),
    ...dlRows,
  );
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm test 2>&1`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/visualization/pdf-renderer.ts
git commit -m "feat(viz): add obciazenia/odliczenia tables to PDF rozliczenie"
```

---

### Task 5: Add `daneRejestrowe` and `kodUE`/`nrVatUE` to `podmiotCard`

**Files:**
- Modify: `src/visualization/pdf-renderer.ts`

- [ ] **Step 1: Add kodUE/nrVatUE rendering in `podmiotCard`**

In the `podmiotCard` function, after the line that renders `nrEORI` (around line 227), add:

```ts
  const vatUeParts = [p.kodUE, p.nrVatUE].filter((x): x is string => x !== null && x.trim() !== "");
  if (vatUeParts.length > 0) body.push(row("VAT UE:", vatUeParts.join(" ")));
```

- [ ] **Step 2: Add daneRejestrowe rendering in `podmiotCard`**

At the end of the `body` building section in `podmiotCard` (after the `statusInfoPodatnika` block, before the `return` statement), add:

```ts
  if (p.daneRejestrowe) {
    if (p.daneRejestrowe.nazwaPelna) body.push(row("Pełna nazwa:", p.daneRejestrowe.nazwaPelna));
    if (p.daneRejestrowe.krs) body.push(row("KRS:", p.daneRejestrowe.krs));
    if (p.daneRejestrowe.regon) body.push(row("REGON:", p.daneRejestrowe.regon));
  }
```

- [ ] **Step 3: Run tests**

Run: `pnpm test 2>&1`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/visualization/pdf-renderer.ts
git commit -m "feat(viz): add daneRejestrowe and kodUE/nrVatUE to PDF party cards"
```

---

### Task 6: Add Lp. column to `podsumowanieStawek`

**Files:**
- Modify: `src/visualization/pdf-renderer.ts`

- [ ] **Step 1: Update the `podsumowanieStawek` function**

Replace the headerCells and dataRows in `podsumowanieStawek` with:

```ts
  const headerCells = [
    tableCell("Lp.", { width: "8%", isHeader: true }),
    tableCell("Stawka", { width: "24%", isHeader: true }),
    tableCell("Netto", { width: "22%", align: "right", isHeader: true }),
    tableCell("VAT", { width: "22%", align: "right", isHeader: true }),
    tableCell("Brutto", { width: "24%", align: "right", isHeader: true }),
  ];

  const dataRows = rows.map((r, i) =>
    tableRow([
      tableCell(String(r.lp), { width: "8%" }),
      tableCell(r.label, { width: "24%" }),
      tableCell(fmtMoney(r.kwotaNetto, currency), { width: "22%", align: "right" }),
      tableCell(fmtMoney(r.kwotaPodatku, currency), { width: "22%", align: "right" }),
      tableCell(fmtMoney(r.kwotaBrutto, currency), { width: "24%", align: "right" }),
    ], { index: i }),
  );
```

- [ ] **Step 2: Run tests**

Run: `pnpm test 2>&1`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/visualization/pdf-renderer.ts
git commit -m "feat(viz): add Lp. column to PDF podsumowanieStawek"
```

---

### Task 7: Verify full parity and add regression test

**Files:**
- Modify: `tests/visualization/pdf-renderer.test.ts`

- [ ] **Step 1: Add a parity regression test**

Add to `tests/visualization/pdf-renderer.test.ts`:

```ts
test("renderInvoicePdf extended fixture exercises all parity sections", async () => {
  const xml = loadFixture("sample_fa3_extended.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-PARITY");
  // Verify preconditions: the fixture has the sections we added
  assert.ok(invoice.correctionReason, "fixture must have correctionReason");
  assert.ok(invoice.additionalInfo.length > 0, "fixture must have additionalInfo");
  assert.ok(invoice.rozliczenie, "fixture must have rozliczenie");
  assert.ok(invoice.rozliczenie!.obciazenia.length > 0, "fixture must have obciazenia");
  assert.ok(invoice.rozliczenie!.odliczenia.length > 0, "fixture must have odliczenia");
  assert.ok(invoice.seller.daneRejestrowe, "fixture seller must have daneRejestrowe");

  const buf = await renderInvoicePdf(invoice);
  assertValidPdf(buf, "parity regression");
  assert.ok(buf.length > 4096, "PDF with all sections should be substantial");
});
```

- [ ] **Step 2: Run full test suite**

Run: `pnpm test 2>&1`
Expected: PASS

- [ ] **Step 3: Build check**

Run: `pnpm build 2>&1`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add tests/visualization/pdf-renderer.test.ts
git commit -m "test(viz): add PDF-HTML parity regression test"
```
