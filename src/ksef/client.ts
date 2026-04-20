import type { z } from "zod";
import { logger } from "../lib/logger.js";
import { KSEF_HTTP_CONFIG } from "./config.js";
import { withRetry, withTimeout } from "./http-helpers.js";
import { assertKsefUrl } from "./urls.js";

const log = logger.child({ module: "ksef-client" });

export class KsefApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "KsefApiError";
  }
}

// ── KSeF v2 exception code → friendly Polish message ──────────────────
// Source: KSeF API v2 documentation (api-test.ksef.mf.gov.pl)
const KSEF_EXCEPTION_MESSAGES: Record<number, string> = {
  21001: "Błąd ogólny autoryzacji KSeF.",
  21101: "Token dostępu KSeF wygasł. Następna synchronizacja odnowi sesję automatycznie.",
  21102: "Token dostępu KSeF jest nieprawidłowy. Sprawdź ustawienia tokenu w konfiguracji.",
  21103: "Sesja KSeF została zakończona przez serwer. Następna synchronizacja odnowi sesję.",
  21104: "Brak uprawnień do wykonania tej operacji w KSeF.",
  21200: "Brak autoryzacji do zasobu KSeF.",
  21201: "Niewystarczające uprawnienia w KSeF. Sprawdź czy token/certyfikat ma uprawnienie do odbierania faktur.",
  21400: "Nieprawidłowe żądanie do API KSeF.",
  21401: "Nieprawidłowa metoda HTTP.",
  21402: "Brakuje wymaganego pola w żądaniu.",
  21403: "Nieprawidłowa wartość pola.",
  21404: "Zasób już istnieje.",
  21405: "Błąd walidacji danych wejściowych.",
  21406: "Zasób nie istnieje.",
  21407: "Przekroczono limit zapytań (rate limit). Spróbuj ponownie za kilka minut.",
  21408: "Serwis KSeF chwilowo niedostępny. Spróbuj ponownie później.",
  21409: "Eksport jest już w toku. Poczekaj na jego zakończenie.",
  21410: "Przekroczono limit równoczesnych zapytań. Spróbuj ponownie za chwilę.",
  21300: "Podany NIP nie istnieje lub nie jest zarejestrowany w KSeF.",
  21301: "Nieprawidłowy format NIP. Sprawdź ustawienia NIP w konfiguracji.",
  21500: "Wewnętrzny błąd serwera KSeF. Spróbuj ponownie lub sprawdź status api.ksef.mf.gov.pl.",
  21501: "Błąd bazy danych KSeF. Spróbuj ponownie później.",
};

const KSEF_DETAIL_PATTERNS: Array<[RegExp, string]> = [
  [/dateRange.*must not exceed 3 months/i, "Zakres dat nie może przekraczać 3 miesięcy. Wybierz krótszy przedział."],
  [/dateRange.*from.*must be before.*to/i, "Data 'od' musi być wcześniejsza niż data 'do'."],
  [/invalid.*NIP/i, "Nieprawidłowy NIP. Sprawdź ustawienia w konfiguracji."],
  [/token.*expired/i, "Token KSeF wygasł. Sprawdź ważność tokenu w ustawieniach."],
  [/access.*denied/i, "Brak dostępu. Sprawdź uprawnienia tokenu/certyfikatu KSeF."],
  [/already.*running|export.*progress/i, "Eksport jest już w toku. Poczekaj na zakończenie poprzedniej synchronizacji."],
];

interface KsefExceptionDetail {
  exceptionCode?: number;
  exceptionDescription?: string;
  details?: string[];
}

export function parseKsefErrorMessage(body: string, fallback: string): string {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const exception = json["exception"] as Record<string, unknown> | undefined;
    const detailList = exception?.["exceptionDetailList"] as KsefExceptionDetail[] | undefined;

    if (!Array.isArray(detailList) || detailList.length === 0) return fallback;

    const messages: string[] = [];

    for (const detail of detailList) {
      const code = detail.exceptionCode;
      const rawDetails = detail.details ?? [];

      let patternMatch: string | null = null;
      for (const text of rawDetails) {
        for (const [pattern, msg] of KSEF_DETAIL_PATTERNS) {
          if (pattern.test(text)) {
            patternMatch = msg;
            break;
          }
        }
        if (patternMatch) break;
      }

      if (patternMatch) {
        messages.push(patternMatch);
        continue;
      }

      const codedMsg = code != null ? KSEF_EXCEPTION_MESSAGES[code] : undefined;
      if (codedMsg) {
        const extras = rawDetails.filter((d) => d && d.length < 120);
        messages.push(extras.length > 0 ? `${codedMsg} (${extras.join("; ")})` : codedMsg);
        continue;
      }

      const parts: string[] = [];
      if (detail.exceptionDescription) parts.push(detail.exceptionDescription);
      for (const d of rawDetails) if (d) parts.push(d);
      if (parts.length > 0) messages.push(parts.join(" "));
    }

    return messages.length > 0 ? messages.join(" | ") : fallback;
  } catch {
    return fallback;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class RateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("rate limited");
    this.name = "RateLimitedError";
  }
}

export async function ksefFetch<T>(
  apiUrl: string,
  path: string,
  options: RequestInit & { accessToken?: string },
  schema: z.ZodSchema<T>,
): Promise<T> {
  const { accessToken, ...fetchOptions } = options;
  const targetUrl = assertKsefUrl(`${apiUrl}/v2${path}`);

  const headers = new Headers(fetchOptions.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  // Preserve 429 Retry-After semantics — sleep and re-run the loop without
  // counting against the retry budget.
  while (true) {
    try {
      return await withRetry(
        () =>
          withTimeout(async (signal) => {
            const response = await fetch(targetUrl, {
              ...fetchOptions,
              headers,
              signal,
            });

            if (response.status === 429) {
              const retryAfterRaw = parseInt(response.headers.get("Retry-After") ?? "", 10);
              const retryAfter =
                Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 ? retryAfterRaw : 60;
              log.warn({ path, retryAfter }, "rate limited");
              throw new RateLimitedError(retryAfter);
            }

            if (!response.ok) {
              const body = await response.text();
              const detail = parseKsefErrorMessage(body, body.slice(0, 200));
              throw new KsefApiError(
                response.status,
                body,
                `KSeF API błąd ${response.status} (${path}): ${detail}`,
              );
            }

            const json: unknown = await response.json();
            const parsed = schema.safeParse(json);
            if (!parsed.success) {
              throw new Error(
                `KSeF API: nieoczekiwana struktura odpowiedzi dla ${path}: ${parsed.error.message}`,
              );
            }
            return parsed.data;
          }, KSEF_HTTP_CONFIG.requestTimeoutMs),
        {
          maxRetries: KSEF_HTTP_CONFIG.maxRetries,
          isRetryable: (e) => !(e instanceof KsefApiError) && !(e instanceof RateLimitedError),
          onRetry: (err, attempt, delay) => {
            log.warn({ path, attempt: attempt + 1, delay, err }, "connection error, retrying");
          },
        },
      );
    } catch (err) {
      if (err instanceof RateLimitedError) {
        await sleep(err.retryAfterSeconds * 1000);
        continue;
      }
      throw err;
    }
  }
}

/** Fetches a raw binary payload (typically an export ZIP package).
 *  The URL is validated against the KSeF allowlist before the request. */
export async function ksefFetchBinary(
  url: string,
  accessToken?: string,
): Promise<Buffer> {
  const targetUrl = assertKsefUrl(url);
  const headers: Record<string, string> = { Accept: "application/octet-stream" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  return withRetry(
    () =>
      withTimeout(async (signal) => {
        const response = await fetch(targetUrl, { headers, signal });

        if (!response.ok) {
          const body = await response.text();
          const detail = parseKsefErrorMessage(body, `HTTP ${response.status}`);
          throw new KsefApiError(response.status, body, `Błąd pobierania paczki ZIP: ${detail}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }, KSEF_HTTP_CONFIG.requestTimeoutMs),
    {
      maxRetries: KSEF_HTTP_CONFIG.maxRetries,
      isRetryable: (e) => !(e instanceof KsefApiError),
      onRetry: (err, attempt, delay) => {
        log.warn({ url, attempt: attempt + 1, delay, err }, "binary fetch error, retrying");
      },
    },
  );
}

export async function ksefFetchXml<T>(
  apiUrl: string,
  path: string,
  xmlBody: string,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const targetUrl = assertKsefUrl(`${apiUrl}/v2${path}`);

  return withRetry(
    () =>
      withTimeout(async (signal) => {
        const response = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/xml", Accept: "application/json" },
          body: xmlBody,
          signal,
        });

        if (!response.ok) {
          const body = await response.text();
          const detail = parseKsefErrorMessage(body, body.slice(0, 300));
          throw new KsefApiError(
            response.status,
            body,
            `KSeF XAdES błąd ${response.status}: ${detail}`,
          );
        }

        const json: unknown = await response.json();
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          throw new Error(`KSeF XAdES: nieoczekiwana struktura odpowiedzi: ${parsed.error.message}`);
        }
        return parsed.data;
      }, KSEF_HTTP_CONFIG.requestTimeoutMs),
    {
      maxRetries: KSEF_HTTP_CONFIG.maxRetries,
      isRetryable: (e) => !(e instanceof KsefApiError),
      onRetry: (err, attempt, delay) => {
        log.warn({ path, attempt: attempt + 1, delay, err }, "xml fetch error, retrying");
      },
    },
  );
}
