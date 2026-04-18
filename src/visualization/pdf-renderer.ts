import { createElement as h, type ReactElement } from "react";
import {
  Document,
  type DocumentProps,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { InvoiceFa3 } from "../ksef/parser.js";
import {
  rodzajFaktury,
  kraj,
  stawkaPodatku,
  adnotacjeFlags,
  zaplacono,
  znacznikZaplatyCzesciowej,
  formaPlatnosci,
  rodzajTransportu,
} from "../ksef/dictionaries.js";
import type { AdnotacjeInput } from "../ksef/dictionaries.js";

// Server-side PDF rendering. Avoiding JSX in this file keeps the TS
// jsx config (`hono/jsx`) from pulling in Hono's JSX factory — React's
// factory (`createElement`) is invoked explicitly.

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 8,
    fontFamily: "Helvetica",
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
    fontFamily: "Helvetica-Bold",
  },
  // Definition list row (two columns: label + value)
  dlRow: { flexDirection: "row", marginBottom: 1 },
  dlLabel: { width: "42%", fontFamily: "Helvetica-Bold", color: "#444", paddingRight: 3 },
  dlValue: { width: "58%" },
  // Two-column DL variant
  dlRowTwo: { flexDirection: "row", marginBottom: 1 },
  dlLabelTwo: { width: "48%", fontFamily: "Helvetica-Bold", color: "#444", paddingRight: 3 },
  dlValueTwo: { width: "52%" },
  // Table shared
  table: { width: "100%", marginTop: 3 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e8e8e8",
    borderBottomWidth: 0.5,
    borderBottomColor: "#888",
    borderStyle: "solid",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#888",
    borderStyle: "solid",
  },
  cell: { padding: 2, fontSize: 8 },
  cellNum: { padding: 2, fontSize: 8, textAlign: "right" },
  // Section wrapper
  section: { marginBottom: 6 },
  // Naglowek
  naglowekRow: { flexDirection: "row", marginBottom: 8, borderBottomWidth: 1, borderBottomColor: "#111", borderStyle: "solid", paddingBottom: 4 },
  naglowekBrand: { fontSize: 14, fontFamily: "Helvetica-Bold", flexGrow: 1 },
  naglowekBrandE: { color: "#b71c1c" },
  naglowekMeta: { textAlign: "right" },
  naglowekLabel: { fontSize: 7, color: "#555", textTransform: "uppercase" },
  naglowekNumber: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  naglowekRodzaj: { fontSize: 9, fontStyle: "italic" },
  naglowekKsef: { fontSize: 7, color: "#555" },
  // Party columns
  partiesRow: { flexDirection: "row", marginBottom: 6 },
  partyCol: { flexGrow: 1, flexBasis: 0, borderWidth: 0.75, borderColor: "#bbb", borderStyle: "solid", padding: 5, marginRight: 4 },
  partyLabel: { fontFamily: "Helvetica-Bold", color: "#444" },
  partyName: { fontFamily: "Helvetica-Bold", marginTop: 1 },
  // List (ksef-list equivalent)
  listItem: { marginBottom: 1, paddingLeft: 8 },
  // Bank account box
  bankBox: { borderWidth: 0.75, borderColor: "#bbb", borderStyle: "solid", padding: 4, marginTop: 3 },
  bankTitle: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  // Footer / Stopka
  stopka: { marginTop: 10, fontSize: 7, color: "#444", borderTopWidth: 0.75, borderTopColor: "#bbb", borderStyle: "solid", paddingTop: 3 },
  // Total line
  totalRow: { flexDirection: "row", marginTop: 3 },
  totalLabel: { fontFamily: "Helvetica-Bold", flexGrow: 1, textAlign: "right", paddingRight: 6 },
  totalValue: { fontFamily: "Helvetica-Bold", width: 80, textAlign: "right" },
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
  return h(Text, { style: styles.sectionTitle }, text);
}

function naglowek(invoice: InvoiceFa3): ReactElement {
  const rodzajLabel = rodzajFaktury(invoice.invoiceType, invoice.okresFaKorygowanej);
  return h(
    View,
    { style: styles.naglowekRow },
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
  return h(
    View,
    { style: styles.section },
    sectionTitle("Faktura koryguje"),
    h(
      View,
      { style: styles.table },
      h(
        View,
        { style: styles.tableHeader },
        h(Text, { style: [styles.cell, { width: "35%" }] }, "Numer"),
        h(Text, { style: [styles.cell, { width: "20%" }] }, "Data wystawienia"),
        h(Text, { style: [styles.cell, { width: "45%" }] }, "Numer KSeF"),
      ),
      ...refs.map((r, i) =>
        h(
          View,
          { key: String(i), style: styles.tableRow },
          h(Text, { style: [styles.cell, { width: "35%" }] }, r.numer ?? "—"),
          h(Text, { style: [styles.cell, { width: "20%" }] }, fmtDate(r.dataWystawienia)),
          h(Text, { style: [styles.cell, { width: "45%" }] }, r.nrKsef ?? "—"),
        ),
      ),
    ),
  );
}

// E5: Podmioty side-by-side
function podmiotCard(title: string, p: InvoiceFa3["seller"] | null): ReactElement | null {
  if (!p) return null;
  const nipParts = [p.prefiksPodatnika, p.nip].filter((x): x is string => x !== null && x.trim() !== "");
  const adresLines: string[] = [];
  if (p.adres?.adresL1) adresLines.push(p.adres.adresL1);
  if (p.adres?.adresL2) adresLines.push(p.adres.adresL2);
  const krajLabel = kraj(p.adres?.kodKraju ?? null);
  if (krajLabel) adresLines.push(krajLabel);
  return h(
    View,
    { style: styles.partyCol },
    sectionTitle(title),
    nipParts.length > 0
      ? h(Text, { style: styles.cell }, `NIP: ${nipParts.join(" ")}`)
      : null,
    p.nazwa ? h(Text, { style: [styles.cell, styles.partyName] }, p.nazwa) : null,
    ...adresLines.map((l, i) => h(Text, { key: String(i), style: styles.cell }, l)),
  );
}

function podmioty(invoice: InvoiceFa3): ReactElement {
  const cols: (ReactElement | null)[] = [
    podmiotCard("Sprzedawca", invoice.seller),
    podmiotCard("Nabywca", invoice.buyer),
    ...invoice.odbiorcy.map((o, i) => podmiotCard(`Odbiorca ${i + 1}`, o)),
  ];
  return h(View, { style: styles.partiesRow }, ...cols);
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
  return h(View, { style: styles.section }, sectionTitle("Szczegóły"), ...rows);
}

// E7: Wiersze (line items table)
function wiersze(invoice: InvoiceFa3): ReactElement {
  const currency = invoice.currency;
  const brutto = invoice.bruttoMode;
  return h(
    View,
    { style: styles.section },
    sectionTitle("Pozycje"),
    h(
      View,
      { style: styles.table },
      h(
        View,
        { style: styles.tableHeader },
        h(Text, { style: [styles.cell, { width: "4%" }] }, "Lp."),
        h(Text, { style: [styles.cell, { width: "36%" }] }, "Nazwa"),
        h(Text, { style: [styles.cellNum, { width: "8%" }] }, "Ilość"),
        h(Text, { style: [styles.cell, { width: "7%" }] }, "Miara"),
        brutto
          ? h(Text, { style: [styles.cellNum, { width: "13%" }] }, "Cena brutto")
          : h(Text, { style: [styles.cellNum, { width: "13%" }] }, "Cena netto"),
        h(Text, { style: [styles.cell, { width: "8%" }] }, "Stawka"),
        brutto
          ? h(Text, { style: [styles.cellNum, { width: "12%" }] }, "Wartość brutto")
          : h(Text, { style: [styles.cellNum, { width: "12%" }] }, "Wartość netto"),
        h(Text, { style: [styles.cellNum, { width: "12%" }] }, "Wartość brutto"),
      ),
      ...invoice.lineItems.map((item, i) =>
        h(
          View,
          { key: String(i), style: styles.tableRow },
          h(Text, { style: [styles.cell, { width: "4%" }] }, String(item.lp)),
          h(Text, { style: [styles.cell, { width: "36%" }] }, item.nazwa ?? "—"),
          h(Text, { style: [styles.cellNum, { width: "8%" }] }, fmtQty(item.ilosc)),
          h(Text, { style: [styles.cell, { width: "7%" }] }, item.miara ?? "—"),
          brutto
            ? h(Text, { style: [styles.cellNum, { width: "13%" }] }, fmtMoney(item.cenaJednBrutto ?? null, currency))
            : h(Text, { style: [styles.cellNum, { width: "13%" }] }, fmtMoney(item.cenaJednNetto, currency)),
          h(Text, { style: [styles.cell, { width: "8%" }] }, stawkaPodatku(item.stawkaPodatku ?? null)),
          brutto
            ? h(Text, { style: [styles.cellNum, { width: "12%" }] }, fmtMoney(item.wartoscBrutto ?? null, currency))
            : h(Text, { style: [styles.cellNum, { width: "12%" }] }, fmtMoney(item.wartoscNetto, currency)),
          h(Text, { style: [styles.cellNum, { width: "12%" }] }, fmtMoney(item.wartoscBrutto ?? null, currency)),
        ),
      ),
    ),
    invoice.totalGross != null
      ? h(
          View,
          { style: styles.totalRow },
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
  return h(
    View,
    { style: styles.section },
    sectionTitle("Podsumowanie stawek VAT"),
    h(
      View,
      { style: styles.table },
      h(
        View,
        { style: styles.tableHeader },
        h(Text, { style: [styles.cell, { width: "28%" }] }, "Stawka"),
        h(Text, { style: [styles.cellNum, { width: "24%" }] }, "Netto"),
        h(Text, { style: [styles.cellNum, { width: "24%" }] }, "VAT"),
        h(Text, { style: [styles.cellNum, { width: "24%" }] }, "Brutto"),
      ),
      ...rows.map((r, i) =>
        h(
          View,
          { key: String(i), style: styles.tableRow },
          h(Text, { style: [styles.cell, { width: "28%" }] }, r.label),
          h(Text, { style: [styles.cellNum, { width: "24%" }] }, fmtMoney(r.kwotaNetto, currency)),
          h(Text, { style: [styles.cellNum, { width: "24%" }] }, fmtMoney(r.kwotaPodatku, currency)),
          h(Text, { style: [styles.cellNum, { width: "24%" }] }, fmtMoney(r.kwotaBrutto, currency)),
        ),
      ),
    ),
  );
}

// E9: Adnotacje flags list
function adnotacje(invoice: InvoiceFa3): ReactElement | null {
  if (!invoice.adnotacje) return null;
  const flags = adnotacjeFlags(invoice.adnotacje as AdnotacjeInput);
  if (flags.length === 0) return null;
  return h(
    View,
    { style: styles.section },
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
  return h(View, { style: styles.section }, sectionTitle("Rozliczenie"), ...rows);
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
      { key: String(i), style: styles.bankBox },
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
    ? h(View, { style: { marginTop: 3 } }, h(Text, { style: styles.bankTitle }, "Skonto"), ...skontoRows)
    : null;

  const partial = pmt.zaplataCzesciowa.length > 0
    ? h(
        View,
        { style: { marginTop: 3 } },
        h(
          View,
          { style: styles.tableHeader },
          h(Text, { style: [styles.cell, { width: "30%" }] }, "Data zapłaty częściowej"),
          h(Text, { style: [styles.cellNum, { width: "35%" }] }, "Kwota"),
          h(Text, { style: [styles.cell, { width: "35%" }] }, "Forma płatności"),
        ),
        ...pmt.zaplataCzesciowa.map((zc, i) =>
          h(
            View,
            { key: String(i), style: styles.tableRow },
            h(Text, { style: [styles.cell, { width: "30%" }] }, fmtDate(zc.data)),
            h(Text, { style: [styles.cellNum, { width: "35%" }] }, fmtMoneyStr(zc.kwota, currency)),
            h(
              Text,
              { style: [styles.cell, { width: "35%" }] },
              zc.platnoscInna ? (zc.opisPlatnosci ?? "—") : formaPlatnosci(zc.formaPlatnosci),
            ),
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
      rows.push(h(Text, { key: String(i), style: styles.listItem }, `• ${parts.join(" — ")}`));
    });
  }

  const umowyItems = wt.umowy.map((u, i) => {
    const parts = [u.numer, u.data ? `(${fmtDate(u.data)})` : null].filter((p): p is string => p !== null);
    return h(Text, { key: String(i), style: styles.listItem }, `• ${parts.join(" ")}`);
  });
  const zamowieniaItems = wt.zamowienia.map((z, i) => {
    const parts = [z.numer, z.data ? `(${fmtDate(z.data)})` : null].filter((p): p is string => p !== null);
    return h(Text, { key: String(i), style: styles.listItem }, `• ${parts.join(" ")}`);
  });
  const partiiItems = wt.nrPartiiTowaru.map((nr, i) =>
    h(Text, { key: String(i), style: styles.listItem }, `• ${nr}`),
  );

  return h(
    View,
    { style: styles.section },
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
    { style: styles.stopka },
    ...s.informacje.map((line, i) => h(Text, { key: String(i) }, line)),
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
