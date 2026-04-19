import { createElement as h, type ReactElement } from "react";
import {
  Document,
  type DocumentProps,
  Font,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { InvoiceFa3, InvoiceParty } from "../ksef/parser.js";
import {
  rodzajFaktury,
  kraj,
  stawkaPodatku,
  adnotacjeFlags,
  zaplacono,
  znacznikZaplatyCzesciowej,
  formaPlatnosci,
  rodzajTransportu,
  rolaPodmiotu3Short,
  taxpayerStatus,
  gtu,
} from "../ksef/dictionaries.js";
import type { AdnotacjeInput } from "../ksef/dictionaries.js";
import { tableCell, tableRow, tableHeader, tableContainer } from "./pdf-table.js";

const fontsDir = new URL("../assets/fonts/", import.meta.url).pathname;
Font.register({
  family: "LiberationSans",
  fonts: [
    { src: `${fontsDir}LiberationSans-Regular.ttf` },
    { src: `${fontsDir}LiberationSans-Bold.ttf`, fontWeight: "bold" },
    { src: `${fontsDir}LiberationSans-Italic.ttf`, fontStyle: "italic" },
    { src: `${fontsDir}LiberationSans-BoldItalic.ttf`, fontWeight: "bold", fontStyle: "italic" },
  ],
});

// Server-side PDF rendering. Avoiding JSX in this file keeps the TS
// jsx config (`hono/jsx`) from pulling in Hono's JSX factory — React's
// factory (`createElement`) is invoked explicitly.

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 8,
    fontFamily: "LiberationSans",
    color: "#111",
    lineHeight: 1.35,
  },
  // Section heading bar (matches HTML ksef-section__title)
  sectionTitle: {
    fontSize: 9,
    backgroundColor: "#e8e8e8",
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginBottom: 3,
    borderLeftWidth: 2,
    borderLeftColor: "#555",
    borderStyle: "solid",
    fontFamily: "LiberationSans", fontWeight: "bold",
  },
  // Definition list row (two columns: label + value)
  dlRow: { flexDirection: "row", marginBottom: 1 },
  dlLabel: { width: "42%", fontFamily: "LiberationSans", fontWeight: "bold", color: "#444", paddingRight: 3 },
  dlValue: { width: "58%" },
  // Two-column DL variant
  dlRowTwo: { flexDirection: "row", marginBottom: 1 },
  dlLabelTwo: { width: "48%", fontFamily: "LiberationSans", fontWeight: "bold", color: "#444", paddingRight: 3 },
  dlValueTwo: { width: "52%" },
  // Section wrapper
  section: { marginBottom: 6 },
  // Naglowek
  naglowekRow: { flexDirection: "row", marginBottom: 8, borderBottomWidth: 1, borderBottomColor: "#111", borderStyle: "solid", paddingBottom: 4 },
  naglowekBrand: { fontSize: 14, fontFamily: "LiberationSans", fontWeight: "bold", flexGrow: 1 },
  naglowekBrandE: { color: "#b71c1c" },
  naglowekMeta: { textAlign: "right" },
  naglowekLabel: { fontSize: 7, color: "#555", textTransform: "uppercase" },
  naglowekNumber: { fontSize: 11, fontFamily: "LiberationSans", fontWeight: "bold" },
  naglowekRodzaj: { fontSize: 9, fontStyle: "italic" },
  naglowekKsef: { fontSize: 7, color: "#555" },
  // Party columns
  partiesRow: { flexDirection: "row", marginBottom: 6 },
  partyCol: { flexGrow: 1, flexBasis: 0, borderWidth: 0.75, borderColor: "#bbb", borderStyle: "solid", padding: 0, marginRight: 4 },
  partyTitle: {
    fontSize: 9, backgroundColor: "#e8e8e8", paddingHorizontal: 8, paddingVertical: 2,
    borderLeftWidth: 2, borderLeftColor: "#555", borderStyle: "solid",
    fontFamily: "LiberationSans", fontWeight: "bold" as const, marginBottom: 3,
  },
  partyBody: { paddingHorizontal: 6, paddingBottom: 5, fontSize: 8.5, lineHeight: 1.25 },
  partyRow: { marginBottom: 0.5 },
  partyLabel: { fontFamily: "LiberationSans", fontWeight: "bold" as const, color: "#444" },
  partyName: { fontFamily: "LiberationSans", fontWeight: "bold" as const, fontSize: 9, marginTop: 1, marginBottom: 1 },
  partySmall: { fontSize: 7, color: "#555" },
  // List (ksef-list equivalent)
  listItem: { marginBottom: 1, paddingLeft: 8 },
  // Bank account box
  bankBox: { borderWidth: 0.75, borderColor: "#bbb", borderStyle: "solid", padding: 4, marginTop: 3 },
  bankTitle: { fontFamily: "LiberationSans", fontWeight: "bold", marginBottom: 2 },
  // Footer / Stopka
  stopka: { marginTop: 10, fontSize: 7, color: "#444", borderTopWidth: 0.75, borderTopColor: "#bbb", borderStyle: "solid", paddingTop: 3 },
  // Total line
  totalRow: { flexDirection: "row", marginTop: 3 },
  totalLabel: { fontFamily: "LiberationSans", fontWeight: "bold", flexGrow: 1, textAlign: "right", paddingRight: 6 },
  totalValue: { fontFamily: "LiberationSans", fontWeight: "bold", width: 80, textAlign: "right" },
});

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "—";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function fmtMoney(n: number | null, currency: string | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2)} ${currency ?? ""}`.trim();
}

function fmtMoneyStr(s: string | null, currency: string | null | undefined): string {
  if (s == null) return "—";
  const n = parseFloat(s);
  return isNaN(n) ? "—" : fmtMoney(n, currency);
}

function fmtQty(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toString();
}

function dlRow(label: string, value: string, two = false): ReactElement {
  return h(
    View,
    { style: two ? styles.dlRowTwo : styles.dlRow },
    h(Text, { style: two ? styles.dlLabelTwo : styles.dlLabel }, label),
    h(Text, { style: two ? styles.dlValueTwo : styles.dlValue }, value),
  );
}

function sectionTitle(text: string): ReactElement {
  return h(Text, { style: styles.sectionTitle, minPresenceAhead: 0.1 }, text);
}

function naglowek(invoice: InvoiceFa3): ReactElement {
  const rodzajLabel = rodzajFaktury(invoice.invoiceType, invoice.okresFaKorygowanej);
  return h(
    View,
    { style: styles.naglowekRow, wrap: false },
    h(
      View,
      { style: { width: "50%" } },
      h(
        Text,
        { style: styles.naglowekBrand },
        "Krajowy System ",
        h(Text, { style: styles.naglowekBrandE }, "e"),
        "-Faktur",
      ),
    ),
    h(
      View,
      { style: [styles.naglowekMeta, { width: "50%" }] },
      h(Text, { style: styles.naglowekLabel }, "Numer faktury:"),
      h(Text, { style: styles.naglowekNumber }, invoice.invoiceNumber ?? "—"),
      h(Text, { style: styles.naglowekRodzaj }, rodzajLabel),
      invoice.ksefNumber
        ? h(Text, { style: styles.naglowekKsef }, `Numer KSeF: ${invoice.ksefNumber}`)
        : null,
      invoice.header.dataWytworzeniaFa
        ? h(Text, { style: styles.naglowekKsef }, `Wytworzono: ${invoice.header.dataWytworzeniaFa}`)
        : null,
    ),
  );
}

// E4: DaneFaKorygowanej table
function daneFaKorygowanej(invoice: InvoiceFa3): ReactElement | null {
  const refs = invoice.daneFaKorygowanej;
  if (refs.length === 0) return null;

  const headerCells = [
    tableCell("Numer", { width: "35%", isHeader: true }),
    tableCell("Data wystawienia", { width: "20%", isHeader: true }),
    tableCell("Numer KSeF", { width: "45%", isHeader: true }),
  ];

  const dataRows = refs.map((r, i) =>
    tableRow([
      tableCell(r.numer ?? "—", { width: "35%" }),
      tableCell(fmtDate(r.dataWystawienia), { width: "20%" }),
      tableCell(r.nrKsef ?? "—", { width: "45%" }),
    ], { index: i }),
  );

  return h(
    View,
    { style: styles.section, wrap: false },
    sectionTitle("Faktura koryguje"),
    tableContainer(tableHeader(headerCells), dataRows),
  );
}

// E5: Podmioty side-by-side

function buildAdresLines(addr: { adresL1: string | null; adresL2: string | null; kodKraju: string | null } | null): string[] {
  if (!addr) return [];
  const lines: (string | null)[] = [addr.adresL1, addr.adresL2, kraj(addr.kodKraju)];
  return lines.filter((l): l is string => l !== null && l.trim() !== "");
}

type PodmiotRole = "sprzedawca" | "nabywca" | "odbiorca";

function podmiotCard(title: string, p: InvoiceParty, role: PodmiotRole): ReactElement {
  const nipParts = [p.prefiksPodatnika, p.nip].filter((x): x is string => x !== null && x.trim() !== "");
  const adresLines = buildAdresLines(p.adres);
  const adresKorespLines = buildAdresLines(p.adresKoresp);

  const row = (label: string, value: string): ReactElement =>
    h(View, { style: styles.partyRow },
      h(Text, null, h(Text, { style: styles.partyLabel }, label), ` ${value}`));
  const textRow = (text: string): ReactElement =>
    h(Text, { style: styles.partyRow }, text);

  const body: (ReactElement | null)[] = [];
  if (nipParts.length > 0) body.push(row("NIP:", nipParts.join(" ")));
  if (p.nrEORI && p.nrEORI.trim() !== "") body.push(row("EORI:", p.nrEORI));
  if (p.nazwa && p.nazwa.trim() !== "") body.push(h(Text, { style: [styles.partyRow, styles.partyName] }, p.nazwa));
  adresLines.forEach((l) => body.push(textRow(l)));
  if (adresKorespLines.length > 0) {
    body.push(h(Text, { style: [styles.partyRow, styles.partyLabel] }, "Adres korespondencyjny:"));
    adresKorespLines.forEach((l) => body.push(textRow(l)));
  }
  p.daneKontaktowe.forEach((entry) => {
    const email = entry.email && entry.email.trim() !== "" ? entry.email : "";
    const telefon = entry.telefon && entry.telefon.trim() !== "" ? entry.telefon : "";
    if (!email && !telefon) return;
    const text = email && telefon ? `${email} · ${telefon}` : email || telefon;
    body.push(textRow(text));
  });
  if (role === "nabywca" && p.nrKlienta && p.nrKlienta.trim() !== "") body.push(row("Nr klienta:", p.nrKlienta));
  if (role === "nabywca" && p.idNabywcy && p.idNabywcy.trim() !== "") body.push(row("ID nabywcy:", p.idNabywcy));
  if (role === "nabywca" && p.jst) body.push(row("JST:", "TAK"));
  if (role === "nabywca" && p.gv) body.push(row("Grupa VAT:", "TAK"));
  if (role === "sprzedawca" && p.statusInfoPodatnika && p.statusInfoPodatnika.trim() !== "") {
    body.push(row("Status podatnika:", taxpayerStatus(p.statusInfoPodatnika) ?? p.statusInfoPodatnika));
  }

  return h(
    View,
    { style: styles.partyCol },
    h(Text, { style: styles.partyTitle }, title),
    h(View, { style: styles.partyBody }, ...body.filter(Boolean)),
  );
}

function podmioty(invoice: InvoiceFa3): ReactElement {
  const cols: ReactElement[] = [
    podmiotCard("Sprzedawca", invoice.seller, "sprzedawca"),
    podmiotCard("Nabywca", invoice.buyer, "nabywca"),
  ];
  invoice.odbiorcy.forEach((odb, idx) => {
    const baseLabel = rolaPodmiotu3Short(odb.rolaPodmiotu3) ?? "Odbiorca";
    const label = invoice.odbiorcy.length > 1 ? `${baseLabel} ${idx + 1}` : baseLabel;
    cols.push(podmiotCard(label, odb, "odbiorca"));
  });
  return h(View, { style: styles.partiesRow, wrap: false }, ...cols);
}

// E6: Szczegoly DL
function szczegoly(invoice: InvoiceFa3): ReactElement {
  const rows: ReactElement[] = [];
  if (invoice.currency) rows.push(dlRow("Waluta:", invoice.currency, true));
  if (invoice.invoiceType) rows.push(dlRow("Rodzaj faktury:", invoice.invoiceTypeLabel, true));
  if (invoice.issueDate) rows.push(dlRow("Data wystawienia:", fmtDate(invoice.issueDate), true));
  const saleDateLabel = invoice.invoiceType === "ZAL" ? "Data zamówienia/umowy:" : "Data sprzedaży:";
  if (invoice.saleDate) rows.push(dlRow(saleDateLabel, fmtDate(invoice.saleDate), true));
  if (invoice.placeOfIssue) rows.push(dlRow("Miejsce wystawienia:", invoice.placeOfIssue, true));
  if (invoice.invoiceNumber) rows.push(dlRow("Numer faktury:", invoice.invoiceNumber, true));
  return h(View, { style: styles.section, wrap: false }, sectionTitle("Szczegóły"), ...rows);
}

// E7: Wiersze (line items table)
function wiersze(invoice: InvoiceFa3): ReactElement {
  const currency = invoice.currency;
  const brutto = invoice.bruttoMode;
  const hasGtu = invoice.lineItems.some((r) => r.gtu != null);

  const nazwaSz = hasGtu ? "28%" : "36%";

  const headerCells = [
    tableCell("Lp.", { width: "4%", isHeader: true }),
    tableCell("Nazwa", { width: nazwaSz, isHeader: true }),
    tableCell("Ilość", { width: "8%", align: "right", isHeader: true }),
    tableCell("Miara", { width: "7%", isHeader: true }),
    tableCell(brutto ? "Cena brutto" : "Cena netto", { width: "13%", align: "right", isHeader: true }),
    tableCell("Stawka", { width: "8%", isHeader: true }),
    tableCell(brutto ? "Wartość brutto" : "Wartość netto", { width: "12%", align: "right", isHeader: true }),
    ...(!brutto ? [tableCell("Wartość brutto", { width: "12%", align: "right", isHeader: true })] : []),
    ...(hasGtu ? [tableCell("GTU", { width: "8%", isHeader: true })] : []),
  ];

  const dataRows = invoice.lineItems.map((item, i) => {
    const nazwaText = [
      item.nazwa ?? "—",
      item.p12Zal15 ? "[zał. 15]" : null,
      item.stanPrzed ? "[stan przed]" : null,
    ].filter(Boolean).join(" ");

    const cells = [
      tableCell(String(item.lp), { width: "4%" }),
      tableCell(nazwaText, { width: nazwaSz }),
      tableCell(fmtQty(item.ilosc), { width: "8%", align: "right" }),
      tableCell(item.miara ?? "—", { width: "7%" }),
      tableCell(
        brutto ? fmtMoney(item.cenaJednBrutto ?? null, currency) : fmtMoney(item.cenaJednNetto, currency),
        { width: "13%", align: "right" },
      ),
      tableCell(stawkaPodatku(item.stawkaPodatku ?? null), { width: "8%" }),
      tableCell(
        brutto ? fmtMoney(item.wartoscBrutto ?? null, currency) : fmtMoney(item.wartoscNetto, currency),
        { width: "12%", align: "right" },
      ),
      ...(!brutto ? [tableCell(fmtMoney(item.wartoscBrutto ?? null, currency), { width: "12%", align: "right" })] : []),
      ...(hasGtu ? [tableCell(item.gtu ? (gtu(item.gtu) ?? item.gtu) : "—", { width: "8%" })] : []),
    ];

    return tableRow(cells, { index: i });
  });

  return h(
    View,
    { style: styles.section },
    sectionTitle("Pozycje"),
    tableContainer(tableHeader(headerCells), dataRows),
    invoice.totalGross != null
      ? h(
          View,
          { style: styles.totalRow, wrap: false },
          h(Text, { style: styles.totalLabel }, "Łącznie:"),
          h(Text, { style: styles.totalValue }, fmtMoney(invoice.totalGross, currency)),
        )
      : null,
  );
}

// E8: PodsumowanieStawek tax summary
function podsumowanieStawek(invoice: InvoiceFa3): ReactElement | null {
  const rows = invoice.taxSummary;
  if (rows.length === 0) return null;
  const currency = invoice.currency;

  const headerCells = [
    tableCell("Stawka", { width: "28%", isHeader: true }),
    tableCell("Netto", { width: "24%", align: "right", isHeader: true }),
    tableCell("VAT", { width: "24%", align: "right", isHeader: true }),
    tableCell("Brutto", { width: "24%", align: "right", isHeader: true }),
  ];

  const dataRows = rows.map((r, i) =>
    tableRow([
      tableCell(r.label, { width: "28%" }),
      tableCell(fmtMoney(r.kwotaNetto, currency), { width: "24%", align: "right" }),
      tableCell(fmtMoney(r.kwotaPodatku, currency), { width: "24%", align: "right" }),
      tableCell(fmtMoney(r.kwotaBrutto, currency), { width: "24%", align: "right" }),
    ], { index: i }),
  );

  return h(
    View,
    { style: styles.section, wrap: false },
    sectionTitle("Podsumowanie stawek VAT"),
    tableContainer(tableHeader(headerCells), dataRows),
  );
}

// E9: Adnotacje flags list
function adnotacje(invoice: InvoiceFa3): ReactElement | null {
  if (!invoice.adnotacje) return null;
  const flags = adnotacjeFlags(invoice.adnotacje as AdnotacjeInput);
  if (flags.length === 0) return null;
  return h(
    View,
    { style: styles.section, wrap: false },
    sectionTitle("Adnotacje"),
    ...flags.map((f, i) => h(Text, { key: String(i), style: styles.listItem }, `• ${f}`)),
  );
}

// E10: Rozliczenie
function rozliczenie(invoice: InvoiceFa3): ReactElement | null {
  const rozl = invoice.rozliczenie;
  if (!rozl) return null;
  const { sumaObciazen, sumaOdliczen, doZaplaty, doRozliczenia } = rozl;
  if (sumaObciazen == null && sumaOdliczen == null && doZaplaty == null && doRozliczenia == null) return null;
  const currency = invoice.currency;
  const rows: ReactElement[] = [];
  if (sumaObciazen != null) rows.push(dlRow("Suma obciążeń:", fmtMoney(sumaObciazen, currency), true));
  if (sumaOdliczen != null) rows.push(dlRow("Suma odliczeń:", fmtMoney(sumaOdliczen, currency), true));
  if (doZaplaty != null) rows.push(dlRow("Do zapłaty:", fmtMoney(doZaplaty, currency), true));
  if (doRozliczenia != null) rows.push(dlRow("Do rozliczenia:", fmtMoney(doRozliczenia, currency), true));
  return h(View, { style: styles.section, wrap: false }, sectionTitle("Rozliczenie"), ...rows);
}

// E11: Platnosc
function platnosc(invoice: InvoiceFa3): ReactElement | null {
  const pmt = invoice.payment;
  if (!pmt) return null;
  const currency = invoice.currency;
  const infoLabel =
    zaplacono(pmt.zaplacono) ??
    znacznikZaplatyCzesciowej(pmt.znacznikZaplatyCzesciowej) ??
    "—";
  const rows: ReactElement[] = [dlRow("Informacja o płatności:", infoLabel, true)];
  if (pmt.dataZaplaty) rows.push(dlRow("Data zapłaty:", fmtDate(pmt.dataZaplaty), true));
  if (pmt.formaPlatnosci) {
    rows.push(dlRow("Forma płatności:", formaPlatnosci(pmt.formaPlatnosci), true));
  } else if (pmt.opisPlatnosci) {
    rows.push(dlRow("Forma płatności:", `Płatność inna — ${pmt.opisPlatnosci}`, true));
  }
  pmt.terminy.forEach((t, i) => {
    const label = pmt.terminy.length > 1 ? `Termin płatności (${i + 1}):` : "Termin płatności:";
    const val = [fmtDate(t.termin), t.terminOpis].filter(Boolean).join(" — ");
    rows.push(dlRow(label, val, true));
  });
  if (pmt.ipKSeF) rows.push(dlRow("Identyfikator płatności KSeF:", pmt.ipKSeF, true));
  if (pmt.linkDoPlatnosci) rows.push(dlRow("Link do płatności:", pmt.linkDoPlatnosci, true));

  const accounts = [...pmt.rachunkiBankowe, ...pmt.rachunkiBankoweFaktora].map((rb, i) => {
    const isFaktor = i >= pmt.rachunkiBankowe.length;
    const bankRows: (ReactElement | null)[] = [
      rb.nrRB ? dlRow("Numer:", rb.nrRB) : null,
      rb.swift ? dlRow("SWIFT:", rb.swift) : null,
      rb.nazwaBanku ? dlRow("Nazwa banku:", rb.nazwaBanku) : null,
      rb.opisRachunku ? dlRow("Opis:", rb.opisRachunku) : null,
    ].filter((x): x is ReactElement => x !== null);
    return h(
      View,
      { key: String(i), style: styles.bankBox, wrap: false },
      h(Text, { style: styles.bankTitle }, isFaktor ? "Rachunek bankowy faktora" : "Rachunek bankowy"),
      ...bankRows,
    );
  });

  const skontoRows: ReactElement[] = [];
  if (pmt.skonto && (pmt.skonto.warunki != null || pmt.skonto.wysokosc != null)) {
    if (pmt.skonto.warunki) skontoRows.push(dlRow("Warunki:", pmt.skonto.warunki));
    if (pmt.skonto.wysokosc) skontoRows.push(dlRow("Wysokość:", pmt.skonto.wysokosc));
  }
  const skontoSection = skontoRows.length > 0
    ? h(View, { style: { marginTop: 3 }, wrap: false }, h(Text, { style: styles.bankTitle }, "Skonto"), ...skontoRows)
    : null;

  const partial = pmt.zaplataCzesciowa.length > 0
    ? h(
        View,
        { style: { marginTop: 3 } },
        tableContainer(
          tableHeader([
            tableCell("Data zapłaty częściowej", { width: "30%", isHeader: true }),
            tableCell("Kwota", { width: "35%", align: "right", isHeader: true }),
            tableCell("Forma płatności", { width: "35%", isHeader: true }),
          ]),
          pmt.zaplataCzesciowa.map((zc, i) =>
            tableRow([
              tableCell(fmtDate(zc.data), { width: "30%" }),
              tableCell(fmtMoneyStr(zc.kwota, currency), { width: "35%", align: "right" }),
              tableCell(
                zc.platnoscInna ? (zc.opisPlatnosci ?? "—") : formaPlatnosci(zc.formaPlatnosci),
                { width: "35%" },
              ),
            ], { index: i }),
          ),
        ),
      )
    : null;

  return h(
    View,
    { style: styles.section },
    sectionTitle("Płatność"),
    ...rows,
    ...accounts,
    skontoSection,
    partial,
  );
}

// E12: WarunkiTransakcji
function warunkiTransakcji(invoice: InvoiceFa3): ReactElement | null {
  const wt = invoice.warunkiTransakcji;
  if (!wt) return null;
  const rows: ReactElement[] = [];
  if (wt.warunkiDostawy) rows.push(dlRow("Warunki dostawy:", wt.warunkiDostawy, true));
  if (wt.kursUmowny) rows.push(dlRow("Kurs umowny:", wt.kursUmowny, true));
  if (wt.walutaUmowna) rows.push(dlRow("Waluta umowna:", wt.walutaUmowna, true));
  if (wt.podmiotPosredniczacy) rows.push(dlRow("Podmiot pośredniczący:", wt.podmiotPosredniczacy, true));
  if (wt.transport.length > 0) {
    rows.push(h(Text, { style: styles.bankTitle }, "Transport"));
    wt.transport.forEach((t, i) => {
      const parts: string[] = [];
      if (t.rodzajTransportu) parts.push(rodzajTransportu(t.rodzajTransportu));
      if (t.nrZleceniaTransportu) parts.push(`nr zlecenia: ${t.nrZleceniaTransportu}`);
      rows.push(h(Text, { key: `t${i}`, style: styles.listItem }, `• ${parts.join(" — ")}`));
    });
  }

  const umowyItems = wt.umowy.map((u, i) => {
    const parts = [u.numer, u.data ? `(${fmtDate(u.data)})` : null].filter((p): p is string => p !== null);
    return h(Text, { key: `u${i}`, style: styles.listItem }, `• ${parts.join(" ")}`);
  });
  const zamowieniaItems = wt.zamowienia.map((z, i) => {
    const parts = [z.numer, z.data ? `(${fmtDate(z.data)})` : null].filter((p): p is string => p !== null);
    return h(Text, { key: `z${i}`, style: styles.listItem }, `• ${parts.join(" ")}`);
  });
  const partiiItems = wt.nrPartiiTowaru.map((nr, i) =>
    h(Text, { key: `p${i}`, style: styles.listItem }, `• ${nr}`),
  );

  return h(
    View,
    { style: styles.section, wrap: false },
    sectionTitle("Warunki transakcji"),
    ...rows,
    umowyItems.length > 0 ? h(Text, { style: styles.bankTitle }, "Umowy") : null,
    ...umowyItems,
    zamowieniaItems.length > 0 ? h(Text, { style: styles.bankTitle }, "Zamówienia") : null,
    ...zamowieniaItems,
    partiiItems.length > 0 ? h(Text, { style: styles.bankTitle }, "Nr partii towaru") : null,
    ...partiiItems,
  );
}

// E13: Stopka
function stopka(invoice: InvoiceFa3): ReactElement | null {
  const s = invoice.stopka;
  if (!s) return null;
  if (s.informacje.length === 0 && s.rejestry.length === 0) return null;
  return h(
    View,
    { style: styles.stopka, wrap: false },
    ...s.informacje.map((line, i) => h(Text, { key: `i${i}` }, line)),
    ...s.rejestry.map((r, i) => {
      const parts: string[] = [];
      if (r.krs) parts.push(`KRS: ${r.krs}`);
      if (r.regon) parts.push(`REGON: ${r.regon}`);
      if (r.bdo) parts.push(`BDO: ${r.bdo}`);
      return h(Text, { key: `r${i}` }, parts.join(" · "));
    }),
  );
}

function buildDocument(invoice: InvoiceFa3): ReactElement<DocumentProps> {
  return h(
    Document,
    null,
    h(
      Page,
      { size: "A4", style: styles.page },
      naglowek(invoice),
      daneFaKorygowanej(invoice),
      podmioty(invoice),
      szczegoly(invoice),
      wiersze(invoice),
      podsumowanieStawek(invoice),
      adnotacje(invoice),
      rozliczenie(invoice),
      platnosc(invoice),
      warunkiTransakcji(invoice),
      stopka(invoice),
    ),
  ) as ReactElement<DocumentProps>;
}

export async function renderInvoicePdf(invoice: InvoiceFa3): Promise<Buffer> {
  const element = buildDocument(invoice);
  const result = await renderToBuffer(element);
  return Buffer.isBuffer(result) ? result : Buffer.from(result);
}
