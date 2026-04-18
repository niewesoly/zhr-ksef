import type { FC } from "hono/jsx";
import type { InvoiceFa3 } from "../ksef/parser.js";

// Renders a parsed FA(3) invoice to a fully self-contained HTML document.
// Uses only inline `<style>` so the CSP `default-src 'none'` block does not
// need `script-src` or external stylesheets.

const styles = `
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #1f2937; margin: 2rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1rem; margin: 1.25rem 0 0.5rem; color: #111827; }
  .muted { color: #6b7280; font-size: 0.875rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 0.75rem 1rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid #e5e7eb; font-size: 0.875rem; }
  th { background: #f9fafb; font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .summary { display: flex; justify-content: flex-end; margin-top: 0.5rem; }
  .summary table { width: auto; min-width: 320px; }
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
        <style>{styles}</style>
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
