import type { FC } from "hono/jsx";
import type { InvoiceFa3 } from "../ksef/parser.js";

// Renders a parsed FA(3) invoice to a fully self-contained HTML document.
// Uses only inline `<style>` so the CSP `default-src 'none'` block does not
// need `script-src` or external stylesheets.

const STYLES = `
  .ksef-invoice {
    font-family: "DejaVu Serif", Georgia, "Times New Roman", serif;
    font-size: 9pt;
    color: #111;
    line-height: 1.35;
  }
  .ksef-invoice h3,
  .ksef-invoice h4 {
    margin: 0 0 4pt;
  }
  table.ksef-naglowek {
    width: 100%;
    border-collapse: collapse;
    border-bottom: 2pt solid #111;
    padding-bottom: 6pt;
    margin-bottom: 10pt;
  }
  table.ksef-naglowek td {
    vertical-align: top;
    padding: 0 0 6pt;
  }
  .ksef-naglowek__brand {
    font-size: 16pt;
    font-weight: bold;
  }
  .ksef-naglowek__brand-e {
    color: #b71c1c;
  }
  .ksef-naglowek__meta {
    text-align: right;
  }
  .ksef-naglowek__label {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
    color: #555;
  }
  .ksef-naglowek__number {
    font-size: 13pt;
    font-weight: bold;
  }
  .ksef-naglowek__rodzaj {
    font-size: 10pt;
    font-style: italic;
  }
  .ksef-naglowek__ksef,
  .ksef-naglowek__wytw {
    font-size: 8pt;
    color: #555;
  }

  .ksef-section {
    margin: 8pt 0;
    page-break-inside: avoid;
  }
  .ksef-section__title {
    font-size: 10pt;
    background: #e8e8e8;
    padding: 3pt 6pt;
    border-left: 3pt solid #555;
    margin-bottom: 4pt;
  }
  .ksef-section--stopka {
    margin-top: 14pt;
    font-size: 8pt;
    color: #444;
    border-top: 1pt solid #bbb;
    padding-top: 4pt;
  }

  table.ksef-podmioty {
    width: 100%;
    border-collapse: separate;
    border-spacing: 6pt 0;
    margin: 8pt 0;
    table-layout: fixed;
  }
  table.ksef-podmioty td.ksef-podmioty__col {
    border: 1pt solid #bbb;
    padding: 6pt 8pt;
    vertical-align: top;
  }
  table.ksef-podmioty .ksef-section__title {
    margin: -6pt -8pt 4pt;
  }
  .ksef-podmiot {
    font-size: 8.5pt;
    line-height: 1.25;
  }
  .ksef-podmiot__row {
    margin: 0;
  }
  .ksef-podmiot__row--name {
    font-weight: bold;
    margin-top: 2pt;
  }
  .ksef-podmiot__label {
    font-weight: bold;
    color: #444;
  }

  .ksef-dl {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .ksef-dl dt {
    float: left;
    clear: left;
    width: 42%;
    font-weight: bold;
    color: #444;
    padding: 1pt 4pt 1pt 0;
  }
  .ksef-dl dd {
    margin: 0 0 1pt 42%;
    padding: 1pt 0;
  }
  .ksef-dl--two-col dt {
    width: 48%;
  }
  .ksef-dl--two-col dd {
    margin-left: 48%;
  }

  .ksef-table {
    width: 100%;
    border-collapse: collapse;
    margin: 4pt 0;
  }
  .ksef-table th,
  .ksef-table td {
    border: 0.75pt solid #888;
    padding: 3pt 5pt;
    text-align: left;
    vertical-align: top;
  }
  .ksef-table th {
    background: #e8e8e8;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.3pt;
  }
  .ksef-table .num {
    text-align: right;
    white-space: nowrap;
  }
  .ksef-table--wiersze td {
    font-size: 8.5pt;
  }

  .ksef-total {
    text-align: right;
    font-size: 11pt;
    margin: 6pt 0 0;
  }
  .ksef-total strong {
    font-size: 13pt;
  }

  .ksef-note {
    font-style: italic;
    font-size: 8pt;
    margin: 0 0 4pt;
  }

  .ksef-list {
    margin: 2pt 0 2pt 16pt;
    padding: 0;
  }
  .ksef-list li {
    margin: 1pt 0;
  }

  .ksef-rachunek {
    border: 0.75pt solid #bbb;
    padding: 4pt 6pt;
    margin-top: 4pt;
  }

  .ksef-show__toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10pt;
  }
  .ksef-show__meta span {
    margin-right: 12pt;
  }
`;

function fmtMoney(n: number | null, currency: string | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2)} ${currency ?? ""}`.trim();
}

function fmtQty(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toString();
}

const Address: FC<{ addr: InvoiceFa3["seller"]["adres"] }> = ({ addr }) => {
  if (!addr) return null;
  return (
    <>
      {addr.adresL1 ? <div>{addr.adresL1}</div> : null}
      {addr.adresL2 ? <div>{addr.adresL2}</div> : null}
      {addr.kodKraju ? <div class="muted">{addr.kodKraju}</div> : null}
    </>
  );
};

const Party: FC<{ title: string; party: InvoiceFa3["seller"] | null }> = ({ title, party }) => {
  if (!party) return null;
  return (
    <div class="card">
      <h2>{title}</h2>
      {party.nazwa ? <div><strong>{party.nazwa}</strong></div> : null}
      {party.nip ? <div>NIP: {party.nip}</div> : null}
      <Address addr={party.adres} />
      {party.daneKontaktowe[0]?.email ? (
        <div class="muted">{party.daneKontaktowe[0].email}</div>
      ) : null}
      {party.daneKontaktowe[0]?.telefon ? (
        <div class="muted">{party.daneKontaktowe[0].telefon}</div>
      ) : null}
    </div>
  );
};

export function renderInvoiceHtml(invoice: InvoiceFa3): string {
  const element = <InvoiceHtml invoice={invoice} />;
  // hono/jsx elements stringify directly; `toString()` produces the
  // concatenated HTML output without any client-side runtime.
  return `<!doctype html>${String(element)}`;
}

const InvoiceHtml: FC<{ invoice: InvoiceFa3 }> = ({ invoice }) => {
  return (
    <html lang="pl">
      <head>
        <meta charset="utf-8" />
        <title>{`Faktura ${invoice.invoiceNumber ?? invoice.ksefNumber}`}</title>
        <style>{STYLES}</style>
      </head>
      <body>
        <h1>{invoice.invoiceTypeLabel}</h1>
        <div class="muted">Numer: <strong>{invoice.invoiceNumber ?? "—"}</strong></div>
        <div class="muted">KSeF: {invoice.ksefNumber}</div>
        <div class="muted">Data wystawienia: {invoice.issueDate ?? "—"}</div>
        {invoice.placeOfIssue ? (
          <div class="muted">Miejsce wystawienia: {invoice.placeOfIssue}</div>
        ) : null}

        <div class="grid" style="margin-top: 1rem;">
          <Party title="Sprzedawca" party={invoice.seller} />
          <Party title="Nabywca" party={invoice.buyer} />
        </div>
        {invoice.odbiorcy.length > 0 ? (
          <div class="grid">
            <Party title="Odbiorca" party={invoice.odbiorcy[0]} />
          </div>
        ) : null}

        <h2>Pozycje</h2>
        <table>
          <thead>
            <tr>
              <th>Lp.</th>
              <th>Nazwa</th>
              <th class="num">Ilość</th>
              <th>Miara</th>
              <th class="num">Cena netto</th>
              <th>Stawka</th>
              <th class="num">Wartość netto</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((item) => (
              <tr>
                <td>{item.lp}</td>
                <td>{item.nazwa ?? "—"}</td>
                <td class="num">{fmtQty(item.ilosc)}</td>
                <td>{item.miara ?? "—"}</td>
                <td class="num">{fmtMoney(item.cenaJednNetto, invoice.currency)}</td>
                <td>{item.stawkaPodatku ?? "—"}</td>
                <td class="num">{fmtMoney(item.wartoscNetto, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {invoice.taxSummary.length > 0 ? (
          <div class="summary">
            <table>
              <thead>
                <tr>
                  <th>Stawka</th>
                  <th class="num">Netto</th>
                  <th class="num">VAT</th>
                  <th class="num">Brutto</th>
                </tr>
              </thead>
              <tbody>
                {invoice.taxSummary.map((row) => (
                  <tr>
                    <td>{row.label}</td>
                    <td class="num">{fmtMoney(row.kwotaNetto, invoice.currency)}</td>
                    <td class="num">{fmtMoney(row.kwotaPodatku, invoice.currency)}</td>
                    <td class="num">{fmtMoney(row.kwotaBrutto, invoice.currency)}</td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Razem</strong></td>
                  <td></td>
                  <td></td>
                  <td class="num"><strong>{fmtMoney(invoice.totalGross, invoice.currency)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {invoice.payment ? (
          <>
            <h2>Płatność</h2>
            <div class="card">
              {invoice.payment.formaPlatnosci ? (
                <div>Forma: {invoice.payment.formaPlatnosci}</div>
              ) : null}
              {invoice.payment.terminy[0]?.termin ? (
                <div>Termin: {invoice.payment.terminy[0].termin}</div>
              ) : null}
              {invoice.payment.zaplacono ? (
                <div class="muted">Zapłacono: {invoice.payment.zaplacono}</div>
              ) : null}
            </div>
          </>
        ) : null}

        {invoice.daneFaKorygowanej.length > 0 ? (
          <>
            <h2>Dane faktury korygowanej</h2>
            {invoice.correctionReason ? (
              <div class="card">
                <div>Przyczyna: {invoice.correctionReason}</div>
              </div>
            ) : null}
            {invoice.daneFaKorygowanej.map((d, i) => (
              <div class="card" key={String(i)}>
                {d.numer ? <div>Numer: {d.numer}</div> : null}
                {d.dataWystawienia ? <div>Data: {d.dataWystawienia}</div> : null}
                {d.nrKsef ? <div>Nr KSeF: {d.nrKsef}</div> : null}
              </div>
            ))}
          </>
        ) : null}
      </body>
    </html>
  );
};
