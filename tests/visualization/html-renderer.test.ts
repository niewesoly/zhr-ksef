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

  // D12: WarunkiTransakcji section
  test("warunkiTransakcji renders section title and Umowy list", () => {
    const html = renderInvoiceHtml(inv);
    assert.match(html, /Warunki transakcji/);
    assert.match(html, /Umowy/);
  });

  // D13: Stopka section
  test("stopka renders ksef-section--stopka with informacje and KRS registry entry", () => {
    const html = renderInvoiceHtml(inv);
    assert.match(html, /ksef-section--stopka/);
    assert.match(html, /KRS:/);
  });

  // D14: Final assembly smoke test
  test("renderInvoiceHtml produces valid HTML document with CSP meta and outer wrapper", () => {
    const html = renderInvoiceHtml(inv);
    assert.ok(html.startsWith("<!doctype html>"), "output must start with <!doctype html>");
    assert.match(html, /Content-Security-Policy/, "CSP meta tag must be present");
    assert.match(html, /class="ksef-invoice"/, "outer wrapper element must be present");
  });

  // S1: linkDoPlatnosci XSS guard — javascript: URI must NOT render as <a href>
  test("platnosc does not render javascript: linkDoPlatnosci as an anchor", () => {
    // Build a minimal XML with a javascript: URI in LinkDoPlatnosci
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>9876543210</NIP>
      <Nazwa>Sprzedawca SP. Z O.O.</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>1234567890</NIP>
      <Nazwa>Nabywca SP. Z O.O.</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot2>
  <Fa>
    <P_1>2026-03-15</P_1>
    <P_2>FV/2026/03/XSS</P_2>
    <KodWaluty>PLN</KodWaluty>
    <P_13_1>100.00</P_13_1>
    <P_15>123.00</P_15>
    <FaWiersz>
      <P_7>Testowa usługa</P_7>
      <P_11>100.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
    <Platnosc>
      <LinkDoPlatnosci>javascript:alert(1)</LinkDoPlatnosci>
    </Platnosc>
  </Fa>
</Faktura>`;
    const invXss = parseInvoiceFa3(xml, "XSS-TEST");
    const html = renderInvoiceHtml(invXss);
    // Must NOT contain the javascript: URI as an href attribute
    assert.doesNotMatch(html, /href="javascript:/);
    // Must still render the text value (visible to user without being a link)
    assert.match(html, /javascript:alert\(1\)/);
    // Must NOT wrap it in an anchor element at all
    assert.doesNotMatch(html, /<a [^>]*href="javascript:/);
  });

  // S2: linkDoPlatnosci with https: URL renders as a safe anchor
  test("platnosc renders https: linkDoPlatnosci as an anchor with rel=noopener", () => {
    const html = renderInvoiceHtml(inv);
    // The extended fixture has LinkDoPlatnosci = https://pay.example/invoice/EXT-0001
    assert.match(html, /href="https:\/\/pay\.example\/invoice\/EXT-0001"/);
    assert.match(html, /rel="noopener noreferrer"/);
  });

  // F2: Visual regression guard — all 11 sections present in extended fixture output
  test("regression guard: all 11 sections render for extended fixture", () => {
    const html = renderInvoiceHtml(inv);
    // Naglowek
    assert.match(html, /ksef-naglowek/);
    // DaneFaKorygowanej
    assert.match(html, /Dane faktury korygowanej/);
    // Podmioty
    assert.match(html, /ksef-podmioty/);
    // Szczegoly
    assert.match(html, /Szczegóły/);
    // Wiersze
    assert.match(html, /ksef-table--wiersze/);
    // PodsumowanieStawek
    assert.match(html, /Podsumowanie stawek podatku/);
    // Adnotacje
    assert.match(html, /Adnotacje/);
    // Rozliczenie
    assert.match(html, /Rozliczenie/);
    // Platnosc
    assert.match(html, /Płatność/);
    // WarunkiTransakcji
    assert.match(html, /Warunki transakcji/);
    // Stopka
    assert.match(html, /ksef-section--stopka/);
  });
});
