import type { FC } from "hono/jsx";
import type { InvoiceFa3, InvoiceParty, Adnotacje } from "../ksef/parser.js";
import { rodzajFaktury, taxpayerStatus, kraj, rolaPodmiotu3Short, stawkaPodatku, adnotacjeFlags } from "../ksef/dictionaries.js";
import type { AdnotacjeInput } from "../ksef/dictionaries.js";

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

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function fmtMoney(n: number | null, currency: string | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2)} ${currency ?? ""}`.trim();
}

function fmtQty(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toString();
}

function buildAdresLines(addr: { adresL1: string | null; adresL2: string | null; kodKraju: string | null } | null): string[] {
  if (!addr) return [];
  const lines: (string | null)[] = [addr.adresL1, addr.adresL2, kraj(addr.kodKraju)];
  return lines.filter((l): l is string => l !== null && l.trim() !== "");
}

type PodmiotRole = "sprzedawca" | "nabywca" | "odbiorca";

const Podmiot: FC<{ podmiot: InvoiceParty; role: PodmiotRole }> = ({ podmiot, role }) => {
  const nipParts = [podmiot.prefiksPodatnika, podmiot.nip].filter(
    (p): p is string => p !== null && p.trim() !== "",
  );
  const adresLines = buildAdresLines(podmiot.adres);
  const adresKorespLines = buildAdresLines(podmiot.adresKoresp);

  return (
    <div class="ksef-podmiot">
      {nipParts.length > 0 ? (
        <div class="ksef-podmiot__row">
          <span class="ksef-podmiot__label">NIP:</span> {nipParts.join(" ")}
        </div>
      ) : null}
      {podmiot.nrEORI && podmiot.nrEORI.trim() !== "" ? (
        <div class="ksef-podmiot__row">
          <span class="ksef-podmiot__label">EORI:</span> {podmiot.nrEORI}
        </div>
      ) : null}
      {podmiot.nazwa && podmiot.nazwa.trim() !== "" ? (
        <div class="ksef-podmiot__row ksef-podmiot__row--name">{podmiot.nazwa}</div>
      ) : null}
      {adresLines.map((line, i) => (
        <div key={String(i)} class="ksef-podmiot__row">{line}</div>
      ))}
      {adresKorespLines.length > 0 ? (
        <>
          <div class="ksef-podmiot__row ksef-podmiot__label">Adres korespondencyjny:</div>
          {adresKorespLines.map((line, i) => (
            <div key={String(i)} class="ksef-podmiot__row">{line}</div>
          ))}
        </>
      ) : null}
      {podmiot.daneKontaktowe.map((entry, i) => {
        const email = entry.email && entry.email.trim() !== "" ? entry.email : "";
        const telefon = entry.telefon && entry.telefon.trim() !== "" ? entry.telefon : "";
        if (!email && !telefon) return null;
        const text = email && telefon ? `${email} · ${telefon}` : email || telefon;
        return (
          <div key={String(i)} class="ksef-podmiot__row">{text}</div>
        );
      })}
      {role === "nabywca" && podmiot.nrKlienta && podmiot.nrKlienta.trim() !== "" ? (
        <div class="ksef-podmiot__row">
          <span class="ksef-podmiot__label">Nr klienta:</span> {podmiot.nrKlienta}
        </div>
      ) : null}
      {role === "nabywca" && podmiot.idNabywcy && podmiot.idNabywcy.trim() !== "" ? (
        <div class="ksef-podmiot__row">
          <span class="ksef-podmiot__label">ID nabywcy:</span> {podmiot.idNabywcy}
        </div>
      ) : null}
      {role === "nabywca" && podmiot.jst ? (
        <div class="ksef-podmiot__row">
          <span class="ksef-podmiot__label">JST:</span> TAK
        </div>
      ) : null}
      {role === "nabywca" && podmiot.gv ? (
        <div class="ksef-podmiot__row">
          <span class="ksef-podmiot__label">Grupa VAT:</span> TAK
        </div>
      ) : null}
      {role === "sprzedawca" && podmiot.statusInfoPodatnika && podmiot.statusInfoPodatnika.trim() !== "" ? (
        <div class="ksef-podmiot__row">
          <span class="ksef-podmiot__label">Status podatnika:</span>{" "}
          {taxpayerStatus(podmiot.statusInfoPodatnika) ?? podmiot.statusInfoPodatnika}
        </div>
      ) : null}
    </div>
  );
};

interface PodmiotyCol {
  title: string;
  podmiot: InvoiceParty;
  role: PodmiotRole;
}

const Podmioty: FC<{ invoice: InvoiceFa3 }> = ({ invoice }) => {
  const cols: PodmiotyCol[] = [
    { title: "Sprzedawca", podmiot: invoice.seller, role: "sprzedawca" },
    { title: "Nabywca", podmiot: invoice.buyer, role: "nabywca" },
  ];

  invoice.odbiorcy.forEach((odb, idx) => {
    const baseLabel = rolaPodmiotu3Short(odb.rolaPodmiotu3) ?? "Odbiorca";
    const label = invoice.odbiorcy.length > 1 ? `${baseLabel} ${idx + 1}` : baseLabel;
    cols.push({ title: label, podmiot: odb, role: "odbiorca" });
  });

  const colWidth = Math.round((100 / cols.length) * 100) / 100;

  return (
    <table class="ksef-podmioty">
      <tr>
        {cols.map((col) => (
          <td
            key={col.title}
            class="ksef-podmioty__col"
            style={`width: ${colWidth}%;`}
          >
            <h3 class="ksef-section__title">{col.title}</h3>
            <Podmiot podmiot={col.podmiot} role={col.role} />
          </td>
        ))}
      </tr>
    </table>
  );
};

const Naglowek: FC<{ invoice: InvoiceFa3 }> = ({ invoice }) => {
  const rodzajLabel = rodzajFaktury(invoice.invoiceType, invoice.okresFaKorygowanej);
  return (
    <table class="ksef-naglowek">
      <tr>
        <td style="width: 50%; text-align: left;">
          <div class="ksef-naglowek__brand">
            Krajowy System <span class="ksef-naglowek__brand-e">e</span>-Faktur
          </div>
        </td>
        <td style="width: 50%; text-align: right;">
          <div class="ksef-naglowek__label">Numer faktury:</div>
          <div class="ksef-naglowek__number">{invoice.invoiceNumber ?? "—"}</div>
          <div class="ksef-naglowek__rodzaj">{rodzajLabel}</div>
          {invoice.ksefNumber ? (
            <div class="ksef-naglowek__ksef">
              Numer KSeF: <strong>{invoice.ksefNumber}</strong>
            </div>
          ) : null}
          {invoice.header?.dataWytworzeniaFa ? (
            <div class="ksef-naglowek__wytw">
              Wytworzono: {invoice.header.dataWytworzeniaFa}
            </div>
          ) : null}
        </td>
      </tr>
    </table>
  );
};

const DaneFaKorygowanej: FC<{ invoice: InvoiceFa3 }> = ({ invoice }) => {
  if (invoice.daneFaKorygowanej.length === 0) return null;
  return (
    <div class="ksef-section">
      <h3 class="ksef-section__title">Dane faktury korygowanej</h3>
      <table class="ksef-table">
        <thead>
          <tr>
            <th>Numer faktury korygowanej</th>
            <th>Data wystawienia</th>
            <th>Numer KSeF</th>
          </tr>
        </thead>
        <tbody>
          {invoice.daneFaKorygowanej.map((r, i) => (
            <tr key={String(i)}>
              <td>{r.numer ?? "—"}</td>
              <td>{fmtDate(r.dataWystawienia)}</td>
              <td>{r.nrKsef ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Szczegoly: FC<{ invoice: InvoiceFa3 }> = ({ invoice }) => {
  const saleDateLabel = invoice.invoiceType?.endsWith("ZAL")
    ? "Data otrzymania zapłaty"
    : "Data dostawy / wykonania usługi";
  return (
    <div class="ksef-section">
      <h3 class="ksef-section__title">Szczegóły</h3>
      <dl class="ksef-dl ksef-dl--two-col">
        {invoice.issueDate ? (
          <>
            <dt>Data wystawienia</dt>
            <dd>{fmtDate(invoice.issueDate)}</dd>
          </>
        ) : null}
        {invoice.placeOfIssue ? (
          <>
            <dt>Miejsce wystawienia</dt>
            <dd>{invoice.placeOfIssue}</dd>
          </>
        ) : null}
        {invoice.okresFaKorygowanej ? (
          <>
            <dt>Okres, którego dotyczy rabat</dt>
            <dd>{invoice.okresFaKorygowanej}</dd>
          </>
        ) : null}
        {invoice.saleDate ? (
          <>
            <dt>{saleDateLabel}</dt>
            <dd>{fmtDate(invoice.saleDate)}</dd>
          </>
        ) : null}
        {invoice.currency ? (
          <>
            <dt>Kod waluty</dt>
            <dd>{invoice.currency}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
};

const Wiersze: FC<{ invoice: InvoiceFa3 }> = ({ invoice }) => {
  const { lineItems, bruttoMode, currency, totalGross } = invoice;
  if (lineItems.length === 0) return null;
  const priceLabel = bruttoMode ? "Cena brutto" : "Cena netto";
  return (
    <div class="ksef-section">
      <h3 class="ksef-section__title">Pozycje</h3>
      {currency !== "PLN" && currency ? (
        <p class="ksef-note">Faktura wystawiona w walucie {currency}</p>
      ) : null}
      <table class="ksef-table ksef-table--wiersze">
        <thead>
          <tr>
            <th class="num">Lp.</th>
            <th>Nazwa towaru lub usługi</th>
            <th class="num">Ilość</th>
            <th>Miara</th>
            <th class="num">{priceLabel}</th>
            <th class="num">Wartość netto</th>
            <th class="num">Wartość brutto</th>
            <th class="num">Stawka</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((row, i) => {
            const cena = bruttoMode
              ? (row.cenaJednBrutto ?? row.cenaJednNetto)
              : (row.cenaJednNetto ?? row.cenaJednBrutto);
            const stawkaLabel = stawkaPodatku(row.stawkaPodatku) || row.stawkaPodatku || "—";
            return (
              <tr key={String(i)}>
                <td class="num">{row.lp ?? String(i + 1)}</td>
                <td>{row.nazwa ?? "—"}</td>
                <td class="num">{fmtQty(row.ilosc)}</td>
                <td>{row.miara ?? "—"}</td>
                <td class="num">{fmtMoney(cena, currency)}</td>
                <td class="num">{fmtMoney(row.wartoscNetto, currency)}</td>
                <td class="num">{fmtMoney(row.wartoscBrutto, currency)}</td>
                <td class="num">{stawkaLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {totalGross != null ? (
        <p class="ksef-total">
          Kwota należności ogółem: <strong>{fmtMoney(totalGross, currency)}</strong>
        </p>
      ) : null}
    </div>
  );
};

const Adnotacje: FC<{ invoice: InvoiceFa3 }> = ({ invoice }) => {
  const flags = adnotacjeFlags(invoice.adnotacje as AdnotacjeInput | null);
  if (flags.length === 0) return null;
  return (
    <div class="ksef-section">
      <h3 class="ksef-section__title">Adnotacje</h3>
      <ul class="ksef-list">
        {flags.map((flag, i) => (
          <li key={String(i)}>{flag}</li>
        ))}
      </ul>
    </div>
  );
};

const PodsumowanieStawek: FC<{ invoice: InvoiceFa3 }> = ({ invoice }) => {
  const { taxSummary, currency } = invoice;
  if (taxSummary.length === 0) return null;
  return (
    <div class="ksef-section">
      <h3 class="ksef-section__title">Podsumowanie stawek podatku</h3>
      <table class="ksef-table ksef-table--stawki">
        <thead>
          <tr>
            <th class="num">Lp.</th>
            <th>Stawka podatku</th>
            <th class="num">Kwota netto</th>
            <th class="num">Kwota podatku</th>
            <th class="num">Kwota brutto</th>
          </tr>
        </thead>
        <tbody>
          {taxSummary.map((row) => (
            <tr key={String(row.lp)}>
              <td class="num">{row.lp}</td>
              <td>{row.label}</td>
              <td class="num">{fmtMoney(row.kwotaNetto, currency)}</td>
              <td class="num">{fmtMoney(row.kwotaPodatku, currency)}</td>
              <td class="num">{fmtMoney(row.kwotaBrutto, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <Naglowek invoice={invoice} />

        <DaneFaKorygowanej invoice={invoice} />

        <Podmioty invoice={invoice} />

        <Szczegoly invoice={invoice} />

        <Wiersze invoice={invoice} />

        <PodsumowanieStawek invoice={invoice} />

        <Adnotacje invoice={invoice} />

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

        {invoice.correctionReason ? (
          <div class="card">
            <div>Przyczyna: {invoice.correctionReason}</div>
          </div>
        ) : null}
      </body>
    </html>
  );
};
