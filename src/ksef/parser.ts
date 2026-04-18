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
  ilosc: number | null;
  miara: string | null;
  rabat: number | null;
  stawkaPodatku: string | null;
  wartoscNetto: number | null;
}

export interface TaxSummaryRow {
  lp: number;
  stawka: string;
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

export const VAT_RATE_LABEL: Record<string, string> = {
  "23": "23% lub 22%",
  "8": "8% lub 7%",
  "5": "5% lub 4%",
  "0": "0%",
  ZW: "zw.",
  NP: "np.",
  OO: "0% (OO)",
  WDT: "0% (WDT)",
  EXP: "0% (EXP)",
  IM: "np. (IM)",
  WNT: "np. (WNT)",
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

// VAT rate field suffixes → VAT rate key (P_13_1/P_14_1 = 23%, etc.)
const VAT_RATE_SUFFIXES: Array<{ suffix: string; rateKey: string }> = [
  { suffix: "1", rateKey: "23" },
  { suffix: "2", rateKey: "8" },
  { suffix: "3", rateKey: "5" },
  { suffix: "4", rateKey: "0" },
  { suffix: "5", rateKey: "ZW" },
  { suffix: "6", rateKey: "NP" },
  { suffix: "7", rateKey: "OO" },
  { suffix: "8", rateKey: "WDT" },
  { suffix: "9", rateKey: "EXP" },
  { suffix: "10", rateKey: "IM" },
  { suffix: "11", rateKey: "WNT" },
];

// ─── Parser ───────────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) =>
    ["FaWiersz", "RachunekBankowy", "DodatkowyOpis", "TerminPlatnosci"].some((n) =>
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
      ilosc: findFieldNumber(row, "P_8B"),
      miara: findFieldString(row, "P_8A"),
      rabat: findFieldNumber(row, "P_10"),
      stawkaPodatku: findFieldString(row, "P_12"),
      wartoscNetto: findFieldNumber(row, "P_11"),
    } satisfies InvoiceLineItem;
  }).filter((x): x is InvoiceLineItem => x !== null);
}

function parseTaxSummary(fa: Record<string, unknown>): TaxSummaryRow[] {
  const rows: TaxSummaryRow[] = [];
  let lp = 1;

  for (const { suffix, rateKey } of VAT_RATE_SUFFIXES) {
    const net = findFieldNumber(fa, `P_13_${suffix}`);
    const tax = findFieldNumber(fa, `P_14_${suffix}`);
    if (net == null && tax == null) continue;
    const netVal = net ?? 0;
    const taxVal = tax ?? 0;
    rows.push({
      lp: lp++,
      stawka: VAT_RATE_LABEL[rateKey] ?? rateKey,
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
    lineItems: parseLineItems(fa),
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
  };
}
