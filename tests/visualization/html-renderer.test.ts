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

  // D4: Podmiot component
  test("podmiot renders NIP + nazwa", () => {
    const html = renderInvoiceHtml(inv);
    assert.match(html, /ksef-podmiot__label.*NIP|NIP.*ksef-podmiot__label/);
    assert.match(html, /ksef-podmiot__row--name/);
  });

  // D5: Podmioty side-by-side
  test("podmioty renders sprzedawca and nabywca columns", () => {
    const html = renderInvoiceHtml(inv);
    assert.match(html, /ksef-podmioty/);
    assert.match(html, /Sprzedawca/);
    assert.match(html, /Nabywca/);
  });

  // D6: Szczegoly details list
  test("szczegoly renders Data wystawienia, Miejsce wystawienia, Kod waluty", () => {
    const html = renderInvoiceHtml(inv);
    assert.match(html, /Szczegóły/);
    assert.match(html, /Data wystawienia/);
    assert.match(html, /ksef-dl/);
    assert.match(html, /Kod waluty/);
  });

  // D7: Wiersze pozycje table
  test("wiersze renders Pozycje section with table rows", () => {
    const html = renderInvoiceHtml(inv);
    assert.match(html, /Pozycje/);
    assert.match(html, /ksef-table--wiersze/);
    assert.match(html, /Kwota należności ogółem/);
  });

  // D8: PodsumowanieStawek table
  test("podsumowanie stawek renders tax summary table", () => {
    const html = renderInvoiceHtml(inv);
    assert.match(html, /Podsumowanie stawek podatku/);
    assert.match(html, /ksef-table--stawki/);
    assert.match(html, /Kwota podatku/);
  });

  // D9: Adnotacje flags list
  test("adnotacje renders flag list when flags are present", () => {
    const html = renderInvoiceHtml(inv);
    assert.match(html, /Adnotacje/);
    assert.match(html, /ksef-list/);
  });

  // D10: Rozliczenie section
  test("rozliczenie renders section title and Suma obciążeń when present", () => {
    const html = renderInvoiceHtml(inv);
    assert.match(html, /Rozliczenie/);
    assert.match(html, /Suma obciążeń/);
  });

  // D11: Platnosc section
  test("platnosc renders Płatność section title and Rachunek bankowy entries", () => {
    const html = renderInvoiceHtml(inv);
    assert.match(html, /Płatność/);
    assert.match(html, /Rachunek bankowy/);
  });

  test("platnosc renders Skonto block and Data zapłaty częściowej table header", () => {
    const html = renderInvoiceHtml(inv);
    assert.match(html, /Skonto/);
    assert.match(html, /Data zapłaty częściowej/);
  });
});
