// Shared formatting utilities for invoice renderers (HTML and PDF).
// Keep pure — no renderer-specific imports.

/**
 * Format an ISO date string "YYYY-MM-DD" as "DD.MM.YYYY".
 * Returns "—" for null/undefined or any string that does not match the
 * strict YYYY-MM-DD pattern (stricter than the split-based approach).
 */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "—";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * Format a monetary amount with 2 decimal places followed by the currency code.
 * Returns "—" for null/undefined input.
 */
export function fmtMoney(n: number | null | undefined, currency: string | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2)} ${currency ?? ""}`.trim();
}

/**
 * Format a decimal string (e.g. from XML) as a monetary amount with 2 decimal
 * places and a currency code. Returns "—" for null input or a value that
 * parseFloat cannot interpret.
 */
export function fmtMoneyStr(s: string | null, currency: string | null | undefined): string {
  if (s == null) return "—";
  const n = parseFloat(s);
  return isNaN(n) ? "—" : fmtMoney(n, currency);
}

/**
 * Format a quantity value. Integers are rendered without a decimal point.
 * Returns "—" for null/undefined.
 */
export function fmtQty(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toString();
}

/**
 * Returns true only when the URL uses the HTTPS scheme.
 * Rejects http://, javascript:, data:, and empty strings.
 */
export function isSafeUrl(url: string): boolean {
  return url.startsWith("https://");
}

/**
 * Build display lines for a party address.
 *
 * @param adres  - address object (adresL1, adresL2, kodKraju), or null
 * @param krajFn - dictionary lookup: code → country name (or null)
 */
export function buildAdresLines(
  adres: { adresL1: string | null; adresL2: string | null; kodKraju: string | null } | null,
  krajFn: (code: string | null) => string | null,
): string[] {
  if (!adres) return [];
  const lines: (string | null)[] = [adres.adresL1, adres.adresL2, krajFn(adres.kodKraju)];
  return lines.filter((l): l is string => l !== null && l.trim() !== "");
}
