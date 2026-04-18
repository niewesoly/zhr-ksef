// Code → human-readable label dictionaries for FA(3) invoice visualization.
// Verbatim port of ziher's `Ksef::Pdf::Dictionaries`
// (`app/services/ksef/pdf/dictionaries.rb`). Values mirror the official
// CIRFMF/ksef-pdf-generator constants so the TS PDF/HTML output stays in
// lockstep with the Ruby reference implementation.

export const RODZAJ_FAKTURY: Readonly<Record<string, string>> = Object.freeze({
  VAT: "Faktura podstawowa",
  KOR: "Faktura korygująca",
  ZAL: "Faktura dokumentująca otrzymanie zapłaty lub jej części przed dokonaniem czynności oraz faktura wystawiona w związku z art. 106f ust. 4 ustawy",
  ROZ: "Faktura wystawiona w związku z art. 106f ust. 3 ustawy",
  UPR: "Faktura, o której mowa w art. 106e ust. 5 pkt 3 ustawy",
  KOR_ZAL:
    "Faktura korygująca fakturę dokumentującą otrzymanie zapłaty lub jej części przed dokonaniem czynności oraz fakturę wystawioną w związku z art. 106f ust. 4 ustawy",
  KOR_ROZ: "Faktura korygująca fakturę wystawioną w związku z art. 106f ust. 3 ustawy",
  VAT_RR: "Faktura pierwotna",
  KOR_VAT_RR: "Faktura korygująca",
});

export const FORMA_PLATNOSCI: Readonly<Record<string, string>> = Object.freeze({
  "1": "Gotówka",
  "2": "Karta",
  "3": "Bon",
  "4": "Czek",
  "5": "Kredyt",
  "6": "Przelew",
  "7": "Mobilna",
});

export const TAXPAYER_STATUS: Readonly<Record<string, string>> = Object.freeze({
  "1": "Stan likwidacji",
  "2": "Postępowanie restrukturyzacyjne",
  "3": "Stan upadłości",
  "4": "Przedsiębiorstwo w spadku",
});

export const STAWKA_PODATKU: Readonly<Record<string, string>> = Object.freeze({
  "23": "23%",
  "22": "22%",
  "8": "8%",
  "7": "7%",
  "5": "5%",
  "4": "4%",
  "3": "3%",
  "0": "0%",
  "0 KR": "0% - KR",
  "0 WDT": "0% - WDT",
  "0 EX": "0% - EX",
  zw: "zw",
  oo: "oo",
  np: "niepodlegające opodatkowaniu",
  "np I": "np I",
  "np II": "np II",
});

export const TYP_KOREKTY: Readonly<Record<string, string>> = Object.freeze({
  "1": "Korekta skutkująca w dacie ujęcia faktury pierwotnej",
  "2": "Korekta skutkująca w dacie wystawienia faktury korygującej",
  "3": "Korekta skutkująca w dacie innej, w tym gdy dla różnych pozycji faktury korygującej daty te są różne",
});

// FA(3) RolaPodmiotu3 — values per Schemat_FA(3).
// For short column titles in podmioty section use `rolaPodmiotu3Short`.
export const ROLA_PODMIOTU3: Readonly<Record<string, string>> = Object.freeze({
  "1": "Faktor",
  "2": "Odbiorca",
  "3": "Podmiot pierwotny",
  "4": "Dodatkowy nabywca",
  "5": "Wystawca faktury",
  "6": "Dokonujący płatności",
  "7": "Jednostka samorządu terytorialnego (wystawca)",
  "8": "Jednostka samorządu terytorialnego (odbiorca)",
  "9": "Członek grupy VAT (wystawca)",
  "10": "Członek grupy VAT (odbiorca)",
  "11": "Pracownik",
});

export const ROLA_PODMIOTU_UPOWAZNIONEGO: Readonly<Record<string, string>> = Object.freeze({
  "1": "Organ egzekucyjny",
  "2": "Komornik sądowy",
  "3": "Przedstawiciel podatkowy",
});

export const ZAPLACONO: Readonly<Record<string, string>> = Object.freeze({
  "1": "Zapłacono",
  "2": "Brak zapłaty",
});

export const ZNACZNIK_ZAPLATY_CZESCIOWEJ: Readonly<Record<string, string>> = Object.freeze({
  "1": "Zapłacono w części",
  "2": "Zapłacono całość w częściach",
});

export const RODZAJ_TRANSPORTU: Readonly<Record<string, string>> = Object.freeze({
  "1": "Transport morski",
  "2": "Transport kolejowy",
  "3": "Transport drogowy",
  "4": "Transport lotniczy",
  "5": "Przesyłka pocztowa",
  "7": "Stałe instalacje przesyłowe",
  "8": "Żegluga śródlądowa",
});

export const TYP_RACHUNKOW_WLASNYCH: Readonly<Record<string, string>> = Object.freeze({
  "1": "Rachunek służący do rozliczeń z tytułu nabywanych wierzytelności pieniężnych",
  "2": "Rachunek wykorzystywany do pobrania należności od nabywcy i przekazania jej dostawcy",
  "3": "Rachunek prowadzony w ramach gospodarki własnej (niebędący rozliczeniowym)",
});

export const PROCEDURA: Readonly<Record<string, string>> = Object.freeze({
  "1": "Stawka 0% stosowana w ramach sprzedaży krajowej",
  "2": "Stawka 0% — wewnątrzwspólnotowa dostawa towarów",
  "3": "Stawka 0% — eksport towarów",
  "4": "Dostawa towarów oraz świadczenie usług opodatkowane poza terytorium kraju",
  "5": "Świadczenie usług z art. 100 ust. 1 pkt 4 ustawy",
  "6": "Towar/usługa wymienione w załączniku 15",
  "7": "Pozostała sprzedaż krajowa",
});

export const TYP_LADUNKU: Readonly<Record<string, string>> = Object.freeze({
  "1": "Bańka",
  "2": "Beczka",
  "3": "Butla",
  "4": "Karton",
  "5": "Kanister",
  "6": "Klatka",
  "7": "Kontener",
  "8": "Kosz/koszyk",
  "9": "Łubianka",
  "10": "Opakowanie zbiorcze",
  "11": "Paczka",
  "12": "Pakiet",
  "13": "Paleta",
  "14": "Pojemnik",
  "15": "Pojemnik do ładunków masowych stałych",
  "16": "Pojemnik do ładunków masowych w postaci płynnej",
  "17": "Pudełko",
  "18": "Puszka",
  "19": "Skrzynia",
  "20": "Worek",
});

export const KRAJ: Readonly<Record<string, string>> = Object.freeze({
  AF: "Afganistan",
  AX: "Wyspy Alandzkie",
  AL: "Albania",
  DZ: "Algieria",
  AD: "Andora",
  AO: "Angola",
  AI: "Anguilla",
  AQ: "Antarktyda",
  AG: "Antigua i Barbuda",
  AN: "Antyle Holenderskie",
  SA: "Arabia Saudyjska",
  AR: "Argentyna",
  AM: "Armenia",
  AW: "Aruba",
  AU: "Australia",
  AT: "Austria",
  AZ: "Azerbejdżan",
  BS: "Bahamy",
  BH: "Bahrajn",
  BD: "Bangladesz",
  BB: "Barbados",
  BE: "Belgia",
  BZ: "Belize",
  BJ: "Benin",
  BM: "Bermudy",
  BT: "Bhutan",
  BY: "Białoruś",
  BO: "Boliwia",
  BQ: "Bonaire, Sint Eustatius i Saba",
  BA: "Bośnia i Hercegowina",
  BW: "Botswana",
  BR: "Brazylia",
  BN: "Brunei Darussalam",
  IO: "Brytyjskie Terytorium Oceanu Indyjskiego",
  BG: "Bułgaria",
  BF: "Burkina Faso",
  BI: "Burundi",
  XC: "Ceuta",
  CL: "Chile",
  CN: "Chiny",
  HR: "Chorwacja",
  CW: "Curaçao",
  CY: "Cypr",
  TD: "Czad",
  ME: "Czarnogóra",
  DK: "Dania",
  DM: "Dominika",
  DO: "Dominikana",
  DJ: "Dżibuti",
  EG: "Egipt",
  EC: "Ekwador",
  ER: "Erytrea",
  EE: "Estonia",
  ET: "Etiopia",
  FK: "Falklandy",
  FJ: "Fidżi",
  PH: "Filipiny",
  FI: "Finlandia",
  FR: "Francja",
  TF: "Francuskie Terytorium Południowe",
  GA: "Gabon",
  GM: "Gambia",
  GH: "Ghana",
  GI: "Gibraltar",
  GR: "Grecja",
  GD: "Grenada",
  GL: "Grenlandia",
  GE: "Gruzja",
  GU: "Guam",
  GG: "Guernsey",
  GY: "Gujana",
  GF: "Gujana Francuska",
  GP: "Gwadelupa",
  GT: "Gwatemala",
  GN: "Gwinea",
  GQ: "Gwinea Równikowa",
  GW: "Gwinea Bissau",
  HT: "Haiti",
  ES: "Hiszpania",
  HN: "Honduras",
  HK: "Hongkong",
  IN: "Indie",
  ID: "Indonezja",
  IQ: "Irak",
  IR: "Iran",
  IE: "Irlandia",
  IS: "Islandia",
  IL: "Izrael",
  JM: "Jamajka",
  JP: "Japonia",
  YE: "Jemen",
  JE: "Jersey",
  JO: "Jordania",
  KY: "Kajmany",
  KH: "Kambodża",
  CM: "Kamerun",
  CA: "Kanada",
  QA: "Katar",
  KZ: "Kazachstan",
  KE: "Kenia",
  KG: "Kirgistan",
  KI: "Kiribati",
  CO: "Kolumbia",
  KM: "Komory",
  CG: "Kongo",
  CD: "Kongo, Republika Demokratyczna",
  KP: "Koreańska Republika Ludowo-Demokratyczna",
  XK: "Kosowo",
  CR: "Kostaryka",
  CU: "Kuba",
  KW: "Kuwejt",
  LA: "Laos",
  LS: "Lesotho",
  LB: "Liban",
  LR: "Liberia",
  LY: "Libia",
  LI: "Liechtenstein",
  LT: "Litwa",
  LV: "Łotwa",
  LU: "Luksemburg",
  MK: "Macedonia",
  MG: "Madagaskar",
  YT: "Majotta",
  MO: "Makau",
  MW: "Malawi",
  MV: "Malediwy",
  MY: "Malezja",
  ML: "Mali",
  MT: "Malta",
  MP: "Mariany Północne",
  MA: "Maroko",
  MQ: "Martynika",
  MR: "Mauretania",
  MU: "Mauritius",
  MX: "Meksyk",
  XL: "Melilla",
  FM: "Mikronezja",
  UM: "Minor",
  MD: "Mołdawia",
  MC: "Monako",
  MN: "Mongolia",
  MS: "Montserrat",
  MZ: "Mozambik",
  MM: "Mjanma",
  NA: "Namibia",
  NR: "Nauru",
  NP: "Nepal",
  NL: "Niderlandy",
  DE: "Niemcy",
  NE: "Niger",
  NG: "Nigeria",
  NI: "Nikaragua",
  NU: "Niue",
  NF: "Norfolk",
  NO: "Norwegia",
  NC: "Nowa Kaledonia",
  NZ: "Nowa Zelandia",
  PS: "Palestyna",
  OM: "Oman",
  PK: "Pakistan",
  PW: "Palau",
  PA: "Panama",
  PG: "Papua Nowa Gwinea",
  PY: "Paragwaj",
  PE: "Peru",
  PN: "Pitcairn",
  PF: "Polinezja Francuska",
  PL: "Polska",
  GS: "Południowa Georgia i Połud. Wyspy Sandwich",
  PT: "Portugalia",
  PR: "Portoryko",
  CF: "Republika Środkowoafrykańska",
  CZ: "Republika Czeska",
  KR: "Republika Korei",
  ZA: "Republika Południowej Afryki",
  RE: "Reunion",
  RU: "Rosja",
  RO: "Rumunia",
  RW: "Rwanda",
  EH: "Sahara Zachodnia",
  BL: "Saint Barthelemy",
  KN: "Saint Kitts i Nevis",
  LC: "Saint Lucia",
  MF: "Saint Martin",
  VC: "Saint Vincent i Grenadyny",
  SV: "Salwador",
  WS: "Samoa",
  AS: "Samoa Amerykańskie",
  SM: "San Marino",
  SN: "Senegal",
  RS: "Serbia",
  SC: "Seszele",
  SL: "Sierra Leone",
  SG: "Singapur",
  SK: "Słowacja",
  SI: "Słowenia",
  SO: "Somalia",
  LK: "Sri Lanka",
  PM: "Saint Pierre i Miquelon",
  US: "Stany Zjednoczone Ameryki",
  SZ: "Suazi",
  SD: "Sudan",
  SS: "Sudan Południowy",
  SR: "Surinam",
  SJ: "Svalbard i Jan Mayen",
  SH: "Święta Helena",
  SY: "Syria",
  CH: "Szwajcaria",
  SE: "Szwecja",
  TJ: "Tadżykistan",
  TH: "Tajlandia",
  TW: "Tajwan",
  TZ: "Tanzania",
  TG: "Togo",
  TK: "Tokelau",
  TO: "Tonga",
  TT: "Trynidad i Tobago",
  TN: "Tunezja",
  TR: "Turcja",
  TM: "Turkmenistan",
  TV: "Tuvalu",
  UG: "Uganda",
  UA: "Ukraina",
  UY: "Urugwaj",
  UZ: "Uzbekistan",
  VU: "Vanuatu",
  WF: "Wallis i Futuna",
  VA: "Watykan",
  HU: "Węgry",
  VE: "Wenezuela",
  GB: "Wielka Brytania",
  VN: "Wietnam",
  IT: "Włochy",
  TL: "Wschodni Timor",
  CI: "Wybrzeże Kości Słoniowej",
  BV: "Wyspa Bouveta",
  CX: "Wyspa Bożego Narodzenia",
  IM: "Wyspa Man",
  SX: "Sint Maarten (część holenderska)",
  CK: "Wyspy Cooka",
  VI: "Wyspy Dziewicze Stanów Zjednoczonych",
  VG: "Brytyjskie Wyspy Dziewicze",
  HM: "Wyspy Heard i McDonalda",
  CC: "Wyspy Kokosowe (Keelinga)",
  MH: "Wyspy Marshalla",
  FO: "Wyspy Owcze",
  SB: "Wyspy Salomona",
  ST: "Wyspy Świętego Tomasza i Książęca",
  TC: "Wyspy Turks i Caicos",
  ZM: "Zambia",
  CV: "Republika Zielonego Przylądka",
  ZW: "Zimbabwe",
  AE: "Zjednoczone Emiraty Arabskie",
  XI: "Zjednoczone Królestwo (Irlandia Północna)",
});

// ---------- Resolver helpers ----------

// Matches Ruby's `blank?` for string|null inputs: nil OR empty OR
// whitespace-only. Numbers etc. pass through as non-blank.
function isBlank(code: string | null | undefined): boolean {
  if (code === null || code === undefined) return true;
  return code.trim() === "";
}

function asKey(code: string | null | undefined): string {
  return code == null ? "" : String(code);
}

// ---------- Resolvers ----------

export function rodzajFaktury(
  code: string | null,
  okresKorygowanej?: string | null,
): string {
  if (code === "KOR" && !isBlank(okresKorygowanej)) {
    return "Faktura korygująca zbiorcza (rabat)";
  }
  const key = asKey(code);
  return RODZAJ_FAKTURY[key] ?? key;
}

export function formaPlatnosci(code: string | null): string {
  const key = asKey(code);
  return FORMA_PLATNOSCI[key] ?? key;
}

export function taxpayerStatus(code: string | null): string | null {
  const key = asKey(code);
  return TAXPAYER_STATUS[key] ?? null;
}

export function stawkaPodatku(code: string | null): string {
  const key = asKey(code);
  return STAWKA_PODATKU[key] ?? key;
}

export function typKorekty(code: string | null): string | null {
  const key = asKey(code);
  return TYP_KOREKTY[key] ?? null;
}

// Full description — used in detail lists.
export function rolaPodmiotu3(code: string | null): string | null {
  if (isBlank(code)) return null;
  const key = asKey(code);
  return ROLA_PODMIOTU3[key] ?? "Odbiorca";
}

// Short label — used for podmioty column titles. Strips parenthesised suffix.
export function rolaPodmiotu3Short(code: string | null): string | null {
  if (isBlank(code)) return null;
  const key = asKey(code);
  const full = ROLA_PODMIOTU3[key];
  if (full === undefined) return "Odbiorca";
  // Ruby: full.split(/\s*\(/).first — split on optional whitespace + "(",
  // take first segment. For a label w/o "(", returns full; with "(", returns
  // the prefix w/o trailing spaces.
  return full.split(/\s*\(/)[0]!;
}

export function rolaPodmiotuUpowaznionego(code: string | null): string {
  const key = asKey(code);
  return ROLA_PODMIOTU_UPOWAZNIONEGO[key] ?? key;
}

export function zaplacono(code: string | null): string | null {
  const key = asKey(code);
  return ZAPLACONO[key] ?? null;
}

export function znacznikZaplatyCzesciowej(code: string | null): string | null {
  const key = asKey(code);
  return ZNACZNIK_ZAPLATY_CZESCIOWEJ[key] ?? null;
}

export function rodzajTransportu(code: string | null): string {
  const key = asKey(code);
  return RODZAJ_TRANSPORTU[key] ?? key;
}

export function typRachunkowWlasnych(code: string | null): string | null {
  const key = asKey(code);
  return TYP_RACHUNKOW_WLASNYCH[key] ?? null;
}

export function procedura(code: string | null): string | null {
  const key = asKey(code);
  return PROCEDURA[key] ?? null;
}

export function typLadunku(code: string | null): string {
  const key = asKey(code);
  return TYP_LADUNKU[key] ?? key;
}

export function kraj(code: string | null): string | null {
  if (isBlank(code)) return null;
  const key = asKey(code).toUpperCase();
  return KRAJ[key] ?? asKey(code);
}

// ---------- Adnotacje flags ----------

export interface AdnotacjeInput {
  p16: string | null;
  p17: string | null;
  p18: string | null;
  p18a: string | null;
  p23: string | null;
  zwolnienie: { p19?: string | null };
  noweSrodkiTransportu: { p42_5?: string | null };
  pmarzy: {
    pPMarzy?: string | null;
    pPMarzy_2?: string | null;
    pPMarzy_3_1?: string | null;
    pPMarzy_3_2?: string | null;
    pPMarzy_3_3?: string | null;
  };
}

// Adnotacje flags → human labels.
// Returns an array of strings for every flag set to "1". The ordering of
// emitted flags mirrors `dictionaries.rb:292-326` (ziher) — do not reorder.
export function adnotacjeFlags(adn: AdnotacjeInput | null): string[] {
  if (adn === null || adn === undefined) return [];

  const result: string[] = [];
  if (adn.p16 === "1") result.push("Metoda kasowa");
  if (adn.p17 === "1") result.push("Samofakturowanie");
  if (adn.p18 === "1") result.push("Odwrotne obciążenie");
  if (adn.p18a === "1") result.push("Mechanizm podzielonej płatności");
  if (adn.p23 === "1") result.push("Procedura trójstronna uproszczona");

  if (adn.zwolnienie?.p19 === "1") {
    result.push(
      "Dostawa / usługa zwolniona z VAT (art. 43 ust. 1, art. 113 ust. 1 i 9 albo inne przepisy)",
    );
  }

  const nst = adn.noweSrodkiTransportu ?? {};
  switch (nst.p42_5) {
    case "1":
      result.push(
        "Wewnątrzwspólnotowa dostawa nowych środków transportu (obowiązek VAT-22)",
      );
      break;
    case "2":
      result.push(
        "Wewnątrzwspólnotowa dostawa nowych środków transportu (brak obowiązku VAT-22)",
      );
      break;
  }

  const pm = adn.pmarzy ?? {};
  if (pm.pPMarzy === "1") {
    const suffixes: string[] = [];
    if (pm.pPMarzy_3_1 === "1") suffixes.push("towary używane");
    if (pm.pPMarzy_3_2 === "1") suffixes.push("dzieła sztuki");
    if (pm.pPMarzy_3_3 === "1") suffixes.push("przedmioty kolekcjonerskie i antyki");
    let base = "Procedura marży";
    if (suffixes.length > 0) base += ` — ${suffixes.join(", ")}`;
    result.push(base);
  } else if (pm.pPMarzy_2 === "1") {
    result.push("Procedura marży dla biur podróży");
  }

  return result;
}
