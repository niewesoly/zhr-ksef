# Invoice Visualization Parity (HTML + PDF) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.
>
> **Worktree recommended.** This plan spans parser, renderer, and PDF tree rewrites. Open in an isolated worktree:
> `git worktree add ../zhr-ksef-viz -b viz/invoice-parity`.

**Goal:** Make zhr-ksef's HTML + PDF invoice visualization structurally and visually match the ziher Rails app's `app/views/ksef/invoices/fa/*` partials (12 ordered sections, precise CSS class system, DejaVu Serif 9pt, full FA(3) field coverage).

**Architecture:** Three layers, ported in order so each layer has data to render:
1. **Dictionaries** (`src/ksef/dictionaries.ts`) — verbatim ports of ziher's `Ksef::Pdf::Dictionaries` code→label maps.
2. **Parser extensions** (`src/ksef/parser.ts`) — surface every field the ziher partials read (Podmiot extras, Fa.p_1m/p_6/okresFaKorygowanej, brutto mode, 12-bucket tax summary, Adnotacje, Rozliczenie, Platnosc extended, WarunkiTransakcji, multi-row DaneFaKorygowanej, Stopka, Naglowek).
3. **Renderers** — `html-renderer.tsx` (Hono JSX, inline CSS from ziher's `_pdf_styles.html.erb`) and `pdf-renderer.ts` (@react-pdf/renderer tree mirroring the same 12 sections; StyleSheet cannot express all CSS — we aim for structural parity, not pixel parity).

**Tech Stack:** TypeScript (NodeNext modules, `.js` extensions), Hono JSX, `@react-pdf/renderer`, `fast-xml-parser`, `node:test` (built-in, no new deps), `tsx` as the test loader.

**Testing approach:** `node:test` + `tsx` via `pnpm test`. Fixtures live under `tests/fixtures/ksef/`. We vendor ziher's `sample_fa3.xml` + `sample_fa3_full.xml` and add `sample_fa3_extended.xml` to exercise sections the ziher fixtures don't cover (Podmiot3, WarunkiTransakcji, Rozliczenie, Stopka, ZaplataCzesciowa, RachunekBankowyFaktora, Skonto, DaneFaKorygowanej, multiple TerminPlatnosci, brutto-mode lines).

**TDD rule:** every task writes a failing test first, runs it to confirm the failure mode, implements the minimum to pass, re-runs, commits. @superpowers:test-driven-development.

---

## Phase A — Test harness + foundation

### Task A1: Wire `node:test` + tsx runner

**Files:**
- Modify: `package.json` (add `test` script, add `@types/node` assertion if missing)
- Modify: `CLAUDE.md` (Commands section: note the test runner)
- Create: `tests/smoke.test.ts`

**Step 1: Write the failing smoke test**

```ts
// tests/smoke.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";

test("smoke: runner + tsx loader work", () => {
  assert.equal(1 + 1, 2);
});
```

**Step 2: Confirm the runner is not wired yet**

Run: `pnpm test`
Expected: `ERR_PNPM_NO_SCRIPT` or "Missing script: test".

**Step 3: Add the test script**

Edit `package.json` scripts:
```json
"test": "node --import tsx --test 'tests/**/*.test.ts'",
"test:watch": "node --import tsx --test --watch 'tests/**/*.test.ts'"
```

**Step 4: Run the smoke test**

Run: `pnpm test`
Expected: one passing test, exit 0.

**Step 5: Update CLAUDE.md**

In the Commands section, replace the "There is no test runner, linter, or formatter configured yet" sentence with:

```markdown
Tests use the built-in Node test runner with tsx loader: `pnpm test`.
Tests live under `tests/` and follow `*.test.ts` naming. No linter or
formatter is configured yet.
```

**Step 6: Commit**

```bash
git add package.json tests/smoke.test.ts CLAUDE.md
git commit -m "test: add node:test runner via pnpm test"
```

---

### Task A2: Vendor fixture XMLs + fixture loader

**Files:**
- Create: `tests/fixtures/ksef/sample_fa3.xml` (copied verbatim from `/home/wesbit/projects/ziher/test/fixtures/files/ksef/sample_fa3.xml`)
- Create: `tests/fixtures/ksef/sample_fa3_full.xml` (copied verbatim from ziher)
- Create: `tests/fixtures/ksef/sample_fa3_extended.xml` (new — see content spec below)
- Create: `tests/helpers/fixtures.ts`
- Create: `tests/helpers/fixtures.test.ts`

**Step 1: Copy ziher fixtures**

```bash
cp /home/wesbit/projects/ziher/test/fixtures/files/ksef/sample_fa3.xml tests/fixtures/ksef/
cp /home/wesbit/projects/ziher/test/fixtures/files/ksef/sample_fa3_full.xml tests/fixtures/ksef/
```

**Step 2: Author `sample_fa3_extended.xml`**

A minimal but complete FA(3) XML with every optional section the renderer must handle. Required elements at minimum:

- `Naglowek` with `KodFormularza@kodSystemowy="FA (3)"`, `WariantFormularza="3"`, `DataWytworzeniaFa`, `SystemInfo`
- `Podmiot1` (sprzedawca) with `PrefiksPodatnika`, `NrEORI`, `DaneIdentyfikacyjne/NIP`, `Nazwa`, `Adres`, `DaneKontaktowe` (×2), `DaneRejestrowe` (KRS, REGON, NazwaPelna), `StatusInfoPodatnika="1"`
- `Podmiot2` (nabywca) with `JST=1`, `GV=1`, `NrKlienta`, `IDNabywcy`, `AdresKoresp`
- **Two** `Podmiot3` nodes with differing `RolaPodmiotu3` values (e.g. `"1"` faktor, `"2"` odbiorca)
- `Fa/KodWaluty="EUR"` (non-PLN, to trigger the currency note)
- `Fa/P_1`, `P_1M`, `P_2`, `P_6`, `RodzajFaktury="KOR"`, `OkresFaKorygowanej="2026-01"` (triggers "korygująca zbiorcza (rabat)" label)
- `Fa/DaneFaKorygowanej` × 2 rows
- `Fa/FaWiersz` × 3 rows: two with netto values, one **brutto-only** (no `P_9A`, only `P_9B` + `P_11A` — exercises `bruttoMode` detection on a per-row + detection override path; the detection is "all rows lack netto", so also provide a brutto-only fixture later if needed)
- `Fa/P_13_1..P_14_2` to populate two tax-summary rows
- `Fa/P_15` (gross total)
- `Fa/Adnotacje` with `P_16=1`, `P_17=1`, `Zwolnienie/P_19=1`, `PMarzy/P_PMarzy=1`, `PMarzy/P_PMarzy_3_1=1`
- `Fa/Rozliczenie` with `SumaObciazen`, `SumaOdliczen`, `DoZaplaty`, `DoRozliczenia`
- `Fa/Platnosc` with `Zaplacono="1"`, `DataZaplaty`, `FormaPlatnosci="6"`, **two** `TerminPlatnosci` (one with `TerminOpis/Ilosc`, `Jednostka`, `ZdarzeniePoczatkowe`), `LinkDoPlatnosci`, `IPKSeF`, **two** `RachunekBankowy`, **one** `RachunekBankowyFaktora`, `Skonto/WarunkiSkonta` + `WysokoscSkonta`, one `ZaplataCzesciowa`
- `Fa/WarunkiTransakcji` with `WarunkiDostawy`, `KursUmowny`, `WalutaUmowna`, `RodzajTransportu="3"`, `NumerSrodkaTransportu`, one `Umowy`, one `Zamowienia`, two `NrPartiiTowaru`
- `Stopka/Informacje/StopkaFaktury` × 2, `Stopka/Rejestry` with KRS+REGON+BDO

Keep it under 300 lines and well-commented. Use the ziher `sample_fa3_full.xml` as the scaffold and add the missing elements.

**Step 3: Write the loader + failing test**

```ts
// tests/helpers/fixtures.ts
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures", "ksef");

export function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}
```

```ts
// tests/helpers/fixtures.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { loadFixture } from "./fixtures.js";

test("loadFixture reads sample_fa3_full.xml", () => {
  const xml = loadFixture("sample_fa3_full.xml");
  assert.match(xml, /<Faktura/);
});

test("loadFixture reads sample_fa3_extended.xml", () => {
  const xml = loadFixture("sample_fa3_extended.xml");
  assert.match(xml, /<Podmiot3/);
  assert.match(xml, /RachunekBankowyFaktora/);
});
```

**Step 4: Run — confirm both pass**

Run: `pnpm test`
Expected: 3 passing tests total.

**Step 5: Commit**

```bash
git add tests/fixtures/ksef/ tests/helpers/
git commit -m "test: vendor FA(3) fixtures + loader helper"
```

---

## Phase B — Dictionaries

### Task B1: Port `Ksef::Pdf::Dictionaries` to TypeScript

Verbatim port of `/home/wesbit/projects/ziher/app/services/ksef/pdf/dictionaries.rb`. Same keys, same Polish labels, same precedence rules. Implemented as frozen `Record<string, string>` constants plus resolver functions.

**Files:**
- Create: `src/ksef/dictionaries.ts`
- Create: `tests/ksef/dictionaries.test.ts`

**Step 1: Failing tests (one per resolver)**

```ts
// tests/ksef/dictionaries.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  rodzajFaktury,
  formaPlatnosci,
  taxpayerStatus,
  stawkaPodatku,
  rolaPodmiotu3,
  rolaPodmiotu3Short,
  zaplacono,
  znacznikZaplatyCzesciowej,
  rodzajTransportu,
  kraj,
  adnotacjeFlags,
} from "../../src/ksef/dictionaries.js";

test("rodzajFaktury resolves codes to Polish labels", () => {
  assert.equal(rodzajFaktury("VAT"), "Faktura podstawowa");
  assert.equal(rodzajFaktury("KOR"), "Faktura korygująca");
  assert.equal(rodzajFaktury("XYZ"), "XYZ");
});

test("rodzajFaktury special-cases KOR + okresKorygowanej", () => {
  assert.equal(
    rodzajFaktury("KOR", "2026-01"),
    "Faktura korygująca zbiorcza (rabat)",
  );
});

test("kraj resolves PL → Polska, unknown → code", () => {
  assert.equal(kraj("PL"), "Polska");
  assert.equal(kraj("DE"), "Niemcy");
  assert.equal(kraj("ZZ"), "ZZ");
  assert.equal(kraj(null), null);
});

test("rolaPodmiotu3Short strips parenthesised suffixes", () => {
  assert.equal(rolaPodmiotu3Short("7"), "Jednostka samorządu terytorialnego");
  assert.equal(rolaPodmiotu3Short("2"), "Odbiorca");
  assert.equal(rolaPodmiotu3Short(null), null);
});

test("adnotacjeFlags emits human strings for every set flag", () => {
  const adn = {
    p16: "1", p17: "0", p18: null, p18a: "1", p23: null,
    zwolnienie: { p19: "1" },
    noweSrodkiTransportu: {},
    pmarzy: { pPMarzy: "1", pPMarzy_3_1: "1" },
  };
  const flags = adnotacjeFlags(adn);
  assert.ok(flags.includes("Metoda kasowa"));
  assert.ok(flags.includes("Mechanizm podzielonej płatności"));
  assert.ok(flags.some((f) => f.startsWith("Procedura marży")));
  assert.ok(!flags.some((f) => f.includes("Samofakturowanie")));
});
```

**Step 2: Run — confirm failures**

Run: `pnpm test`
Expected: module-not-found error for `../../src/ksef/dictionaries.js`.

**Step 3: Implement `src/ksef/dictionaries.ts`**

Copy the constants verbatim from `dictionaries.rb`:
- `RODZAJ_FAKTURY`, `FORMA_PLATNOSCI`, `TAXPAYER_STATUS`, `STAWKA_PODATKU`, `TYP_KOREKTY`, `ROLA_PODMIOTU3`, `ROLA_PODMIOTU_UPOWAZNIONEGO`, `ZAPLACONO`, `ZNACZNIK_ZAPLATY_CZESCIOWEJ`, `RODZAJ_TRANSPORTU`, `TYP_RACHUNKOW_WLASNYCH`, `PROCEDURA`, `TYP_LADUNKU`, `KRAJ` (full 200+ entries).

Resolver signatures:

```ts
export function rodzajFaktury(code: string | null, okresKorygowanej?: string | null): string;
export function formaPlatnosci(code: string | null): string;
export function taxpayerStatus(code: string | null): string | null;
export function stawkaPodatku(code: string | null): string;
export function typKorekty(code: string | null): string | null;
export function rolaPodmiotu3(code: string | null): string | null;
export function rolaPodmiotu3Short(code: string | null): string | null;
export function rolaPodmiotuUpowaznionego(code: string | null): string;
export function zaplacono(code: string | null): string | null;
export function znacznikZaplatyCzesciowej(code: string | null): string | null;
export function rodzajTransportu(code: string | null): string;
export function typRachunkowWlasnych(code: string | null): string | null;
export function procedura(code: string | null): string | null;
export function typLadunku(code: string | null): string;
export function kraj(code: string | null): string | null;

export interface AdnotacjeInput {
  p16: string | null;
  p17: string | null;
  p18: string | null;
  p18a: string | null;
  p23: string | null;
  zwolnienie: { p19?: string | null };
  noweSrodkiTransportu: { p42_5?: string | null };
  pmarzy: {
    pPMarzy?: string | null;
    pPMarzy_2?: string | null;
    pPMarzy_3_1?: string | null;
    pPMarzy_3_2?: string | null;
    pPMarzy_3_3?: string | null;
  };
}
export function adnotacjeFlags(adn: AdnotacjeInput | null): string[];
```

Implement `adnotacjeFlags` matching ziher's logic in `dictionaries.rb:292-326` (order of flags preserved).

**Step 4: Run tests**

Run: `pnpm test`
Expected: all dictionaries tests pass.

**Step 5: Commit**

```bash
git add src/ksef/dictionaries.ts tests/ksef/dictionaries.test.ts
git commit -m "feat(ksef): port Pdf::Dictionaries (rodzaj faktury, kraj, adnotacje flags, …)"
```

---

## Phase C — Parser extensions

All parser tasks edit `src/ksef/parser.ts` and add targeted tests in `tests/ksef/parser.test.ts`. Each task extends the `InvoiceFa3` type and implementation incrementally; no existing field is removed in a single task (keep the old shape alongside the new until the renderer migrates).

**Single test file convention:** `tests/ksef/parser.test.ts` grows with each task — add a `describe` block (via `node:test` `suite`) per task.

### Task C1: Parse `Naglowek` into an `InvoiceHeader`

**Step 1: Failing test**

```ts
// tests/ksef/parser.test.ts — add to file
import { test, suite } from "node:test";
import { strict as assert } from "node:assert";
import { parseInvoiceFa3 } from "../../src/ksef/parser.js";
import { loadFixture } from "../helpers/fixtures.js";

suite("parseInvoiceFa3: header", () => {
  test("extracts kodSystemowy and dataWytworzeniaFa", () => {
    const xml = loadFixture("sample_fa3_extended.xml");
    const inv = parseInvoiceFa3(xml, "TEST-KSEF");
    assert.equal(inv.header.kodSystemowy, "FA (3)");
    assert.ok(inv.header.dataWytworzeniaFa);
    assert.equal(inv.header.wariantFormularza, "3");
  });
});
```

**Step 2: Run** — expect `Cannot read property 'kodSystemowy' of undefined`.

**Step 3: Implement**

Add to parser:

```ts
export interface InvoiceHeader {
  kodSystemowy: string | null;   // attribute on KodFormularza
  wersjaSchemy: string | null;   // attribute on KodFormularza
  wariantFormularza: string | null;
  dataWytworzeniaFa: string | null;
  systemInfo: string | null;
}
```

Add `header: InvoiceHeader` to `InvoiceFa3`. Implement `parseHeader(faktura)`:
- `KodFormularza` attributes live under `@_kodSystemowy` / `@_wersjaSchemy` thanks to existing fast-xml-parser config.

**Step 4: Run — pass. Step 5: Commit.**

```bash
git commit -am "feat(ksef): parse Naglowek (kod systemowy, wariant, data wytworzenia)"
```

---

### Task C2: Extend `InvoiceParty` with FA(3) fields

**Step 1: Failing tests**

```ts
suite("parseInvoiceFa3: podmiot extended", () => {
  test("sprzedawca surfaces prefiksPodatnika, nrEORI, daneKontaktowe, statusInfoPodatnika", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.equal(inv.seller.prefiksPodatnika, "PL");
    assert.ok(inv.seller.daneKontaktowe.length >= 1);
    assert.ok(inv.seller.daneRejestrowe);
    assert.equal(inv.seller.statusInfoPodatnika, "1");
  });
  test("nabywca surfaces jst/gv booleans, nrKlienta, idNabywcy, adresKoresp", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.equal(inv.buyer.jst, true);
    assert.equal(inv.buyer.gv, true);
    assert.ok(inv.buyer.nrKlienta);
    assert.ok(inv.buyer.adresKoresp);
  });
});
```

**Step 2: Run — expect failures (new fields undefined).**

**Step 3: Implement**

Replace `InvoiceParty` with the full shape:

```ts
export interface PartyContact { email: string | null; telefon: string | null; }
export interface PartyRegistry {
  nazwaPelna: string | null;
  krs: string | null;
  regon: string | null;
}

export interface InvoiceParty {
  prefiksPodatnika: string | null;
  nrEORI: string | null;
  nip: string | null;
  kodUE: string | null;
  nrVatUE: string | null;
  brakID: string | null;
  nazwa: string | null;             // Nazwa OR ImieNazwisko fallback
  adres: PartyAddress | null;
  adresKoresp: PartyAddress | null;
  daneKontaktowe: PartyContact[];   // FA(3) allows multiple
  daneRejestrowe: PartyRegistry | null;
  // buyer-only
  nrKlienta: string | null;
  idNabywcy: string | null;
  jst: boolean;
  gv: boolean;
  // seller-only
  statusInfoPodatnika: string | null;
  // Podmiot3-only
  rolaPodmiotu3: string | null;
  udzialPodmiotu3: string | null;
}
```

Update `parseParty` with a `role` discriminator: `"sprzedawca" | "nabywca" | "podmiot3"`. Implement fallback `Nazwa ?? ImieNazwisko`. `daneKontaktowe` handles both single element and array (pass through `toArray`).

Consumers compile-break the build; fix them in the same commit:
- `src/api/routes/invoices.ts` (reads `seller.email`, `seller.telefon` directly)
- `src/visualization/html-renderer.tsx` (temporarily keep rendering `daneKontaktowe[0]?.email` / `[0]?.telefon` — will be rewritten in Phase D)
- `src/visualization/pdf-renderer.ts` (same temporary shim)

**Step 4: Run — all tests pass + tsc clean.**

Check: `pnpm build`

**Step 5: Commit**

```bash
git commit -am "feat(ksef): expand InvoiceParty to full FA(3) Podmiot shape"
```

---

### Task C3: Parse `Podmiot3` as `odbiorcy[]`

**Step 1: Failing test**

```ts
suite("parseInvoiceFa3: odbiorcy", () => {
  test("collects all Podmiot3 entries with roles", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.equal(inv.odbiorcy.length, 2);
    assert.equal(inv.odbiorcy[0].rolaPodmiotu3, "1");
    assert.equal(inv.odbiorcy[1].rolaPodmiotu3, "2");
  });
});
```

**Step 2: Run — `receiver` exists but `odbiorcy` does not.**

**Step 3: Implement**

- Replace `receiver: InvoiceParty | null` with `odbiorcy: InvoiceParty[]`.
- Parse: `toArray(findField(faktura, "Podmiot3")).filter(isRecord).map(p => parseParty(p, "podmiot3"))`.
- Update `src/api/routes/invoices.ts` if it uses `receiver`.
- Update renderers' temporary shim to render first `odbiorcy[0]` if present.

**Step 4: Run + build.** **Step 5: Commit.**

```bash
git commit -am "feat(ksef): parse all Podmiot3 as odbiorcy[]"
```

---

### Task C4: Extend `Fa` core fields

Fields: `p_1m` (miejsce wystawienia), `p_6` (sale/zapłata date), `okresFaKorygowanej`, `przyczynaKorekty`, `sellDate` (computed from p_6 when parseable), `kodWaluty` stays but also expose `currency` alias.

**Step 1: Failing test**

```ts
suite("parseInvoiceFa3: Fa core", () => {
  test("surfaces p_1m, p_6, okresFaKorygowanej", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.placeOfIssue); // p_1m
    assert.ok(inv.saleDate);     // p_6
    assert.equal(inv.okresFaKorygowanej, "2026-01");
  });
});
```

**Step 2/3:** add fields to `InvoiceFa3`, implement, remove dead `placeOfIssue` re-read if any.

**Step 4/5:** run, commit.

```bash
git commit -am "feat(ksef): parse Fa.p_1m / p_6 / okresFaKorygowanej"
```

---

### Task C5: Line items — full shape + brutto-mode detection

**Step 1: Failing test**

```ts
suite("parseInvoiceFa3: wiersze", () => {
  test("surfaces cenaBrutto, wartoscBrutto, gtin, pkwiU, cn", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    const row = inv.lineItems[0];
    assert.ok("cenaJednBrutto" in row);
    assert.ok("wartoscBrutto" in row);
    assert.ok("gtin" in row);
  });

  test("bruttoMode is true iff all rows lack netto price+value", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    // extended fixture mixes — so bruttoMode=false. Assert shape only.
    assert.equal(typeof inv.bruttoMode, "boolean");
  });
});
```

**Step 3: Implement**

Extend `InvoiceLineItem` with: `cenaJednBrutto`, `wartoscBrutto`, `gtin`, `pkwiU`, `cn`. Add `bruttoMode: boolean` on `InvoiceFa3`, true iff `lineItems.length > 0 && lineItems.every(r => r.cenaJednNetto == null && r.wartoscNetto == null)`.

Add a second fixture `sample_fa3_brutto.xml` covering the true case (all rows netto-less) — it's a simpler variant of `sample_fa3_full.xml`. Add an assertion `assert.equal(parseInvoiceFa3(loadFixture("sample_fa3_brutto.xml"), "K").bruttoMode, true)`.

**Commit:**

```bash
git commit -am "feat(ksef): line items — cena/wartość brutto, GTIN/PKWiU/CN, brutto-mode"
```

---

### Task C6: Tax summary — 12 FA(3) VAT buckets

Replace the current 11-bucket `VAT_RATE_SUFFIXES` loop with the **12-bucket** ziher mapping from `parser.rb:296-310`:

| key | net field | tax field | label |
|---|---|---|---|
| p_13_1 | P_13_1 | P_14_1 | 23% lub 22% |
| p_13_2 | P_13_2 | P_14_2 | 8% lub 7% |
| p_13_3 | P_13_3 | P_14_3 | 5% |
| p_13_4 | P_13_4 | P_14_4 | 4% lub 3% |
| p_13_5 | P_13_5 | P_14_5 | OSS |
| p_13_6_1 | P_13_6_1 | — | 0% (krajowe) |
| p_13_6_2 | P_13_6_2 | — | 0% WDT |
| p_13_6_3 | P_13_6_3 | — | 0% eksport |
| p_13_7 | P_13_7 | — | zwolnione od podatku |
| p_13_8 | P_13_8 | — | np. z wył. art. 100 ust. 1 pkt 4 |
| p_13_9 | P_13_9 | — | np. art. 100 ust. 1 pkt 4 |
| p_13_10 | P_13_10 | — | odwrotne obciążenie |
| p_13_11 | P_13_11 | — | marża |

Skip rows where both net and tax are null **or** both are zero (matches ziher's `next if (net || 0).zero? && (tax || 0).zero?`).

**Step 1: Failing test**

```ts
suite("parseInvoiceFa3: tax summary", () => {
  test("returns two non-zero buckets from extended fixture", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.equal(inv.taxSummary.length, 2);
    assert.equal(inv.taxSummary[0].label, "23% lub 22%");
  });
});
```

**Step 2/3/4/5:** implement, test, commit.

```bash
git commit -am "feat(ksef): 12-bucket FA(3) tax summary with zero-row filtering"
```

---

### Task C7: Parse `Adnotacje`

**Step 1: Failing test**

```ts
suite("parseInvoiceFa3: adnotacje", () => {
  test("surfaces p16/p17/p18a + zwolnienie + pmarzy", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.adnotacje);
    assert.equal(inv.adnotacje.p16, "1");
    assert.equal(inv.adnotacje.zwolnienie.p19, "1");
    assert.equal(inv.adnotacje.pmarzy.pPMarzy, "1");
  });
});
```

**Step 3: Implement**

```ts
export interface AdnotacjeZwolnienie {
  p19: string | null; p19a: string | null; p19b: string | null;
  p19c: string | null; p19n: string | null;
}
export interface AdnotacjeNoweSrodki {
  p22: string | null; p42_5: string | null; p22n: string | null;
}
export interface AdnotacjePMarzy {
  pPMarzy: string | null; pPMarzy_2: string | null;
  pPMarzy_3_1: string | null; pPMarzy_3_2: string | null; pPMarzy_3_3: string | null;
  pPMarzyN: string | null;
}
export interface Adnotacje {
  p16: string | null; p17: string | null; p18: string | null;
  p18a: string | null; p23: string | null;
  zwolnienie: AdnotacjeZwolnienie;
  noweSrodkiTransportu: AdnotacjeNoweSrodki;
  pmarzy: AdnotacjePMarzy;
}
```

`adnotacje: Adnotacje | null` on `InvoiceFa3`. Null when the element is missing.

**Commit:** `feat(ksef): parse Adnotacje + Zwolnienie + NoweSrodkiTransportu + PMarzy`

---

### Task C8: Parse `Rozliczenie`

Fields: `sumaObciazen`, `sumaOdliczen`, `doZaplaty`, `doRozliczenia`, `obciazenia: { kwota, powod }[]`, `odliczenia: { kwota, powod }[]`.

**Commit:** `feat(ksef): parse Rozliczenie summary + obciążenia/odliczenia lists`

---

### Task C9: Parse `Platnosc` extended

Replace existing `PaymentInfo` with a richer shape that covers everything `_platnosc.html.erb` reads:

```ts
export interface PaymentTerm {
  termin: string | null;
  terminOpis: string | null; // "Ilość Jednostka Zdarzenie" joined
  kwota: number | null;
}
export interface BankAccount {
  nrRB: string | null;
  swift: string | null;
  nazwaBanku: string | null;
  rachunekWlasnyBanku: string | null;
  opisRachunku: string | null;
}
export interface PartialPayment {
  kwota: string | null;
  data: string | null;
  formaPlatnosci: string | null;
  platnoscInna: string | null;
  opisPlatnosci: string | null;
}
export interface Payment {
  zaplacono: string | null;
  dataZaplaty: string | null;
  znacznikZaplatyCzesciowej: string | null;
  formaPlatnosci: string | null;
  platnoscInna: string | null;
  opisPlatnosci: string | null;
  linkDoPlatnosci: string | null;
  ipKSeF: string | null;
  terminy: PaymentTerm[];
  rachunkiBankowe: BankAccount[];
  rachunkiBankoweFaktora: BankAccount[];
  skonto: { warunki: string | null; wysokosc: string | null } | null;
  zaplataCzesciowa: PartialPayment[];
}
```

Replace old `payment` + `bankAccounts` with `payment: Payment | null`. Update consumers.

**Step 1: Failing test** — assert that two `TerminPlatnosci` are returned, that `rachunkiBankoweFaktora` has one entry, that `skonto.warunki` is populated.

**Commit:** `feat(ksef): parse Platnosc — multi-term, faktora accounts, skonto, zapłata częściowa`

---

### Task C10: Parse `WarunkiTransakcji`

All fields from `parser.rb:562-602`. Arrays for `umowy`, `zamowienia`, `nrPartiiTowaru`.

**Commit:** `feat(ksef): parse WarunkiTransakcji`

---

### Task C11: Parse `DaneFaKorygowanej` as array

Replace `correctedInvoiceNumber` / `correctedInvoiceDate` single fields with `daneFaKorygowanej: { numer, dataWystawienia, nrKsef }[]`. `correctionReason` (`PrzyczynaKorekty`) stays as a single string on the invoice.

**Commit:** `feat(ksef): DaneFaKorygowanej → array of corrected invoice refs`

---

### Task C12: Parse `Stopka`

`informacje: string[]` (from `Informacje/StopkaFaktury` text nodes) + `rejestry: { krs, regon, bdo }[]`.

**Commit:** `feat(ksef): parse Stopka (info lines + rejestry)`

---

### Task C13: End-to-end parser test against full + extended fixtures

One holistic test per fixture that walks every top-level field to guard against regression.

```ts
suite("parseInvoiceFa3: full fixture", () => {
  test("sample_fa3_full.xml round-trips without throwing", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_full.xml"), "K");
    assert.ok(inv.header);
    assert.ok(inv.seller);
    assert.ok(inv.buyer);
    assert.ok(Array.isArray(inv.lineItems));
    assert.ok(Array.isArray(inv.odbiorcy));
  });

  test("sample_fa3_extended.xml exposes every new section", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.adnotacje);
    assert.ok(inv.rozliczenie);
    assert.ok(inv.warunkiTransakcji);
    assert.ok(inv.stopka);
    assert.ok(inv.payment);
    assert.ok(inv.payment!.rachunkiBankoweFaktora.length > 0);
    assert.ok(inv.daneFaKorygowanej.length === 2);
  });
});
```

**Commit:** `test(ksef): full + extended parser coverage`

---

## Phase D — HTML renderer (Hono JSX)

All HTML renderer tasks edit `src/visualization/html-renderer.tsx` and assert against a snapshot-style test in `tests/visualization/html-renderer.test.ts`. Tests use substring + DOM-ish regex matches, not byte-for-byte, so CSS formatting can evolve without churning tests.

### Task D1: Port the full CSS verbatim

Copy the entire `<style>` block from `/home/wesbit/projects/ziher/app/views/ksef/invoices/_pdf_styles.html.erb:1-191` into a `const STYLES = `...`;` in `html-renderer.tsx`. Drop the existing ad-hoc style string.

Verify: render any fixture, check that the output contains `.ksef-invoice`, `.ksef-naglowek__brand`, `.ksef-section__title`, `.ksef-podmioty`, `.ksef-dl`, `.ksef-table`, `.ksef-rachunek`.

Commit: `feat(html): port ziher's ksef-invoice CSS verbatim`

### Task D2: `<Naglowek>` section

Structure per `_naglowek.html.erb:3-22`. Two-column table (brand on left, meta on right). Uses `rodzajFaktury()` dictionary with `okresFaKorygowanej` for the special "korygująca zbiorcza (rabat)" case.

**Test:**

```ts
test("naglowek renders KSeF brand + invoice number + rodzaj + ksef number", () => {
  const html = renderInvoiceHtml(inv);
  assert.match(html, /ksef-naglowek__brand/);
  assert.match(html, />e<\/span>-Faktur/);
  assert.match(html, /ksef-naglowek__number/);
  assert.match(html, /Faktura korygująca zbiorcza \(rabat\)/);
  assert.match(html, /ksef-naglowek__ksef/);
});
```

Commit: `feat(html): naglowek section`

### Task D3: `<DaneFaKorygowanej>` table

Per `_dane_fa_korygowanej.html.erb`. Renders nothing if the array is empty. Columns: Numer, Data wystawienia, Numer KSeF.

Commit: `feat(html): dane faktury korygowanej table`

### Task D4: `<Podmiot>` reusable component

Port `_podmiot.html.erb:1-55` exactly. Props: `podmiot: InvoiceParty`, `role: "sprzedawca" | "nabywca" | "odbiorca"`. Handles: NIP (with prefiks concatenation), EORI, nazwa, adres.lines, adresKoresp.lines, daneKontaktowe entries, nrKlienta/idNabywcy/JST/GV (nabywca only), statusInfoPodatnika (sprzedawca only).

Use `kraj()` dictionary to translate address `kodKraju` to country name for display (matches `parser.rb:138-141`).

Commit: `feat(html): Podmiot component with role-specific fields`

### Task D5: `<Podmioty>` side-by-side table

Per `_podmioty.html.erb`. Builds columns = `[sprzedawca, nabywca, ...odbiorcy]`. Column width = `round(100/cols.length, 2)`. Title for each odbiorca is `rolaPodmiotu3Short(code)` + " N" if more than one.

Commit: `feat(html): podmioty side-by-side layout`

### Task D6: `<Szczegoly>` details list

Per `_szczegoly.html.erb`. DL with: Data wystawienia, Miejsce wystawienia, Okres rabatu, Data dostawy/wykonania (or "Data otrzymania zapłaty" for ZAL), Kod waluty.

Add a helper `fmtDate(iso: string | null): string` that returns the input or a `DD.MM.YYYY` reformat. Ziher uses `l()` (Rails localization) — we match by formatting YYYY-MM-DD → DD.MM.YYYY.

Commit: `feat(html): szczegoly details list + date formatter`

### Task D7: `<Wiersze>` line items table

Per `_wiersze.html.erb`. Columns depend on `bruttoMode`: "Cena brutto" / "Wartość netto" / "Wartość brutto" vs "Cena netto". Use `stawkaPodatku()` dictionary for rate cell. Currency note when `currency !== "PLN"`. Total as `<p class="ksef-total">Kwota należności ogółem: <strong>{fmtMoney(totalGross, currency)}</strong></p>`.

Netto↔brutto row-level computation (from `_wiersze.html.erb:30-48`) is **out of scope** for the renderer — if the parser didn't surface one, display `—`. Ziher computes at render time; we prefer to compute at parse time. Follow-up optional task if needed.

Commit: `feat(html): pozycje table with brutto-mode switching`

### Task D8: `<PodsumowanieStawek>` table

Per `_podsumowanie_stawek.html.erb`. Straightforward — labels already on `taxSummary`.

Commit: `feat(html): podsumowanie stawek`

### Task D9: `<Adnotacje>` flags list

Per `_adnotacje.html.erb`. Skip the section entirely if `adnotacjeFlags(adn)` is empty.

Commit: `feat(html): adnotacje flag list`

### Task D10: `<Rozliczenie>` DL

Per `_rozliczenie.html.erb`. Omit section if all four fields are null.

Commit: `feat(html): rozliczenie section`

### Task D11: `<Platnosc>` — biggest section

Per `_platnosc.html.erb`. Structure:
1. `ksef-dl--two-col` block: Informacja o płatności (from `zaplacono()` or `znacznikZaplatyCzesciowej()`), Data zapłaty, Forma płatności (from `formaPlatnosci()` or "Płatność inna — opis"), Termin płatności (one DT/DD per entry with numeric suffix if > 1), IPKSeF, Link do płatności (as `<a>`).
2. `ksef-rachunek` block per bank account: main + faktora, with " faktora" suffix for the latter. Inner DL: Numer, SWIFT, Nazwa banku, Opis.
3. Skonto DL if present.
4. Zaplata częściowa table if any.

Commit: `feat(html): platnosc section (terms, banks + faktora, skonto, partial payments)`

### Task D12: `<WarunkiTransakcji>`

Per `_warunki_transakcji.html.erb`. DL + three optional sub-lists (Umowy, Zamówienia, Nr partii towaru).

Commit: `feat(html): warunki transakcji`

### Task D13: `<Stopka>`

Per `_stopka.html.erb`. Omit if both `informacje` and `rejestry` empty.

Commit: `feat(html): stopka (info lines + rejestry)`

### Task D14: Top-level composition + full-fixture golden test

`renderInvoiceHtml(invoice)` renders `<!doctype html><html>...<head><style>${STYLES}</style></head><body><div class="ksef-invoice">{12 sections in ziher order}</div></body></html>`. Section order matches `_invoice.html.erb:4-14`.

**Test:** render `sample_fa3_extended.xml` through parser + renderer, assert every section class appears exactly once:

```ts
test("full invoice contains all 12 sections", () => {
  const html = renderInvoiceHtml(parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "KSEF-1"));
  for (const cls of [
    "ksef-naglowek",
    "ksef-section__title",
    "ksef-podmioty",
    "ksef-table",
    "ksef-total",
    "ksef-dl",
    "ksef-rachunek",
    "ksef-list",
    "ksef-section--stopka",
  ]) {
    assert.match(html, new RegExp(cls));
  }
});
```

Commit: `feat(html): compose full invoice from all 12 sections`

---

## Phase E — PDF renderer (@react-pdf/renderer)

PDF parity is **structural**, not pixel. `@react-pdf`'s StyleSheet supports flexbox, borders, padding, fontFamily, fontSize, color, textAlign — but not `::before`, `float`, `grid`, `page-break-inside`, or `letter-spacing`. So the PDF mirrors the 12 sections in the same order, with section headers rendered as titled `View`s and tables as vertical stacks of rows. No DejaVu Serif (uses Helvetica, the built-in). We accept visual divergence where CSS features don't map.

### Task E1: Font registration + shared StyleSheet

**Files:**
- Modify: `src/visualization/pdf-renderer.ts`

Register a serif font: use PDFKit's built-in `Times-Roman` via `fontFamily: "Times-Roman"` on the root page — no `Font.register` needed, no font file vendoring, no asset-loading failure mode.

Replace the current StyleSheet with one that mirrors ziher's CSS semantics:

```ts
const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Times-Roman", color: "#111", lineHeight: 1.35 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    backgroundColor: "#e8e8e8",
    padding: 4,
    borderLeftWidth: 2,
    borderLeftColor: "#555",
    borderLeftStyle: "solid",
    marginBottom: 4,
  },
  dlRow: { flexDirection: "row", marginBottom: 1 },
  dlTerm: { width: "42%", fontWeight: 700, color: "#444", paddingRight: 4 },
  dlDesc: { width: "58%" },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#e8e8e8",
    borderBottomWidth: 0.75,
    borderBottomColor: "#888",
    borderStyle: "solid",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#888",
    borderStyle: "solid",
  },
  cell: { padding: 3, fontSize: 8.5 },
  cellNum: { padding: 3, fontSize: 8.5, textAlign: "right" },
  partyCol: {
    borderWidth: 0.75,
    borderColor: "#bbb",
    borderStyle: "solid",
    padding: 6,
    marginRight: 4,
    flexGrow: 1,
    flexBasis: 0,
  },
  total: { textAlign: "right", fontSize: 11, marginTop: 6 },
  note: { fontStyle: "italic", fontSize: 8 },
  stopka: { marginTop: 14, fontSize: 8, color: "#444", borderTopWidth: 0.5, borderTopColor: "#bbb", paddingTop: 4 },
  bankBox: { borderWidth: 0.5, borderColor: "#bbb", borderStyle: "solid", padding: 4, marginTop: 4 },
});
```

**Test:** smoke — `renderInvoicePdf(invoice)` returns a Buffer starting with `%PDF`.

```ts
test("renderInvoicePdf returns a valid PDF buffer", async () => {
  const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
  const buf = await renderInvoicePdf(inv);
  assert.equal(buf.subarray(0, 4).toString("ascii"), "%PDF");
  assert.ok(buf.length > 2000); // non-trivial content
});
```

Commit: `feat(pdf): shared StyleSheet mirroring ziher ksef-invoice CSS`

### Task E2: Shared layout helpers

Extract reusable builders (kept in the same file; no premature abstraction):

```ts
const sectionTitle = (title: string) =>
  h(Text, { style: styles.sectionTitle }, title);

const dlRow = (term: string, desc: string) =>
  h(View, { style: styles.dlRow },
    h(Text, { style: styles.dlTerm }, term),
    h(Text, { style: styles.dlDesc }, desc));
```

Commit: `refactor(pdf): shared section/dl helpers`

### Tasks E3–E14: one section per task

Each task adds a `buildXxx(invoice): ReactElement | null` function and wires it into `buildDocument`. Section order matches `_invoice.html.erb:4-14`.

| Task | Section | Source partial |
|---|---|---|
| E3 | Naglowek | `_naglowek.html.erb` |
| E4 | DaneFaKorygowanej | `_dane_fa_korygowanej.html.erb` |
| E5 | Podmioty (row of party columns) | `_podmioty.html.erb` + `_podmiot.html.erb` |
| E6 | Szczegoly | `_szczegoly.html.erb` |
| E7 | Wiersze | `_wiersze.html.erb` |
| E8 | PodsumowanieStawek | `_podsumowanie_stawek.html.erb` |
| E9 | Adnotacje | `_adnotacje.html.erb` |
| E10 | Rozliczenie | `_rozliczenie.html.erb` |
| E11 | Platnosc | `_platnosc.html.erb` |
| E12 | WarunkiTransakcji | `_warunki_transakcji.html.erb` |
| E13 | Stopka | `_stopka.html.erb` |
| E14 | Compose — 12 sections in order + page wrap | `_invoice.html.erb` |

Each task follows the same shape:

**Step 1** — Add an assertion to the smoke test that the rendered PDF buffer length grew vs. previous task (cheap regression guard against empty section builders).
**Step 2** — Implement `buildXxx` and wire into the Page children array.
**Step 3** — `pnpm test`
**Step 4** — Commit: `feat(pdf): <section name>`

For **Podmioty (E5)**: render as a horizontal row of `styles.partyCol` boxes. Column width = `{ width: \`${100/cols.length}%\` }` inline.

For **Wiersze (E7)**: compute columns widths proportional to those in ziher CSS. Dynamic headers per `bruttoMode`. No row-level netto/brutto computation.

For **Platnosc (E11)**: sub-sections = DL + optional `bankBox` per rachunek (faktora suffix) + optional skonto DL + optional `zaplataCzesciowa` table.

---

## Phase F — Integration + cleanup

### Task F1: Update `src/api/routes/invoices.ts` for the new shape

Grep for removed fields: `receiver`, `bankAccounts`, old `payment.method/dueDate/dueAmount/info`, old `correctedInvoiceNumber/Date/Reason`, old `placeOfIssue` usage. Replace with current equivalents.

```bash
grep -n "receiver\|bankAccounts\|invoice\.payment\.method\|correctedInvoice" src/api/routes/invoices.ts
```

Fix each usage; run `pnpm build` to verify clean.

Commit: `refactor(api): align invoices route with new parser shape`

### Task F2: Visual regression snapshot

Create `tests/visualization/snapshot.test.ts` that renders `sample_fa3_full.xml` + `sample_fa3_extended.xml` through both renderers and compares against checked-in baselines (`tests/visualization/__snapshots__/*.html`, `*.pdf.meta.json` — PDF length + page count, not bytes).

Baseline creation policy: on first run, write the baseline; on subsequent runs, compare. Gate with `UPDATE_SNAPSHOTS=1` env to refresh.

Commit: `test(visualization): snapshot guard for HTML + PDF shape`

### Task F3: Manual visual verification

Spin up the dev server, seed a tenant + fixture invoice in the DB, and eyeball both routes:

```bash
pnpm dev
# in another shell:
curl -H "X-API-Key: $KEY" http://localhost:3000/api/v1/tenants/$TID/invoices/$IID?format=html > /tmp/inv.html
curl -H "X-API-Key: $KEY" http://localhost:3000/api/v1/tenants/$TID/invoices/$IID?format=pdf > /tmp/inv.pdf
```

Open both side-by-side with the ziher Rails equivalent. **This step catches layout regressions the snapshot tests can't** (per CLAUDE.md: "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete").

No commit — this is a human verification gate. If regressions found, add a follow-up task and iterate.

### Task F4: Update CLAUDE.md "Current state" section

Replace "This repo is a fresh Hono scaffold" with a current description. Add a §Visualization paragraph explaining the 12-section mirror of ziher's Rails partials, the `Ksef::Pdf::Dictionaries` port, and the StyleSheet-vs-CSS divergence policy.

Commit: `docs: update CLAUDE.md for visualization implementation`

---

## Risk register

| Risk | Mitigation |
|---|---|
| `@react-pdf/renderer` StyleSheet lacks CSS features used in ziher (`::before`, grid, page-break-inside) | Accept structural parity; document in CLAUDE.md. If pixel parity required later, evaluate `pdf-lib` or a headless-HTML path (CLAUDE.md currently rules out Chrome — revisit with the user). |
| Breaking change to `InvoiceFa3` shape cascades through `src/api/routes/invoices.ts`, `src/ksef/sync.ts`, `src/visualization/*` | Each parser task fixes consumers in the same commit (tsc gate). Phase F1 is a final sweep. |
| Fixture `sample_fa3_extended.xml` drifts from FA(3) schema over time | Keep a comment at the top of the file noting "synthetic — covers optional sections, not XSD-validated". If schema validation is added later (new task), validate fixtures in CI. |
| Ziher ERB has Rails helpers we can't cleanly port (`number_to_currency`, `l()`, `truncate`, `ksef_fmt_money`) | Write tiny local equivalents in `src/visualization/format.ts`. Simple, no deps. |
| Polish diacritics in HTML output encoded wrong | Hono JSX emits UTF-8; verify `<meta charset="utf-8">` in the document head. For PDF, `Times-Roman` supports Latin Extended-A (covers ąćęłńóśźż). Manual eyeball in F3. |

---

## Commit cadence summary

Phase A: 2 commits. Phase B: 1. Phase C: 13. Phase D: 14. Phase E: 14. Phase F: 3. **≈ 47 commits** total — small, review-able, each one runs tests green.
