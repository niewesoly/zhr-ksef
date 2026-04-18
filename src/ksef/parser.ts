import { XMLParser } from "fast-xml-parser";
import {
  isRecord,
  toArray,
  findField,
  findFieldRecord,
  findFieldString,
  findFieldNumber,
} from "./xml-helpers.js";

// Hard cap on invoice XML size. Prevents OOM/DoS when a hostile export
// member returns an unexpectedly large payload. KSeF invoices are tiny
// (typically <200KB); 10MB is a generous ceiling.
export const MAX_INVOICE_XML_BYTES = 10 * 1024 * 1024;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PartyAddress {
  adresL1: string | null;
  adresL2: string | null;
  kodKraju: string | null; // country code, resolved to name e.g. "PL" → "Poland"
}

export interface PartyContact {
  email: string | null;
  telefon: string | null;
}

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
  nazwa: string | null; // Nazwa OR ImieNazwisko fallback
  adres: PartyAddress | null;
  adresKoresp: PartyAddress | null;
  daneKontaktowe: PartyContact[]; // FA(3) allows multiple
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

export interface InvoiceLineItem {
  lp: number;
  uuid: string | null;
  nazwa: string | null;
  cenaJednNetto: number | null;
  cenaJednBrutto: number | null;
  ilosc: number | null;
  miara: string | null;
  rabat: number | null;
  stawkaPodatku: string | null;
  wartoscNetto: number | null;
  wartoscBrutto: number | null;
  gtin: string | null;
  pkwiU: string | null;
  cn: string | null;
}

export interface TaxSummaryRow {
  lp: number;
  label: string;
  kwotaNetto: number;
  kwotaPodatku: number;
  kwotaBrutto: number;
}

export interface AdditionalInfo {
  lp: number;
  rodzaj: string;
  tresc: string;
}

export interface PaymentInfo {
  method: string | null;
  info: string | null;
  dueDate: string | null;
  dueAmount: number | null;
}

export interface BankAccount {
  iban: string | null;
  swift: string | null;
  bankName: string | null;
  ownAccount: boolean;
  description: string | null;
}

export interface RegistryEntry {
  pelnaNazwa: string | null;
  krs: string | null;
  regon: string | null;
}

export interface InvoiceHeader {
  kodSystemowy: string | null;
  wersjaSchemy: string | null;
  wariantFormularza: string | null;
  dataWytworzeniaFa: string | null;
  systemInfo: string | null;
}

export interface AdnotacjeZwolnienie {
  p19: string | null;
  p19a: string | null;
  p19b: string | null;
  p19c: string | null;
  p19n: string | null;
}

export interface AdnotacjeNoweSrodki {
  p22: string | null;
  p42_5: string | null;
  p22n: string | null;
}

export interface AdnotacjePMarzy {
  pPMarzy: string | null;
  pPMarzy_2: string | null;
  pPMarzy_3_1: string | null;
  pPMarzy_3_2: string | null;
  pPMarzy_3_3: string | null;
  pPMarzyN: string | null;
}

export interface Adnotacje {
  p16: string | null;
  p17: string | null;
  p18: string | null;
  p18a: string | null;
  p23: string | null;
  zwolnienie: AdnotacjeZwolnienie;
  noweSrodkiTransportu: AdnotacjeNoweSrodki;
  pmarzy: AdnotacjePMarzy;
}

export interface RozliczenieLineItem {
  kwota: number | null;
  powod: string | null;
}

export interface Rozliczenie {
  sumaObciazen: number | null;
  sumaOdliczen: number | null;
  doZaplaty: number | null;
  doRozliczenia: number | null;
  obciazenia: RozliczenieLineItem[];
  odliczenia: RozliczenieLineItem[];
}

export interface InvoiceFa3 {
  ksefNumber: string;
  header: InvoiceHeader;
  invoiceNumber: string | null;
  invoiceType: string | null;
  invoiceTypeLabel: string;
  issueDate: string | null;
  saleDate: string | null;
  currency: string;
  placeOfIssue: string | null;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  odbiorcy: InvoiceParty[];
  lineItems: InvoiceLineItem[];
  bruttoMode: boolean;
  totalGross: number | null;
  taxSummary: TaxSummaryRow[];
  additionalInfo: AdditionalInfo[];
  payment: PaymentInfo | null;
  bankAccounts: BankAccount[];
  registries: RegistryEntry[];
  correctedInvoiceNumber: string | null;
  correctedInvoiceDate: string | null;
  correctionReason: string | null;
  przyczynaKorekty: string | null;
  okresFaKorygowanej: string | null;
  adnotacje: Adnotacje | null;
  rozliczenie: Rozliczenie | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const CORRECTION_TYPES = ["KOR", "KOR_ZAL", "KOR_ROZ"] as const;

const INVOICE_TYPE_LABEL: Record<string, string> = {
  VAT: "Faktura podstawowa",
  KOR: "Faktura korygująca",
  ZAL: "Faktura zaliczkowa",
  ROZ: "Faktura rozliczeniowa",
  UPR: "Faktura uproszczona",
  KOR_ZAL: "Korekta faktury zaliczkowej",
  KOR_ROZ: "Korekta faktury rozliczeniowej",
};

export const PAYMENT_METHOD: Record<string, string> = {
  "1": "Gotówka",
  "2": "Karta",
  "3": "Bon",
  "4": "Czek",
  "5": "Kredyt",
  "6": "Przelew",
  "7": "Płatność mobilna",
};

const COUNTRY_NAME: Record<string, string> = {
  PL: "Polska", DE: "Niemcy", FR: "Francja", CZ: "Czechy", SK: "Słowacja",
  HU: "Węgry", RO: "Rumunia", AT: "Austria", BE: "Belgia", BG: "Bułgaria",
  HR: "Chorwacja", CY: "Cypr", DK: "Dania", EE: "Estonia", FI: "Finlandia",
  GR: "Grecja", IE: "Irlandia", IT: "Włochy", LV: "Łotwa", LT: "Litwa",
  LU: "Luksemburg", MT: "Malta", NL: "Holandia", PT: "Portugalia",
  SI: "Słowenia", ES: "Hiszpania", SE: "Szwecja", GB: "Wielka Brytania",
  NO: "Norwegia", CH: "Szwajcaria", UA: "Ukraina", US: "USA", CN: "Chiny",
};

// FA(3) tax summary buckets — ported from ziher's parser.rb VAT_BUCKETS.
// Each bucket reads a net field (P_13_*) and optionally a paired tax field
// (P_14_*). Buckets 6–13 have no tax column; tax defaults to 0 for them.
const VAT_BUCKETS: ReadonlyArray<{
  net: string;
  tax: string | null;
  label: string;
}> = [
  { net: "P_13_1", tax: "P_14_1", label: "23% lub 22%" },
  { net: "P_13_2", tax: "P_14_2", label: "8% lub 7%" },
  { net: "P_13_3", tax: "P_14_3", label: "5%" },
  { net: "P_13_4", tax: "P_14_4", label: "4% lub 3%" },
  { net: "P_13_5", tax: "P_14_5", label: "OSS" },
  { net: "P_13_6_1", tax: null, label: "0% (krajowe)" },
  { net: "P_13_6_2", tax: null, label: "0% WDT" },
  { net: "P_13_6_3", tax: null, label: "0% eksport" },
  { net: "P_13_7", tax: null, label: "zwolnione od podatku" },
  { net: "P_13_8", tax: null, label: "np. z wył. art. 100 ust. 1 pkt 4" },
  { net: "P_13_9", tax: null, label: "np. art. 100 ust. 1 pkt 4" },
  { net: "P_13_10", tax: null, label: "odwrotne obciążenie" },
  { net: "P_13_11", tax: null, label: "marża" },
];

// ─── Parser ───────────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) =>
    ["FaWiersz", "RachunekBankowy", "DodatkowyOpis", "TerminPlatnosci", "Obciazenia", "Odliczenia"].some((n) =>
      name.endsWith(n),
    ),
  parseAttributeValue: true,
  parseTagValue: true,
  // Prevent precision loss for IBANs (26 digits) and similar long numeric strings
  numberParseOptions: { hex: false, leadingZeros: false, skipLike: /^\d{16,}$/ },
  // XXE hardening: disable entity expansion so DTD/entity declarations
  // embedded in a hostile export cannot be used to exfiltrate/DoS.
  processEntities: false,
});

function parseAddress(
  obj: Record<string, unknown>,
  fieldName = "Adres",
): PartyAddress | null {
  const adres = findFieldRecord(obj, fieldName);
  if (!adres) return null;
  const adresL1 = findFieldString(adres, "AdresL1");
  const adresL2 = findFieldString(adres, "AdresL2");
  const kodKraju = findFieldString(adres, "KodKraju");
  if (!adresL1 && !adresL2 && !kodKraju) return null;
  return {
    adresL1,
    adresL2,
    kodKraju: kodKraju ? (COUNTRY_NAME[kodKraju] ?? kodKraju) : null,
  };
}

function parseRegistry(obj: Record<string, unknown>): PartyRegistry | null {
  const rejestr = findFieldRecord(obj, "DaneRejestrowe");
  if (!rejestr) return null;
  const nazwaPelna = findFieldString(rejestr, "NazwaPelna");
  const krs = findFieldString(rejestr, "KRS");
  const regon = findFieldString(rejestr, "REGON");
  if (!nazwaPelna && !krs && !regon) return null;
  return { nazwaPelna, krs, regon };
}

function parseContacts(podmiot: Record<string, unknown>): PartyContact[] {
  return toArray(findField(podmiot, "DaneKontaktowe")).map((row) => ({
    email: findFieldString(row, "Email"),
    telefon: findFieldString(row, "Telefon"),
  }));
}

// The `role` parameter is a documentation/disambiguation aid. Fields are
// read unconditionally across all Podmiot slots; absent XML yields null.
type PartyRole = "sprzedawca" | "nabywca" | "podmiot3";

function parseParty(podmiot: Record<string, unknown>, _role: PartyRole): InvoiceParty {
  const dane = findFieldRecord(podmiot, "DaneIdentyfikacyjne");
  const nazwa = dane
    ? (findFieldString(dane, "Nazwa") ?? findFieldString(dane, "ImieNazwisko"))
    : null;

  return {
    prefiksPodatnika: findFieldString(podmiot, "PrefiksPodatnika"),
    nrEORI: findFieldString(podmiot, "NrEORI"),
    nip: dane ? findFieldString(dane, "NIP") : null,
    kodUE: dane ? findFieldString(dane, "KodUE") : null,
    nrVatUE: dane ? findFieldString(dane, "NrVatUE") : null,
    brakID: dane ? findFieldString(dane, "BrakID") : null,
    nazwa,
    adres: parseAddress(podmiot, "Adres"),
    adresKoresp: parseAddress(podmiot, "AdresKoresp"),
    daneKontaktowe: parseContacts(podmiot),
    daneRejestrowe: parseRegistry(podmiot),
    nrKlienta: findFieldString(podmiot, "NrKlienta"),
    idNabywcy: findFieldString(podmiot, "IDNabywcy"),
    jst: findFieldString(podmiot, "JST") === "1",
    gv: findFieldString(podmiot, "GV") === "1",
    statusInfoPodatnika: findFieldString(podmiot, "StatusInfoPodatnika"),
    rolaPodmiotu3: findFieldString(podmiot, "RolaPodmiotu3"),
    udzialPodmiotu3: findFieldString(podmiot, "UdzialPodmiotu3"),
  };
}

function parseLineItems(fa: Record<string, unknown>): InvoiceLineItem[] {
  const rows = toArray(findField(fa, "FaWiersz"));

  return rows.map((row, idx) => {
    if (!isRecord(row)) return null;
    return {
      lp: idx + 1,
      uuid: findFieldString(row, "NrWierszaFa"),
      nazwa: findFieldString(row, "P_7"),
      cenaJednNetto: findFieldNumber(row, "P_9A"),
      cenaJednBrutto: findFieldNumber(row, "P_9B"),
      ilosc: findFieldNumber(row, "P_8B"),
      miara: findFieldString(row, "P_8A"),
      rabat: findFieldNumber(row, "P_10"),
      stawkaPodatku: findFieldString(row, "P_12"),
      wartoscNetto: findFieldNumber(row, "P_11"),
      wartoscBrutto: findFieldNumber(row, "P_11A"),
      gtin: findFieldString(row, "GTIN"),
      pkwiU: findFieldString(row, "PKWiU"),
      cn: findFieldString(row, "CN"),
    } satisfies InvoiceLineItem;
  }).filter((x): x is InvoiceLineItem => x !== null);
}

function parseTaxSummary(fa: Record<string, unknown>): TaxSummaryRow[] {
  const rows: TaxSummaryRow[] = [];
  let lp = 1;

  for (const bucket of VAT_BUCKETS) {
    const net = findFieldNumber(fa, bucket.net);
    const tax = bucket.tax ? findFieldNumber(fa, bucket.tax) : null;
    if (net == null && tax == null) continue;
    const netVal = net ?? 0;
    const taxVal = tax ?? 0;
    // Mirror ziher: skip rows where both net and tax are zero.
    if (netVal === 0 && taxVal === 0) continue;
    rows.push({
      lp: lp++,
      label: bucket.label,
      kwotaNetto: netVal,
      kwotaPodatku: taxVal,
      kwotaBrutto: netVal + taxVal,
    });
  }

  return rows;
}

function parseAdditionalInfo(fa: Record<string, unknown>): AdditionalInfo[] {
  const rows = toArray(findField(fa, "DodatkowyOpis"));

  return rows
    .map((row, idx) => {
      if (!isRecord(row)) return null;
      const rodzaj = findFieldString(row, "NazwaInformacji") ?? findFieldString(row, "Rodzaj") ?? "";
      const tresc = findFieldString(row, "TrescInformacji") ?? findFieldString(row, "Wartosc") ?? "";
      return { lp: idx + 1, rodzaj, tresc } satisfies AdditionalInfo;
    })
    .filter((x): x is AdditionalInfo => x !== null);
}

function parsePayment(platnosc: Record<string, unknown>): PaymentInfo {
  const methodCode = findFieldString(platnosc, "FormaPlatnosci");
  const info = findFieldString(platnosc, "InformacjaOPlatnosci");

  // TerminPlatnosci may be an object with Termin field or a simple date string
  const terminRaw = findField(platnosc, "TerminPlatnosci");
  let dueDate: string | null = null;
  let dueAmount: number | null = null;

  if (isRecord(terminRaw)) {
    dueDate = findFieldString(terminRaw, "Termin");
    dueAmount = findFieldNumber(terminRaw, "Kwota");
  } else if (Array.isArray(terminRaw) && terminRaw.length > 0) {
    const first = terminRaw[0];
    if (isRecord(first)) {
      dueDate = findFieldString(first, "Termin");
      dueAmount = findFieldNumber(first, "Kwota");
    }
  } else if (terminRaw != null) {
    dueDate = String(terminRaw).trim() || null;
  }

  return {
    method: methodCode ? (PAYMENT_METHOD[methodCode] ?? methodCode) : null,
    info,
    dueDate,
    dueAmount,
  };
}

function parseBankAccounts(platnosc: Record<string, unknown>): BankAccount[] {
  const rows = toArray(findField(platnosc, "RachunekBankowy"));

  return rows
    .map((row) => {
      if (!isRecord(row)) return null;
      return {
        iban: findFieldString(row, "NrRB"),
        swift: findFieldString(row, "SWIFT"),
        bankName: findFieldString(row, "NazwaBanku"),
        ownAccount: findField(row, "RachunekWlasnyBanku") === true,
        description: findFieldString(row, "OpisRachunku"),
      } satisfies BankAccount;
    })
    .filter((x): x is BankAccount => x !== null);
}

function parseRegistries(podmiot1: Record<string, unknown>): RegistryEntry[] {
  const rejestr = findFieldRecord(podmiot1, "DaneRejestrowe");
  if (!rejestr) return [];

  const pelnaNazwa = findFieldString(rejestr, "NazwaPelna");
  const krs = findFieldString(rejestr, "KRS");
  const regon = findFieldString(rejestr, "REGON");

  if (!pelnaNazwa && !krs && !regon) return [];
  return [{ pelnaNazwa, krs, regon }];
}

function parseAdnotacje(fa: Record<string, unknown>): Adnotacje | null {
  const adnotacje = findFieldRecord(fa, "Adnotacje");
  if (!adnotacje) return null;

  const zwolnienieNode = findFieldRecord(adnotacje, "Zwolnienie");
  const zwolnienie: AdnotacjeZwolnienie = {
    p19: zwolnienieNode ? findFieldString(zwolnienieNode, "P_19") : null,
    p19a: zwolnienieNode ? findFieldString(zwolnienieNode, "P_19A") : null,
    p19b: zwolnienieNode ? findFieldString(zwolnienieNode, "P_19B") : null,
    p19c: zwolnienieNode ? findFieldString(zwolnienieNode, "P_19C") : null,
    p19n: zwolnienieNode ? findFieldString(zwolnienieNode, "P_19N") : null,
  };

  const noweNode = findFieldRecord(adnotacje, "NoweSrodkiTransportu");
  const noweSrodkiTransportu: AdnotacjeNoweSrodki = {
    p22: noweNode ? findFieldString(noweNode, "P_22") : null,
    p42_5: noweNode ? findFieldString(noweNode, "P_42_5") : null,
    p22n: noweNode ? findFieldString(noweNode, "P_22N") : null,
  };

  const pmarzyNode = findFieldRecord(adnotacje, "PMarzy");
  const pmarzy: AdnotacjePMarzy = {
    pPMarzy: pmarzyNode ? findFieldString(pmarzyNode, "P_PMarzy") : null,
    pPMarzy_2: pmarzyNode ? findFieldString(pmarzyNode, "P_PMarzy_2") : null,
    pPMarzy_3_1: pmarzyNode ? findFieldString(pmarzyNode, "P_PMarzy_3_1") : null,
    pPMarzy_3_2: pmarzyNode ? findFieldString(pmarzyNode, "P_PMarzy_3_2") : null,
    pPMarzy_3_3: pmarzyNode ? findFieldString(pmarzyNode, "P_PMarzy_3_3") : null,
    pPMarzyN: pmarzyNode ? findFieldString(pmarzyNode, "P_PMarzyN") : null,
  };

  return {
    p16: findFieldString(adnotacje, "P_16"),
    p17: findFieldString(adnotacje, "P_17"),
    p18: findFieldString(adnotacje, "P_18"),
    p18a: findFieldString(adnotacje, "P_18A"),
    p23: findFieldString(adnotacje, "P_23"),
    zwolnienie,
    noweSrodkiTransportu,
    pmarzy,
  };
}

function parseRozliczenieEntries(
  rozliczenie: Record<string, unknown>,
  fieldName: string,
): RozliczenieLineItem[] {
  return toArray(findField(rozliczenie, fieldName)).map((row) => ({
    kwota: findFieldNumber(row, "Kwota"),
    powod: findFieldString(row, "Powod"),
  }));
}

function parseRozliczenie(fa: Record<string, unknown>): Rozliczenie | null {
  const rozliczenie = findFieldRecord(fa, "Rozliczenie");
  if (!rozliczenie) return null;

  return {
    sumaObciazen: findFieldNumber(rozliczenie, "SumaObciazen"),
    sumaOdliczen: findFieldNumber(rozliczenie, "SumaOdliczen"),
    doZaplaty: findFieldNumber(rozliczenie, "DoZaplaty"),
    doRozliczenia: findFieldNumber(rozliczenie, "DoRozliczenia"),
    obciazenia: parseRozliczenieEntries(rozliczenie, "Obciazenia"),
    odliczenia: parseRozliczenieEntries(rozliczenie, "Odliczenia"),
  };
}

function parseHeader(faktura: Record<string, unknown>): InvoiceHeader {
  const naglowek = findFieldRecord(faktura, "Naglowek");
  if (!naglowek) {
    return {
      kodSystemowy: null,
      wersjaSchemy: null,
      wariantFormularza: null,
      dataWytworzeniaFa: null,
      systemInfo: null,
    };
  }

  const kodFormularza = findFieldRecord(naglowek, "KodFormularza");
  const kodSystemowy = kodFormularza
    ? findFieldString(kodFormularza, "@_kodSystemowy")
    : null;
  const wersjaSchemy = kodFormularza
    ? findFieldString(kodFormularza, "@_wersjaSchemy")
    : null;

  return {
    kodSystemowy,
    wersjaSchemy,
    wariantFormularza: findFieldString(naglowek, "WariantFormularza"),
    dataWytworzeniaFa: findFieldString(naglowek, "DataWytworzeniaFa"),
    systemInfo: findFieldString(naglowek, "SystemInfo"),
  };
}

export function parseInvoiceFa3(xml: string, ksefNumber: string): InvoiceFa3 {
  if (Buffer.byteLength(xml, "utf8") > MAX_INVOICE_XML_BYTES) {
    throw new Error(
      `XML faktury przekracza dopuszczalny rozmiar (${MAX_INVOICE_XML_BYTES} B)`,
    );
  }
  const parsed: unknown = parser.parse(xml);
  if (!isRecord(parsed)) throw new Error("Nie można sparsować XML faktury");

  const faktura = findFieldRecord(parsed, "Faktura");
  if (!faktura) throw new Error("Brak elementu Faktura w XML");

  const fa = findFieldRecord(faktura, "Fa");
  if (!fa) throw new Error("Brak elementu Fa w XML");

  const podmiot1 = findFieldRecord(faktura, "Podmiot1") ?? {};
  const podmiot2 = findFieldRecord(faktura, "Podmiot2") ?? {};

  const invoiceType = findFieldString(fa, "RodzajFaktury");
  const invoiceTypeLabel = (invoiceType ? (INVOICE_TYPE_LABEL[invoiceType] ?? invoiceType) : null) ?? "Faktura";

  // Correction data
  const korekta = findFieldRecord(fa, "DaneFaKorygowanej");
  const correctedInvoiceNumber = korekta ? findFieldString(korekta, "P_3A") : null;
  const correctedInvoiceDate = korekta ? findFieldString(korekta, "P_3B") : null;
  const correctionReason = findFieldString(fa, "PrzyczynaKorekty");
  const okresFaKorygowanej = findFieldString(fa, "OkresFaKorygowanej");

  // Payment
  const platnosci = findField(fa, "Platnosc");
  const platnosc = Array.isArray(platnosci)
    ? platnosci.find(isRecord)
    : isRecord(platnosci)
      ? platnosci
      : null;

  const lineItems = parseLineItems(fa);
  const bruttoMode =
    lineItems.length > 0 &&
    lineItems.every((r) => r.cenaJednNetto == null && r.wartoscNetto == null);

  return {
    ksefNumber,
    header: parseHeader(faktura),
    invoiceNumber: findFieldString(fa, "P_2"),
    invoiceType,
    invoiceTypeLabel,
    issueDate: findFieldString(fa, "P_1"),
    saleDate: findFieldString(fa, "P_6"),
    currency: findFieldString(fa, "KodWaluty") ?? "PLN",
    placeOfIssue: findFieldString(fa, "P_1M"),
    seller: parseParty(podmiot1, "sprzedawca"),
    buyer: parseParty(podmiot2, "nabywca"),
    odbiorcy: toArray(findField(faktura, "Podmiot3"))
      .filter(isRecord)
      .map((p) => parseParty(p, "podmiot3")),
    lineItems,
    bruttoMode,
    totalGross: findFieldNumber(fa, "P_15"),
    taxSummary: parseTaxSummary(fa),
    additionalInfo: parseAdditionalInfo(fa),
    payment: platnosc ? parsePayment(platnosc) : null,
    bankAccounts: platnosc ? parseBankAccounts(platnosc) : [],
    registries: parseRegistries(podmiot1),
    correctedInvoiceNumber,
    correctedInvoiceDate,
    correctionReason,
    przyczynaKorekty: correctionReason,
    okresFaKorygowanej,
    adnotacje: parseAdnotacje(fa),
    rozliczenie: parseRozliczenie(fa),
  };
}
