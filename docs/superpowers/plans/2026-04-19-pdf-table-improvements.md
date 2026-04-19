# PDF Table Improvements — @react-pdf/renderer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract reusable table primitives from the PDF renderer to eliminate repetitive flex-row boilerplate, add proper cell borders, zebra striping, and consistent alignment — bringing the PDF table output closer to the HTML renderer's quality.

**Architecture:** Extract a small set of builder functions (`table`, `thead`, `trow`, `tcell`) into `src/visualization/pdf-table.ts`. These wrap `@react-pdf/renderer`'s `View` and `Text` with pre-configured styles for borders, padding, alignment, and alternating row colors. Then refactor `pdf-renderer.ts` to use these builders, reducing each table from ~30 lines of inline style arrays to ~5 declarative calls. No new dependencies — pure `@react-pdf/renderer`.

**Tech Stack:** `@react-pdf/renderer` (existing), React `createElement` (no JSX — Hono JSX factory conflict), Node test runner.

---

## Context for implementer

- `src/visualization/pdf-renderer.ts` uses `createElement` as `h` — **no JSX**. The project's `tsconfig.json` sets `jsxImportSource: "hono/jsx"`, so any `.tsx` file gets Hono's factory. The PDF renderer must stay as `.ts` with explicit `h()` calls.
- Tables in the current renderer are built with `View` + `flexDirection: "row"` + percentage widths. This is the only way `@react-pdf/renderer` supports tabular layout — there is no `<table>` element.
- The HTML renderer (`html-renderer.tsx`) uses real `<table>` elements with `thead`, `th`, `td`, borders, `.num` class for right-alignment, and zebra striping implied by borders. The PDF should match this visual output.
- Existing tests in `tests/visualization/pdf-renderer.test.ts` are smoke tests (valid PDF output). The new table module gets its own unit tests.

## Key improvements over current code

1. **Cell borders on all sides** (currently only bottom border on rows)
2. **Zebra striping** on alternating rows for readability
3. **Consistent cell padding** (currently inconsistent between tables)
4. **Right-aligned numeric cells** via a simple `align` option
5. **Header row styling** with bold text and background color
6. **Reusable API** — one place to adjust table look across all invoice sections

## File structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/visualization/pdf-table.ts` | Create | Table builder functions: `tableHeader`, `tableRow`, `tableCell`, `tableContainer` |
| `src/visualization/pdf-renderer.ts` | Modify | Replace inline table View/Text trees with `pdf-table.ts` builders |
| `tests/visualization/pdf-table.test.ts` | Create | Unit tests for table builders (structure, styles, alignment) |
| `tests/visualization/pdf-renderer.test.ts` | Modify | Add regression test for table border/stripe rendering |

---

### Task 1: Create the `pdf-table.ts` table builder module

**Files:**
- Create: `src/visualization/pdf-table.ts`
- Test: `tests/visualization/pdf-table.test.ts`

- [ ] **Step 1: Write the failing test for `tableCell`**

Create `tests/visualization/pdf-table.test.ts`:

```ts
import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { tableCell } from "../../src/visualization/pdf-table.js";

describe("pdf-table", () => {
  describe("tableCell", () => {
    test("returns a ReactElement with Text type", () => {
      const el = tableCell("hello", { width: "30%" });
      assert.ok(el, "must return an element");
      assert.equal(el.type?.name ?? el.type?.displayName ?? el.type, "Text");
    });

    test("applies right alignment for numeric cells", () => {
      const el = tableCell("123.45", { width: "20%", align: "right" });
      const style = Array.isArray(el.props.style) ? el.props.style : [el.props.style];
      const merged = Object.assign({}, ...style);
      assert.equal(merged.textAlign, "right");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --test-name-pattern="pdf-table" 2>&1`
Expected: FAIL — cannot find module `pdf-table.js`

- [ ] **Step 3: Implement `tableCell`**

Create `src/visualization/pdf-table.ts`:

```ts
import { createElement as h, type ReactElement } from "react";
import { Text, View, StyleSheet } from "@react-pdf/renderer";

const baseStyles = StyleSheet.create({
  cell: {
    padding: 2,
    fontSize: 8,
    borderRightWidth: 0.5,
    borderRightColor: "#bbb",
    borderStyle: "solid",
  },
  cellRight: {
    textAlign: "right",
  },
  headerCell: {
    fontFamily: "LiberationSans",
    fontWeight: "bold",
    fontSize: 7.5,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});

export interface CellOptions {
  width: string;
  align?: "left" | "right";
  isHeader?: boolean;
}

export function tableCell(
  text: string,
  opts: CellOptions,
): ReactElement {
  const styles: object[] = [baseStyles.cell, { width: opts.width }];
  if (opts.align === "right") styles.push(baseStyles.cellRight);
  if (opts.isHeader) styles.push(baseStyles.headerCell);
  return h(Text, { style: styles }, text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --test-name-pattern="pdf-table" 2>&1`
Expected: PASS

- [ ] **Step 5: Write the failing test for `tableRow`**

Add to `tests/visualization/pdf-table.test.ts`:

```ts
import { tableCell, tableRow } from "../../src/visualization/pdf-table.js";

describe("tableRow", () => {
  test("returns a View with flexDirection row", () => {
    const cells = [
      tableCell("A", { width: "50%" }),
      tableCell("B", { width: "50%" }),
    ];
    const row = tableRow(cells, { index: 0 });
    assert.ok(row, "must return an element");
    const style = Array.isArray(row.props.style) ? row.props.style : [row.props.style];
    const merged = Object.assign({}, ...style);
    assert.equal(merged.flexDirection, "row");
  });

  test("even rows get zebra background", () => {
    const cells = [tableCell("A", { width: "100%" })];
    const row = tableRow(cells, { index: 0 });
    const style = Array.isArray(row.props.style) ? row.props.style : [row.props.style];
    const merged = Object.assign({}, ...style);
    assert.equal(merged.backgroundColor, "#f7f7f7");
  });

  test("odd rows have no zebra background", () => {
    const cells = [tableCell("A", { width: "100%" })];
    const row = tableRow(cells, { index: 1 });
    const style = Array.isArray(row.props.style) ? row.props.style : [row.props.style];
    const merged = Object.assign({}, ...style);
    assert.equal(merged.backgroundColor, undefined);
  });
});
```

- [ ] **Step 6: Implement `tableRow`**

Add to `src/visualization/pdf-table.ts`:

```ts
const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#bbb",
    borderStyle: "solid",
  },
  zebraEven: {
    backgroundColor: "#f7f7f7",
  },
});

export interface RowOptions {
  index: number;
  wrap?: boolean;
}

export function tableRow(
  cells: ReactElement[],
  opts: RowOptions,
): ReactElement {
  const styles: object[] = [rowStyles.row];
  if (opts.index % 2 === 0) styles.push(rowStyles.zebraEven);
  return h(View, { style: styles, wrap: opts.wrap ?? false }, ...cells);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test -- --test-name-pattern="pdf-table" 2>&1`
Expected: PASS (all tableRow tests)

- [ ] **Step 8: Write the failing test for `tableHeader`**

Add to `tests/visualization/pdf-table.test.ts`:

```ts
import { tableCell, tableRow, tableHeader } from "../../src/visualization/pdf-table.js";

describe("tableHeader", () => {
  test("returns a View with header background color", () => {
    const cells = [
      tableCell("Name", { width: "50%", isHeader: true }),
      tableCell("Value", { width: "50%", isHeader: true }),
    ];
    const header = tableHeader(cells);
    const style = Array.isArray(header.props.style) ? header.props.style : [header.props.style];
    const merged = Object.assign({}, ...style);
    assert.equal(merged.backgroundColor, "#e8e8e8");
  });
});
```

- [ ] **Step 9: Implement `tableHeader`**

Add to `src/visualization/pdf-table.ts`:

```ts
const headerStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    backgroundColor: "#e8e8e8",
    borderBottomWidth: 0.75,
    borderBottomColor: "#888",
    borderStyle: "solid",
  },
});

export function tableHeader(cells: ReactElement[]): ReactElement {
  return h(View, { style: headerStyles.header, minPresenceAhead: 0.05 }, ...cells);
}
```

- [ ] **Step 10: Write the failing test for `tableContainer`**

Add to `tests/visualization/pdf-table.test.ts`:

```ts
import { tableCell, tableRow, tableHeader, tableContainer } from "../../src/visualization/pdf-table.js";

describe("tableContainer", () => {
  test("wraps header and rows in a View with top border", () => {
    const header = tableHeader([tableCell("H", { width: "100%", isHeader: true })]);
    const rows = [tableRow([tableCell("R", { width: "100%" })], { index: 0 })];
    const container = tableContainer(header, rows);
    assert.ok(container, "must return an element");
    const style = Array.isArray(container.props.style) ? container.props.style : [container.props.style];
    const merged = Object.assign({}, ...style);
    assert.equal(merged.borderTopWidth, 0.5);
  });
});
```

- [ ] **Step 11: Implement `tableContainer`**

Add to `src/visualization/pdf-table.ts`:

```ts
const containerStyles = StyleSheet.create({
  table: {
    width: "100%",
    marginTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: "#bbb",
    borderLeftWidth: 0.5,
    borderLeftColor: "#bbb",
    borderStyle: "solid",
  },
});

export function tableContainer(
  header: ReactElement,
  rows: ReactElement[],
): ReactElement {
  return h(View, { style: containerStyles.table }, header, ...rows);
}
```

- [ ] **Step 12: Run all pdf-table tests**

Run: `pnpm test -- --test-name-pattern="pdf-table" 2>&1`
Expected: PASS (all tests)

- [ ] **Step 13: Commit**

```bash
git add src/visualization/pdf-table.ts tests/visualization/pdf-table.test.ts
git commit -m "feat(viz): add reusable PDF table builder with borders, zebra striping, and alignment"
```

---

### Task 2: Refactor `wiersze` (line items table) to use `pdf-table` builders

**Files:**
- Modify: `src/visualization/pdf-renderer.ts` (lines 304–369, the `wiersze` function)
- Test: `tests/visualization/pdf-renderer.test.ts`

- [ ] **Step 1: Run existing PDF tests to confirm baseline**

Run: `pnpm test -- --test-name-pattern="renderInvoicePdf" 2>&1`
Expected: PASS (all 5 existing tests)

- [ ] **Step 2: Refactor `wiersze` to use table builders**

In `src/visualization/pdf-renderer.ts`, add the import:

```ts
import { tableCell, tableRow, tableHeader, tableContainer } from "./pdf-table.js";
```

Replace the `wiersze` function body (lines 304–369) with:

```ts
function wiersze(invoice: InvoiceFa3): ReactElement {
  const currency = invoice.currency;
  const brutto = invoice.bruttoMode;
  const hasGtu = invoice.lineItems.some((r) => r.gtu != null);

  const w = hasGtu
    ? { lp: "5%", nazwa: "25%", ilosc: "7%", miara: "7%", cena: "12%", stawka: "7%", wart: "11%", gtu: "7%" }
    : { lp: "5%", nazwa: "33%", ilosc: "8%", miara: "7%", cena: "13%", stawka: "8%", wart: "12%", gtu: "0%" };

  const headerCells = [
    tableCell("Lp.", { width: w.lp, isHeader: true }),
    tableCell("Nazwa", { width: w.nazwa, isHeader: true }),
    tableCell("Ilość", { width: w.ilosc, align: "right", isHeader: true }),
    tableCell("Miara", { width: w.miara, isHeader: true }),
    tableCell(brutto ? "Cena brutto" : "Cena netto", { width: w.cena, align: "right", isHeader: true }),
    tableCell("Stawka", { width: w.stawka, isHeader: true }),
    tableCell(brutto ? "Wartość brutto" : "Wartość netto", { width: w.wart, align: "right", isHeader: true }),
    ...(!brutto ? [tableCell("Wartość brutto", { width: w.wart, align: "right", isHeader: true })] : []),
    ...(hasGtu ? [tableCell("GTU", { width: w.gtu, isHeader: true })] : []),
  ];

  const dataRows = invoice.lineItems.map((item, i) => {
    const nazwaText = [
      item.nazwa ?? "—",
      item.p12Zal15 ? "[zał. 15]" : null,
      item.stanPrzed ? "[stan przed]" : null,
    ].filter(Boolean).join(" ");

    const cells = [
      tableCell(String(item.lp), { width: w.lp }),
      tableCell(nazwaText, { width: w.nazwa }),
      tableCell(fmtQty(item.ilosc), { width: w.ilosc, align: "right" }),
      tableCell(item.miara ?? "—", { width: w.miara }),
      tableCell(
        brutto ? fmtMoney(item.cenaJednBrutto ?? null, currency) : fmtMoney(item.cenaJednNetto, currency),
        { width: w.cena, align: "right" },
      ),
      tableCell(stawkaPodatku(item.stawkaPodatku ?? null), { width: w.stawka }),
      tableCell(
        brutto ? fmtMoney(item.wartoscBrutto ?? null, currency) : fmtMoney(item.wartoscNetto, currency),
        { width: w.wart, align: "right" },
      ),
      ...(!brutto ? [tableCell(fmtMoney(item.wartoscBrutto ?? null, currency), { width: w.wart, align: "right" })] : []),
      ...(hasGtu ? [tableCell(item.gtu ? (gtu(item.gtu) ?? item.gtu) : "—", { width: w.gtu })] : []),
    ];

    return tableRow(cells, { index: i });
  });

  return h(
    View,
    { style: styles.section },
    sectionTitle("Pozycje"),
    tableContainer(tableHeader(headerCells), dataRows),
    invoice.totalGross != null
      ? h(
          View,
          { style: styles.totalRow, wrap: false },
          h(Text, { style: styles.totalLabel }, "Łącznie:"),
          h(Text, { style: styles.totalValue }, fmtMoney(invoice.totalGross, currency)),
        )
      : null,
  );
}
```

- [ ] **Step 3: Run tests to verify no regression**

Run: `pnpm test -- --test-name-pattern="renderInvoicePdf" 2>&1`
Expected: PASS (all 5 tests)

- [ ] **Step 4: Commit**

```bash
git add src/visualization/pdf-renderer.ts
git commit -m "refactor(viz): use pdf-table builders in wiersze (line items)"
```

---

### Task 3: Refactor `podsumowanieStawek` (tax summary table) to use `pdf-table` builders

**Files:**
- Modify: `src/visualization/pdf-renderer.ts` (lines 372–403, the `podsumowanieStawek` function)

- [ ] **Step 1: Refactor `podsumowanieStawek`**

Replace the function body with:

```ts
function podsumowanieStawek(invoice: InvoiceFa3): ReactElement | null {
  const rows = invoice.taxSummary;
  if (rows.length === 0) return null;
  const currency = invoice.currency;

  const headerCells = [
    tableCell("Stawka", { width: "28%", isHeader: true }),
    tableCell("Netto", { width: "24%", align: "right", isHeader: true }),
    tableCell("VAT", { width: "24%", align: "right", isHeader: true }),
    tableCell("Brutto", { width: "24%", align: "right", isHeader: true }),
  ];

  const dataRows = rows.map((r, i) =>
    tableRow([
      tableCell(r.label, { width: "28%" }),
      tableCell(fmtMoney(r.kwotaNetto, currency), { width: "24%", align: "right" }),
      tableCell(fmtMoney(r.kwotaPodatku, currency), { width: "24%", align: "right" }),
      tableCell(fmtMoney(r.kwotaBrutto, currency), { width: "24%", align: "right" }),
    ], { index: i }),
  );

  return h(
    View,
    { style: styles.section, wrap: false },
    sectionTitle("Podsumowanie stawek VAT"),
    tableContainer(tableHeader(headerCells), dataRows),
  );
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm test -- --test-name-pattern="renderInvoicePdf" 2>&1`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/visualization/pdf-renderer.ts
git commit -m "refactor(viz): use pdf-table builders in podsumowanieStawek"
```

---

### Task 4: Refactor `daneFaKorygowanej` (correction references table) to use `pdf-table` builders

**Files:**
- Modify: `src/visualization/pdf-renderer.ts` (lines 194–222, the `daneFaKorygowanej` function)

- [ ] **Step 1: Refactor `daneFaKorygowanej`**

Replace the function body with:

```ts
function daneFaKorygowanej(invoice: InvoiceFa3): ReactElement | null {
  const refs = invoice.daneFaKorygowanej;
  if (refs.length === 0) return null;

  const headerCells = [
    tableCell("Numer", { width: "35%", isHeader: true }),
    tableCell("Data wystawienia", { width: "20%", isHeader: true }),
    tableCell("Numer KSeF", { width: "45%", isHeader: true }),
  ];

  const dataRows = refs.map((r, i) =>
    tableRow([
      tableCell(r.numer ?? "—", { width: "35%" }),
      tableCell(fmtDate(r.dataWystawienia), { width: "20%" }),
      tableCell(r.nrKsef ?? "—", { width: "45%" }),
    ], { index: i }),
  );

  return h(
    View,
    { style: styles.section, wrap: false },
    sectionTitle("Faktura koryguje"),
    tableContainer(tableHeader(headerCells), dataRows),
  );
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm test -- --test-name-pattern="renderInvoicePdf" 2>&1`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/visualization/pdf-renderer.ts
git commit -m "refactor(viz): use pdf-table builders in daneFaKorygowanej"
```

---

### Task 5: Refactor `platnosc` partial payment table to use `pdf-table` builders

**Files:**
- Modify: `src/visualization/pdf-renderer.ts` (lines 483–507 inside the `platnosc` function — the `zaplataCzesciowa` sub-table)

- [ ] **Step 1: Refactor the partial payment sub-table**

Inside the `platnosc` function, replace the `partial` variable construction (the `zaplataCzesciowa` table) with:

```ts
  const partial = pmt.zaplataCzesciowa.length > 0
    ? h(
        View,
        { style: { marginTop: 3 } },
        tableContainer(
          tableHeader([
            tableCell("Data zapłaty częściowej", { width: "30%", isHeader: true }),
            tableCell("Kwota", { width: "35%", align: "right", isHeader: true }),
            tableCell("Forma płatności", { width: "35%", isHeader: true }),
          ]),
          pmt.zaplataCzesciowa.map((zc, i) =>
            tableRow([
              tableCell(fmtDate(zc.data), { width: "30%" }),
              tableCell(fmtMoneyStr(zc.kwota, currency), { width: "35%", align: "right" }),
              tableCell(
                zc.platnoscInna ? (zc.opisPlatnosci ?? "—") : formaPlatnosci(zc.formaPlatnosci),
                { width: "35%" },
              ),
            ], { index: i }),
          ),
        ),
      )
    : null;
```

- [ ] **Step 2: Run tests**

Run: `pnpm test -- --test-name-pattern="renderInvoicePdf" 2>&1`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/visualization/pdf-renderer.ts
git commit -m "refactor(viz): use pdf-table builders in platnosc partial payments"
```

---

### Task 6: Clean up unused table styles from `pdf-renderer.ts`

**Files:**
- Modify: `src/visualization/pdf-renderer.ts` (styles object, lines 43–123)

- [ ] **Step 1: Remove replaced styles**

From the `styles = StyleSheet.create({...})` block, remove these now-unused entries:

- `table` (replaced by `tableContainer`)
- `tableHeader` (replaced by `tableHeader` function)
- `tableRow` (replaced by `tableRow` function)
- `cell` (replaced by `tableCell`)
- `cellNum` (replaced by `tableCell` with `align: "right"`)

Keep all other styles (`page`, `sectionTitle`, `dlRow`, `dlLabel`, `dlValue`, `section`, `naglowek*`, `party*`, `totalRow`, `totalLabel`, `totalValue`, `listItem`, `bankBox`, `bankTitle`, `stopka`, etc.) — they are still used by non-table sections.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test 2>&1`
Expected: PASS (all 105+ tests)

- [ ] **Step 3: Build check**

Run: `pnpm build 2>&1`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/visualization/pdf-renderer.ts
git commit -m "chore(viz): remove unused table styles from pdf-renderer"
```

---

### Task 7: Add PDF regression test for table structure

**Files:**
- Modify: `tests/visualization/pdf-renderer.test.ts`

- [ ] **Step 1: Add regression test for brutto mode table columns**

Add to `tests/visualization/pdf-renderer.test.ts`:

```ts
test("renderInvoicePdf brutto mode produces valid PDF without regression", async () => {
  const xml = loadFixture("sample_fa3_brutto.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-BRUTTO-TABLE");
  const buf = await renderInvoicePdf(invoice);
  assertValidPdf(buf, "brutto table regression");
  assert.ok(buf.length > 2048, "brutto PDF with tables should be substantial");
});

test("renderInvoicePdf extended fixture with all sections produces valid PDF", async () => {
  const xml = loadFixture("sample_fa3_extended.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-EXT-TABLE");
  const buf = await renderInvoicePdf(invoice);
  assertValidPdf(buf, "extended table regression");
  assert.ok(buf.length > 2048, "extended PDF with tables should be substantial");
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test 2>&1`
Expected: PASS (all tests including new ones)

- [ ] **Step 3: Commit**

```bash
git add tests/visualization/pdf-renderer.test.ts
git commit -m "test(viz): add PDF table regression tests for brutto and extended fixtures"
```
