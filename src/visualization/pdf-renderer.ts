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
import { rodzajFaktury } from "../ksef/dictionaries.js";

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

function party(title: string, p: InvoiceFa3["seller"] | null): ReactElement | null {
  if (!p) return null;
  const lines: string[] = [];
  if (p.nazwa) lines.push(p.nazwa);
  if (p.nip) lines.push(`NIP: ${p.nip}`);
  if (p.adres?.adresL1) lines.push(p.adres.adresL1);
  if (p.adres?.adresL2) lines.push(p.adres.adresL2);
  if (p.adres?.kodKraju) lines.push(p.adres.kodKraju);
  return h(
    View,
    { style: styles.partyCol },
    h(Text, { style: styles.sectionTitle }, title),
    ...lines.map((l, i) => h(Text, { key: i, style: styles.cell }, l)),
  );
}

function lineItemRow(item: InvoiceFa3["lineItems"][number], currency: string): ReactElement {
  return h(
    View,
    { key: item.lp, style: styles.tableRow },
    h(Text, { style: [styles.cell, { width: "6%" }] }, String(item.lp)),
    h(Text, { style: [styles.cell, { width: "40%" }] }, item.nazwa ?? "—"),
    h(Text, { style: [styles.cellNum, { width: "10%" }] }, fmtQty(item.ilosc)),
    h(Text, { style: [styles.cell, { width: "10%" }] }, item.miara ?? "—"),
    h(Text, { style: [styles.cellNum, { width: "14%" }] }, fmtMoney(item.cenaJednNetto, currency)),
    h(Text, { style: [styles.cell, { width: "8%" }] }, item.stawkaPodatku ?? "—"),
    h(Text, { style: [styles.cellNum, { width: "12%" }] }, fmtMoney(item.wartoscNetto, currency)),
  );
}

function buildDocument(invoice: InvoiceFa3): ReactElement<DocumentProps> {
  const currency = invoice.currency;

  const header = naglowek(invoice);

  const parties = h(
    View,
    { style: [styles.partiesRow, { marginTop: 8 }] },
    party("Sprzedawca", invoice.seller),
    party("Nabywca", invoice.buyer),
  );

  const itemsHeader = h(
    View,
    { style: styles.tableHeader },
    h(Text, { style: [styles.cell, { width: "6%" }] }, "Lp."),
    h(Text, { style: [styles.cell, { width: "40%" }] }, "Nazwa"),
    h(Text, { style: [styles.cellNum, { width: "10%" }] }, "Ilość"),
    h(Text, { style: [styles.cell, { width: "10%" }] }, "Miara"),
    h(Text, { style: [styles.cellNum, { width: "14%" }] }, "Cena netto"),
    h(Text, { style: [styles.cell, { width: "8%" }] }, "Stawka"),
    h(Text, { style: [styles.cellNum, { width: "12%" }] }, "Wartość netto"),
  );

  const items = h(
    View,
    { style: styles.table },
    itemsHeader,
    ...invoice.lineItems.map((item) => lineItemRow(item, currency)),
  );

  const summary = invoice.taxSummary.length === 0
    ? null
    : h(
        View,
        { style: { marginTop: 6, width: 240, alignSelf: "flex-end" } },
        ...invoice.taxSummary.map((r, i) =>
          h(
            View,
            { key: i, style: styles.tableRow },
            h(Text, { style: [styles.cell, { width: "30%" }] }, r.label),
            h(Text, { style: [styles.cellNum, { width: "25%" }] }, fmtMoney(r.kwotaNetto, currency)),
            h(Text, { style: [styles.cellNum, { width: "20%" }] }, fmtMoney(r.kwotaPodatku, currency)),
            h(Text, { style: [styles.cellNum, { width: "25%" }] }, fmtMoney(r.kwotaBrutto, currency)),
          ),
        ),
        h(
          View,
          { style: [styles.tableRow, { marginTop: 4 }] },
          h(Text, { style: [styles.cell, { width: "75%", fontFamily: "Helvetica-Bold" }] }, "Razem do zapłaty"),
          h(Text, { style: [styles.cellNum, { width: "25%", fontFamily: "Helvetica-Bold" }] }, fmtMoney(invoice.totalGross, currency)),
        ),
      );

  return h(
    Document,
    null,
    h(
      Page,
      { size: "A4", style: styles.page },
      header,
      parties,
      h(Text, { style: styles.sectionTitle }, "Pozycje"),
      items,
      summary,
    ),
  ) as ReactElement<DocumentProps>;
}

export async function renderInvoicePdf(invoice: InvoiceFa3): Promise<Buffer> {
  const element = buildDocument(invoice);
  const result = await renderToBuffer(element);
  return Buffer.isBuffer(result) ? result : Buffer.from(result);
}
