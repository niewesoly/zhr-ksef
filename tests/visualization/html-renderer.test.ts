import { suite, test } from "node:test";
import { strict as assert } from "node:assert";
import { renderInvoiceHtml } from "../../src/visualization/html-renderer.js";
import { parseInvoiceFa3 } from "../../src/ksef/parser.js";
import { loadFixture } from "../helpers/fixtures.js";

const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "TEST-KSEF-001");

suite("html-renderer", () => {
  test("naglowek renders KSeF brand + invoice number + rodzaj + ksef number", () => {
    const html = renderInvoiceHtml(inv);
    assert.match(html, /ksef-naglowek__brand/);
    assert.match(html, />e<\/span>-Faktur/);
    assert.match(html, /ksef-naglowek__number/);
    assert.match(html, /Faktura korygująca zbiorcza \(rabat\)/);
    assert.match(html, /ksef-naglowek__ksef/);
  });

  test("daneFaKorygowanej renders table rows when array is populated", () => {
    const html = renderInvoiceHtml(inv); // inv from extended fixture
    assert.match(html, /ksef-section__title.*Dane faktury korygowanej|Dane faktury korygowanej.*ksef-section__title/);
    assert.match(html, /Numer faktury korygowanej/);
    assert.match(html, /ksef-table/);
  });

  test("daneFaKorygowanej renders nothing when array is empty", () => {
    const invSimple = parseInvoiceFa3(loadFixture("sample_fa3.xml"), "K");
    const html = renderInvoiceHtml(invSimple);
    assert.doesNotMatch(html, /Dane faktury korygowanej/);
  });
});
