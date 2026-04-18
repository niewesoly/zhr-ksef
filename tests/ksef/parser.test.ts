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

suite("parseInvoiceFa3: odbiorcy", () => {
  test("collects all Podmiot3 entries with roles", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.equal(inv.odbiorcy.length, 2);
    assert.equal(inv.odbiorcy[0].rolaPodmiotu3, "1");
    assert.equal(inv.odbiorcy[1].rolaPodmiotu3, "2");
  });
});

suite("parseInvoiceFa3: Fa core", () => {
  test("surfaces p_1m, p_6, okresFaKorygowanej", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.placeOfIssue); // p_1m
    assert.ok(inv.saleDate);     // p_6
    assert.equal(inv.okresFaKorygowanej, "2026-01");
  });
});
