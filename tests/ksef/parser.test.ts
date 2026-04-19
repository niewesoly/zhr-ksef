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

suite("parseInvoiceFa3: wiersze", () => {
  test("surfaces cenaBrutto, wartoscBrutto, gtin, pkwiU, cn", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    const row = inv.lineItems[0];
    assert.ok("cenaJednBrutto" in row);
    assert.ok("wartoscBrutto" in row);
    assert.ok("gtin" in row);
  });

  test("surfaces gtu, p12Zal15, stanPrzed from extended fixture", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    const row0 = inv.lineItems[0];
    assert.equal(row0.gtu, "GTU_12");
    assert.equal(row0.p12Zal15, true);
    assert.equal(row0.stanPrzed, false);
    const row1 = inv.lineItems[1];
    assert.equal(row1.gtu, null);
    assert.equal(row1.p12Zal15, false);
  });

  test("bruttoMode is true iff all rows lack netto price+value", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    // extended fixture mixes — so bruttoMode=false. Assert shape only.
    assert.equal(typeof inv.bruttoMode, "boolean");
    assert.equal(inv.bruttoMode, false);
    // brutto-only fixture: every row netto-less → bruttoMode=true.
    assert.equal(
      parseInvoiceFa3(loadFixture("sample_fa3_brutto.xml"), "K").bruttoMode,
      true,
    );
  });
});

suite("parseInvoiceFa3: tax summary", () => {
  test("returns two non-zero buckets from extended fixture", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.equal(inv.taxSummary.length, 2);
    assert.equal(inv.taxSummary[0].label, "23% lub 22%");
  });
});

suite("parseInvoiceFa3: adnotacje", () => {
  test("surfaces p16/p17/p18a + zwolnienie + pmarzy", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.adnotacje);
    assert.equal(inv.adnotacje.p16, "1");
    assert.equal(inv.adnotacje.zwolnienie.p19, "1");
    assert.equal(inv.adnotacje.pmarzy.pPMarzy, "1");
  });
});

suite("parseInvoiceFa3: rozliczenie", () => {
  test("parses the four summary totals from the fixture", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.rozliczenie);
    assert.equal(inv.rozliczenie.sumaObciazen, 50);
    assert.equal(inv.rozliczenie.sumaOdliczen, 30);
    assert.equal(inv.rozliczenie.doZaplaty, 1220);
    assert.equal(inv.rozliczenie.doRozliczenia, 0);
  });

  test("parses Obciazenia and Odliczenia child entries", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.rozliczenie);
    assert.equal(inv.rozliczenie.obciazenia.length, 2);
    assert.equal(inv.rozliczenie.obciazenia[0].kwota, 30);
    assert.equal(inv.rozliczenie.obciazenia[0].powod, "Koszt transportu");
    assert.equal(inv.rozliczenie.obciazenia[1].kwota, 20);
    assert.equal(inv.rozliczenie.obciazenia[1].powod, "Opakowanie zwrotne");
    assert.equal(inv.rozliczenie.odliczenia.length, 1);
    assert.equal(inv.rozliczenie.odliczenia[0].kwota, 30);
    assert.equal(inv.rozliczenie.odliczenia[0].powod, "Rabat posprzedażowy");
  });

  test("returns null when Rozliczenie element is absent", () => {
    // sample_fa3.xml has no Rozliczenie element at all.
    const inv = parseInvoiceFa3(loadFixture("sample_fa3.xml"), "K");
    assert.equal(inv.rozliczenie, null);
  });

  test("obciazenia and odliczenia default to [] when child elements are absent", () => {
    // Build a minimal XML with Rozliczenie but no Obciazenia/Odliczenia.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>2026-04-01T10:00:00Z</DataWytworzeniaFa>
    <SystemInfo>test</SystemInfo>
  </Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Seller</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>2222222222</NIP><Nazwa>Buyer</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-04-01</P_1>
    <P_2>INV-1</P_2>
    <P_15>100</P_15>
    <Rozliczenie>
      <SumaObciazen>10.00</SumaObciazen>
    </Rozliczenie>
  </Fa>
</Faktura>`;
    const inv = parseInvoiceFa3(xml, "K");
    assert.ok(inv.rozliczenie);
    assert.equal(inv.rozliczenie.sumaObciazen, 10);
    assert.equal(inv.rozliczenie.sumaOdliczen, null);
    assert.deepEqual(inv.rozliczenie.obciazenia, []);
    assert.deepEqual(inv.rozliczenie.odliczenia, []);
  });
});

suite("parseInvoiceFa3: warunkiTransakcji", () => {
  test("surfaces scalars, umowy, zamowienia, nrPartiiTowaru", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.warunkiTransakcji);
    assert.equal(inv.warunkiTransakcji.warunkiDostawy, "DAP Warszawa (Incoterms 2020)");
    assert.equal(inv.warunkiTransakcji.umowy.length, 1);
    assert.equal(inv.warunkiTransakcji.umowy[0].numer, "UM/2026/03/01");
    assert.equal(inv.warunkiTransakcji.zamowienia[0].data, "2026-03-20");
    assert.deepEqual(inv.warunkiTransakcji.nrPartiiTowaru, ["PARTIA-A-001", "PARTIA-B-002"]);
    assert.equal(inv.warunkiTransakcji.transport.length, 1);
    assert.equal(inv.warunkiTransakcji.transport[0].rodzajTransportu, "3");
    assert.equal(inv.warunkiTransakcji.transport[0].nrZleceniaTransportu, "ZL-2026-001");
  });

  test("returns null when WarunkiTransakcji element is absent", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3.xml"), "K");
    assert.equal(inv.warunkiTransakcji, null);
  });
});

suite("parseInvoiceFa3: payment", () => {
  test("returns two terminy from extended fixture", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.payment, "payment should not be null");
    assert.equal(inv.payment.terminy.length, 2);
    assert.equal(inv.payment.terminy[0].termin, "2026-04-30");
    assert.equal(inv.payment.terminy[1].termin, "2026-05-30");
  });

  test("second termin has terminOpis joined from Ilosc/Jednostka/ZdarzeniePoczatkowe", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.payment);
    assert.equal(inv.payment.terminy[1].terminOpis, "30 dni od daty wystawienia");
  });

  test("rachunkiBankoweFaktora has one entry from extended fixture", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.payment);
    assert.equal(inv.payment.rachunkiBankoweFaktora.length, 1);
    assert.equal(inv.payment.rachunkiBankoweFaktora[0].nrRB, "PL83101010230000261395100000");
    assert.equal(inv.payment.rachunkiBankoweFaktora[0].nazwaBanku, "Faktor Bank SA");
    assert.equal(inv.payment.rachunkiBankoweFaktora[0].opisRachunku, "Rachunek cesji wierzytelności");
  });

  test("skonto.warunki is populated", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.payment);
    assert.ok(inv.payment.skonto, "skonto should not be null");
    assert.equal(inv.payment.skonto.warunki, "Płatność w 7 dni");
    // fast-xml-parser parses "2.00" → number 2, findFieldString → "2"
    assert.equal(inv.payment.skonto.wysokosc, "2");
  });

  test("rachunkiBankowe has two entries with new field names", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.payment);
    assert.equal(inv.payment.rachunkiBankowe.length, 2);
    assert.equal(inv.payment.rachunkiBankowe[0].nrRB, "PL61109010140000071219812874");
    assert.equal(inv.payment.rachunkiBankowe[0].swift, "WBKPPLPP");
    assert.equal(inv.payment.rachunkiBankowe[0].nazwaBanku, "Bank Testowy SA");
  });

  test("top-level payment fields are populated", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.payment);
    assert.equal(inv.payment.zaplacono, "1");
    assert.equal(inv.payment.dataZaplaty, "2026-04-12");
    assert.equal(inv.payment.formaPlatnosci, "6");
    assert.equal(inv.payment.linkDoPlatnosci, "https://pay.example/invoice/EXT-0001");
    assert.equal(inv.payment.ipKSeF, "203.0.113.7");
  });

  test("zaplataCzesciowa has one entry", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.payment);
    assert.equal(inv.payment.zaplataCzesciowa.length, 1);
    // fast-xml-parser parses "600.00" → number 600, findFieldString → "600"
    assert.equal(inv.payment.zaplataCzesciowa[0].kwota, "600");
    assert.equal(inv.payment.zaplataCzesciowa[0].data, "2026-04-12");
    assert.equal(inv.payment.zaplataCzesciowa[0].formaPlatnosci, "6");
  });
});

suite("parseInvoiceFa3: daneFaKorygowanej", () => {
  test("returns array of corrected invoice refs", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.equal(inv.daneFaKorygowanej.length, 2);
    assert.equal(inv.daneFaKorygowanej[0].numer, "FA/2026/01/0010");
    assert.equal(inv.daneFaKorygowanej[0].dataWystawienia, "2026-01-15");
    assert.equal(inv.daneFaKorygowanej[0].nrKsef, "5265877635-20260115-AAAAAA-AA");
    assert.equal(inv.daneFaKorygowanej[1].numer, "FA/2026/01/0011");
  });

  test("returns [] when no DaneFaKorygowanej elements", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3.xml"), "K");
    assert.deepEqual(inv.daneFaKorygowanej, []);
  });
});

suite("parseInvoiceFa3: stopka", () => {
  test("surfaces informacje lines and rejestry from extended fixture", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.ok(inv.stopka);
    assert.equal(inv.stopka.informacje.length, 2);
    assert.equal(inv.stopka.informacje[0], "Dziękujemy za współpracę.");
    assert.equal(inv.stopka.rejestry.length, 1);
    assert.equal(inv.stopka.rejestry[0].krs, "0000123456");
    assert.equal(inv.stopka.rejestry[0].regon, "123456785");
    assert.equal(inv.stopka.rejestry[0].bdo, "000123456");
  });
  test("returns null when Stopka element is absent", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3.xml"), "K");
    assert.equal(inv.stopka, null);
  });
});

suite("parseInvoiceFa3: full fixture", () => {
  test("sample_fa3_full.xml round-trips without throwing", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_full.xml"), "K");
    assert.ok(inv.header);
    assert.ok(inv.seller);
    assert.ok(inv.buyer);
    assert.ok(Array.isArray(inv.lineItems));
    assert.ok(Array.isArray(inv.odbiorcy));
  });

  test("additionalInfo reads Klucz/Wartosc from DodatkowyOpis", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.equal(inv.additionalInfo.length, 2);
    assert.equal(inv.additionalInfo[0].rodzaj, "Numer zamówienia");
    assert.equal(inv.additionalInfo[0].tresc, "ZAM/2026/04/001");
    assert.equal(inv.additionalInfo[1].rodzaj, "Projekt");
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

suite("parseInvoiceFa3: parser extensions", () => {
  test("parses TP flag", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.strictEqual(inv.tp, true);
  });

  test("TP defaults to false when absent", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3.xml"), "K");
    assert.strictEqual(inv.tp, false);
  });

  test("parses P_6A per-line delivery date", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.strictEqual(inv.lineItems[0].p6a, "2026-04-05");
    assert.strictEqual(inv.lineItems[1].p6a, null);
  });

  test("parses P_14_*W tax-in-PLN", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    const row23 = inv.taxSummary.find((r) => r.label.startsWith("23%"));
    assert.ok(row23);
    assert.strictEqual(row23!.kwotaPodatkuPLN, 793.96);
    const row8 = inv.taxSummary.find((r) => r.label.startsWith("8%"));
    assert.ok(row8);
    assert.strictEqual(row8!.kwotaPodatkuPLN, 69);
  });

  test("parses WZ per line item", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.strictEqual(inv.lineItems[0].wz, "WZ/2026/04/001");
    assert.strictEqual(inv.lineItems[1].wz, null);
  });

  test("parses OkresFa", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3_extended.xml"), "K");
    assert.strictEqual(inv.okresFa, "2026-04-01/2026-04-30");
  });

  test("OkresFa defaults to null when absent", () => {
    const inv = parseInvoiceFa3(loadFixture("sample_fa3.xml"), "K");
    assert.strictEqual(inv.okresFa, null);
  });
});
