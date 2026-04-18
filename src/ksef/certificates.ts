import { ksefFetch } from "./client.js";
import { PublicKeyCertificatesResponseSchema } from "./types.js";

const CERT_CACHE_TTL = 24 * 60 * 60 * 1000;

export type CertUsage = "KsefTokenEncryption" | "SymmetricKeyEncryption";

const certCache = new Map<string, { derBase64: string; fetchedAt: number }>();

/** Fetches an MF public key certificate by usage type. Cached 24h per apiUrl.
 *  Cache is per base URL (not per tenant) — MF certs are shared across tenants. */
export async function fetchCertificate(apiUrl: string, usage: CertUsage): Promise<string> {
  const cacheKey = `${apiUrl}:${usage}`;
  const cached = certCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CERT_CACHE_TTL) {
    return cached.derBase64;
  }

  const certs = await ksefFetch(
    apiUrl,
    "/security/public-key-certificates",
    { method: "GET" },
    PublicKeyCertificatesResponseSchema,
  );

  const found = certs.find((c) => c.usage.includes(usage));
  if (!found) {
    throw new Error(`Nie znaleziono certyfikatu KSeF o przeznaczeniu: ${usage}`);
  }

  certCache.set(cacheKey, { derBase64: found.certificate, fetchedAt: Date.now() });
  return found.certificate;
}
