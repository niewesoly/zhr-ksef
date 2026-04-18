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
