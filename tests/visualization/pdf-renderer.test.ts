import { test } from "node:test";
import { strict as assert } from "node:assert";
import { renderInvoicePdf } from "../../src/visualization/pdf-renderer.js";
import { parseInvoiceFa3 } from "../../src/ksef/parser.js";
import type { InvoiceFa3 } from "../../src/ksef/parser.js";
import { loadFixture } from "../helpers/fixtures.js";

function assertValidPdf(buf: unknown, label: string): void {
  assert.ok(Buffer.isBuffer(buf), `${label}: result must be a Buffer`);
  assert.ok((buf as Buffer).length > 0, `${label}: Buffer must be non-empty`);
  assert.equal(
    (buf as Buffer).slice(0, 4).toString("ascii"),
    "%PDF",
    `${label}: must start with %PDF`,
  );
}

test("renderInvoicePdf produces a non-empty Buffer for sample_fa3.xml", async () => {
  const xml = loadFixture("sample_fa3.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-KSEF");
  const buf = await renderInvoicePdf(invoice);
  assert.ok(Buffer.isBuffer(buf), "result must be a Buffer");
  assert.ok(buf.length > 1024, "PDF must be at least 1KB");
  // PDF magic bytes
  assert.equal(buf.slice(0, 4).toString("ascii"), "%PDF", "must start with %PDF");
});

test("renderInvoicePdf produces a valid PDF for sample_fa3_extended.xml", async () => {
  const xml = loadFixture("sample_fa3_extended.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-KSEF-EXT");
  const buf = await renderInvoicePdf(invoice);
  assertValidPdf(buf, "sample_fa3_extended.xml");
});

test("renderInvoicePdf produces a valid PDF for sample_fa3_brutto.xml", async () => {
  const xml = loadFixture("sample_fa3_brutto.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-KSEF-BRUTTO");
  const buf = await renderInvoicePdf(invoice);
  assertValidPdf(buf, "sample_fa3_brutto.xml");
});

test("renderInvoicePdf handles a minimal invoice with zero line items", async () => {
  const minimalParty: InvoiceFa3["seller"] = {
    prefiksPodatnika: null,
    nrEORI: null,
    nip: null,
    kodUE: null,
    nrVatUE: null,
    brakID: null,
    nazwa: null,
    adres: null,
    adresKoresp: null,
    daneKontaktowe: [],
    daneRejestrowe: null,
    nrKlienta: null,
    idNabywcy: null,
    jst: false,
    gv: false,
    statusInfoPodatnika: null,
    rolaPodmiotu3: null,
    udzialPodmiotu3: null,
  };

  const minimal: InvoiceFa3 = {
    ksefNumber: "MINIMAL-KSEF-0001",
    header: {
      kodSystemowy: null,
      wersjaSchemy: null,
      wariantFormularza: null,
      dataWytworzeniaFa: null,
      systemInfo: null,
    },
    invoiceNumber: null,
    invoiceType: null,
    invoiceTypeLabel: "Faktura",
    issueDate: null,
    saleDate: null,
    currency: "PLN",
    placeOfIssue: null,
    seller: minimalParty,
    buyer: minimalParty,
    odbiorcy: [],
    lineItems: [],
    bruttoMode: false,
    totalGross: null,
    taxSummary: [],
    additionalInfo: [],
    payment: null,
    registries: [],
    daneFaKorygowanej: [],
    correctionReason: null,
    okresFaKorygowanej: null,
    adnotacje: null,
    tp: false,
    rozliczenie: null,
    warunkiTransakcji: null,
    stopka: null,
    fakturaZaliczkowa: [],
    okresFa: null,
  };

  const buf = await renderInvoicePdf(minimal);
  assertValidPdf(buf, "minimal invoice");
});

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

test("renderInvoicePdf extended fixture exercises all parity sections", async () => {
  const xml = loadFixture("sample_fa3_extended.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-PARITY");
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

test("renderInvoicePdf called twice with the same fixture returns valid PDFs both times", async () => {
  const xml = loadFixture("sample_fa3.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-KSEF-REPEAT");

  const buf1 = await renderInvoicePdf(invoice);
  const buf2 = await renderInvoicePdf(invoice);

  assertValidPdf(buf1, "first render");
  assertValidPdf(buf2, "second render");
});
