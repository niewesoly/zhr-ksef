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

// Server-side PDF rendering. Avoiding JSX in this file keeps the TS
// jsx config (`hono/jsx`) from pulling in Hono's JSX factory — React's
// factory (`createElement`) is invoked explicitly.

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  header: { fontSize: 14, marginBottom: 4, fontWeight: 700 },
  muted: { color: "#6b7280", fontSize: 9, marginBottom: 2 },
  sectionTitle: { marginTop: 12, marginBottom: 4, fontSize: 10, fontWeight: 700 },
  row: { flexDirection: "row" },
  card: {
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    borderWidth: 1,
    borderRadius: 4,
    padding: 6,
    marginRight: 8,
    flexGrow: 1,
    flexBasis: 0,
  },
  table: { width: "100%", marginTop: 4 },
  tHeader: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    borderStyle: "solid",
  },
  tRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    borderStyle: "solid",
  },
  cell: { padding: 3, fontSize: 9 },
  cellNum: { padding: 3, fontSize: 9, textAlign: "right" },
  cellLpWidth: { width: "6%" },
  cellNameWidth: { width: "40%" },
  cellQtyWidth: { width: "10%" },
  cellMeasureWidth: { width: "10%" },
  cellPriceWidth: { width: "14%" },
  cellRateWidth: { width: "8%" },
  cellTotalWidth: { width: "12%" },
  summary: { marginTop: 6, width: 240, alignSelf: "flex-end" },
});

function fmtMoney(n: number | null, currency: string | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2)} ${currency ?? ""}`.trim();
}

function fmtQty(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toString();
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
    { style: styles.card },
    h(Text, { style: styles.sectionTitle }, title),
    ...lines.map((l, i) => h(Text, { key: i, style: styles.cell }, l)),
  );
}

function lineItemRow(item: InvoiceFa3["lineItems"][number], currency: string): ReactElement {
  return h(
    View,
    { key: item.lp, style: styles.tRow },
    h(Text, { style: [styles.cell, styles.cellLpWidth] }, String(item.lp)),
    h(Text, { style: [styles.cell, styles.cellNameWidth] }, item.nazwa ?? "—"),
    h(Text, { style: [styles.cellNum, styles.cellQtyWidth] }, fmtQty(item.ilosc)),
    h(Text, { style: [styles.cell, styles.cellMeasureWidth] }, item.miara ?? "—"),
    h(Text, { style: [styles.cellNum, styles.cellPriceWidth] }, fmtMoney(item.cenaJednNetto, currency)),
    h(Text, { style: [styles.cell, styles.cellRateWidth] }, item.stawkaPodatku ?? "—"),
    h(Text, { style: [styles.cellNum, styles.cellTotalWidth] }, fmtMoney(item.wartoscNetto, currency)),
  );
}

function buildDocument(invoice: InvoiceFa3): ReactElement<DocumentProps> {
  const currency = invoice.currency;

  const header = h(
    View,
    null,
    h(Text, { style: styles.header }, invoice.invoiceTypeLabel),
    h(Text, { style: styles.muted }, `Numer: ${invoice.invoiceNumber ?? "—"}`),
    h(Text, { style: styles.muted }, `KSeF: ${invoice.ksefNumber}`),
    h(Text, { style: styles.muted }, `Data wystawienia: ${invoice.issueDate ?? "—"}`),
  );

  const parties = h(
    View,
    { style: [styles.row, { marginTop: 8 }] },
    party("Sprzedawca", invoice.seller),
    party("Nabywca", invoice.buyer),
  );

  const itemsHeader = h(
    View,
    { style: styles.tHeader },
    h(Text, { style: [styles.cell, styles.cellLpWidth] }, "Lp."),
    h(Text, { style: [styles.cell, styles.cellNameWidth] }, "Nazwa"),
    h(Text, { style: [styles.cellNum, styles.cellQtyWidth] }, "Ilość"),
    h(Text, { style: [styles.cell, styles.cellMeasureWidth] }, "Miara"),
    h(Text, { style: [styles.cellNum, styles.cellPriceWidth] }, "Cena netto"),
    h(Text, { style: [styles.cell, styles.cellRateWidth] }, "Stawka"),
    h(Text, { style: [styles.cellNum, styles.cellTotalWidth] }, "Wartość netto"),
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
        { style: styles.summary },
        ...invoice.taxSummary.map((r, i) =>
          h(
            View,
            { key: i, style: styles.tRow },
            h(Text, { style: [styles.cell, { width: "30%" }] }, r.stawka),
            h(Text, { style: [styles.cellNum, { width: "25%" }] }, fmtMoney(r.kwotaNetto, currency)),
            h(Text, { style: [styles.cellNum, { width: "20%" }] }, fmtMoney(r.kwotaPodatku, currency)),
            h(Text, { style: [styles.cellNum, { width: "25%" }] }, fmtMoney(r.kwotaBrutto, currency)),
          ),
        ),
        h(
          View,
          { style: [styles.tRow, { marginTop: 4 }] },
          h(Text, { style: [styles.cell, { width: "75%", fontWeight: 700 }] }, "Razem do zapłaty"),
          h(Text, { style: [styles.cellNum, { width: "25%", fontWeight: 700 }] }, fmtMoney(invoice.totalGross, currency)),
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
