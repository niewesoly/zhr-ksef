import { type KsefCredentials, getAccessToken } from "./auth.js";
import { fetchCertificate } from "./certificates.js";
import { ksefFetch, ksefFetchBinary } from "./client.js";
import {
  type AesCredentials,
  decryptAesCbc,
  encryptAesKeyWithRsa,
  generateAesKey,
  publicKeyPemFromDerCert,
  toBase64,
} from "./crypto.js";
import {
  ExportInitResponseSchema,
  ExportStatusSchema,
  type ExportStatus,
} from "./types.js";

const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

// Hard cap on encrypted ZIP part. Guards against memory exhaustion when a
// hostile or misbehaving MF host returns an unbounded download.
export const MAX_ZIP_PART_BYTES = 100 * 1024 * 1024;

/** Default export start date: 3 months back minus 1 day (KSeF limit = max 3 months). */
function defaultFromDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Initiates an invoice export; returns { referenceNumber, aesCredentials }.
 *  When `toDate` is provided the export is bounded to [fromDate, toDate] and does NOT advance the HWM. */
export async function requestInvoiceExport(
  tenantId: string,
  credentials: KsefCredentials,
  fromDate: string | undefined,
  toDate?: string,
): Promise<{ referenceNumber: string; aesCredentials: AesCredentials }> {
  const accessToken = await getAccessToken(tenantId, credentials);
  const derBase64 = await fetchCertificate(credentials.apiUrl, "SymmetricKeyEncryption");
  const aesCredentials = generateAesKey();

  const publicKeyPem = publicKeyPemFromDerCert(derBase64);
  const encryptedKey = encryptAesKeyWithRsa(publicKeyPem, aesCredentials.key);

  const dateRange: Record<string, unknown> = {
    dateType: "PermanentStorage",
    from: fromDate ?? defaultFromDate(),
    restrictToPermanentStorageHwmDate: !toDate,
  };
  if (toDate) dateRange["to"] = toDate;

  const resp = await ksefFetch(
    credentials.apiUrl,
    "/invoices/exports",
    {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        filters: { subjectType: "Subject2", dateRange },
        encryption: {
          encryptedSymmetricKey: toBase64(encryptedKey),
          initializationVector: toBase64(aesCredentials.iv),
        },
      }),
    },
    ExportInitResponseSchema,
  );

  return { referenceNumber: resp.referenceNumber, aesCredentials };
}

export async function pollExportStatus(
  tenantId: string,
  credentials: KsefCredentials,
  referenceNumber: string,
): Promise<ExportStatus> {
  const accessToken = await getAccessToken(tenantId, credentials);
  const startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    const status = await ksefFetch(
      credentials.apiUrl,
      `/invoices/exports/${referenceNumber}`,
      { method: "GET", accessToken },
      ExportStatusSchema,
    );

    // 200 = completed with data, 210 = completed with no invoices
    if (status.status.code === 200 || status.status.code === 210) {
      return status;
    }

    if (status.status.code >= 400) {
      throw new Error(
        `Eksport KSeF zakończony błędem: ${status.status.code} - ${
          status.status.description ?? "nieznany błąd"
        }`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timeout pollowania statusu eksportu (${POLL_TIMEOUT_MS / 1000}s)`);
}

/** Downloads a ZIP part from a pre-signed URL and AES-CBC-decrypts it.
 *  The URL is validated inside `ksefFetchBinary` against the *.mf.gov.pl allowlist. */
export async function downloadAndDecryptZip(
  partUrl: string,
  aesCredentials: AesCredentials,
): Promise<Buffer> {
  const encryptedBuffer = await ksefFetchBinary(partUrl);
  if (encryptedBuffer.byteLength > MAX_ZIP_PART_BYTES) {
    throw new Error(
      `Paczka ZIP przekracza dopuszczalny rozmiar (${MAX_ZIP_PART_BYTES} B)`,
    );
  }
  return decryptAesCbc(encryptedBuffer, aesCredentials.key, aesCredentials.iv);
}
