import { logger } from "../lib/logger.js";
import { fetchCertificate } from "./certificates.js";
import { ksefFetch, ksefFetchXml } from "./client.js";
import { encryptTokenWithCertificate } from "./crypto.js";
import {
  AuthStatusResponseSchema,
  ChallengeResponseSchema,
  KsefTokenResponseSchema,
  RedeemTokenResponseSchema,
} from "./types.js";
import { buildXadesAuthDocument } from "./xades.js";

const log = logger.child({ module: "ksef-auth" });

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 60_000;
const EARLY_EXPIRY_MS = 5 * 60 * 1000; // Renew 5 min before KSeF's validUntil.

export interface KsefCredentials {
  apiUrl: string;
  nip: string;
  /** Plain-text KSeF token (valid through 2026). Takes precedence over cert+key. */
  token?: string;
  /** In-memory PEM block (already envelope-decrypted from DB). No filesystem reads. */
  certPem?: string;
  privateKeyPem?: string;
  passphrase?: string;
}

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

export async function getAccessToken(
  tenantId: string,
  credentials: KsefCredentials,
): Promise<string> {
  const cached = tokenCache.get(tenantId);
  if (cached && Date.now() < cached.expiresAt) return cached.accessToken;

  const { token, validUntil } = await authenticate(credentials);
  tokenCache.set(tenantId, {
    accessToken: token,
    expiresAt: new Date(validUntil).getTime() - EARLY_EXPIRY_MS,
  });
  return token;
}

export function invalidateToken(tenantId: string): void {
  tokenCache.delete(tenantId);
}

async function authenticate(
  credentials: KsefCredentials,
): Promise<{ token: string; validUntil: string }> {
  if (credentials.token) return authenticateWithToken(credentials);
  if (credentials.certPem && credentials.privateKeyPem) {
    return authenticateWithCertificate(credentials);
  }
  throw new Error("KSeF: brak danych uwierzytelniających (token lub cert+key)");
}

async function authenticateWithToken(
  credentials: KsefCredentials,
): Promise<{ token: string; validUntil: string }> {
  const { apiUrl, nip, token } = credentials;
  if (!token) throw new Error("KSeF: brak tokenu");

  const challenge = await ksefFetch(
    apiUrl,
    "/auth/challenge",
    {
      method: "POST",
      body: JSON.stringify({ contextIdentifier: { type: "Nip", value: nip } }),
    },
    ChallengeResponseSchema,
  );

  const ksefTokenEncCert = await fetchCertificate(apiUrl, "KsefTokenEncryption");
  const encryptedToken = encryptTokenWithCertificate(token, challenge.timestampMs, ksefTokenEncCert);

  const ksefTokenResp = await ksefFetch(
    apiUrl,
    "/auth/ksef-token",
    {
      method: "POST",
      body: JSON.stringify({
        challenge: challenge.challenge,
        encryptedToken,
        contextIdentifier: { type: "Nip", value: nip },
      }),
    },
    KsefTokenResponseSchema,
  );

  return redeemToken(apiUrl, ksefTokenResp.authenticationToken.token);
}

async function authenticateWithCertificate(
  credentials: KsefCredentials,
): Promise<{ token: string; validUntil: string }> {
  const { apiUrl, nip, certPem, privateKeyPem, passphrase } = credentials;
  if (!certPem || !privateKeyPem) throw new Error("KSeF: brak cert/key");

  const challenge = await ksefFetch(
    apiUrl,
    "/auth/challenge",
    {
      method: "POST",
      body: JSON.stringify({ contextIdentifier: { type: "Nip", value: nip } }),
    },
    ChallengeResponseSchema,
  );

  const signedXml = buildXadesAuthDocument({
    challenge: challenge.challenge,
    nip,
    certPem,
    privateKeyPem,
    passphrase,
  });

  const xadesResp = await ksefFetchXml(
    apiUrl,
    "/auth/xades-signature",
    signedXml,
    KsefTokenResponseSchema,
  );

  const authToken = xadesResp.authenticationToken.token;
  await pollAuthStatus(apiUrl, xadesResp.referenceNumber, authToken);
  return redeemToken(apiUrl, authToken);
}

async function pollAuthStatus(
  apiUrl: string,
  referenceNumber: string,
  authToken: string,
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    const status = await ksefFetch(
      apiUrl,
      `/auth/${referenceNumber}`,
      { method: "GET", accessToken: authToken },
      AuthStatusResponseSchema,
    );
    if (status.status.code === 200) return;
    if (status.status.code >= 400) {
      throw new Error(
        `Weryfikacja certyfikatu KSeF: ${status.status.code} - ${
          status.status.description ?? "nieznany błąd"
        }`,
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  log.warn({ referenceNumber }, "auth polling timed out");
  throw new Error(`Timeout weryfikacji certyfikatu KSeF (${POLL_TIMEOUT_MS / 1000}s)`);
}

async function redeemToken(
  apiUrl: string,
  authenticationToken: string,
): Promise<{ token: string; validUntil: string }> {
  const resp = await ksefFetch(
    apiUrl,
    "/auth/token/redeem",
    { method: "POST", accessToken: authenticationToken, body: JSON.stringify({}) },
    RedeemTokenResponseSchema,
  );
  return { token: resp.accessToken.token, validUntil: resp.accessToken.validUntil };
}
