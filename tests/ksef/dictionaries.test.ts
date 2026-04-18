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
