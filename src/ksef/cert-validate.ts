import { X509Certificate, createPrivateKey, createPublicKey } from "node:crypto";

export class CertificateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CertificateValidationError";
  }
}

export interface ValidatedCertificate {
  notAfter: Date;
  notBefore: Date;
  subject: string;
  issuer: string;
  /** Days until expiry at the time of validation. Negative means already expired. */
  daysUntilExpiry: number;
}

const MAX_PEM_BYTES = 100 * 1024; // matches plan: body limit 100KB for cert upload endpoints

function assertPemSize(label: string, pem: string): void {
  if (Buffer.byteLength(pem, "utf8") > MAX_PEM_BYTES) {
    throw new CertificateValidationError(
      `${label} przekracza maksymalny rozmiar (${MAX_PEM_BYTES} B).`,
    );
  }
}

/** Validates a PEM cert + private key pair. Throws on:
 *  - malformed PEM
 *  - expired cert
 *  - mismatched key (public key does not match cert)
 *  - wrong passphrase
 *
 *  Returns metadata suitable for DB persistence (not_after) and
 *  surfacing to the caller (near-expiry warning). */
export function validateCertAndKey(
  certPem: string,
  keyPem: string,
  passphrase: string | undefined,
): ValidatedCertificate {
  assertPemSize("cert_pem", certPem);
  assertPemSize("key_pem", keyPem);
  if (passphrase != null) assertPemSize("key_passphrase", passphrase);

  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certPem);
  } catch (err) {
    throw new CertificateValidationError(
      `Nieprawidłowy certyfikat PEM: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let privateKey;
  try {
    privateKey = createPrivateKey({
      key: keyPem,
      format: "pem",
      passphrase: passphrase ? Buffer.from(passphrase, "utf8") : undefined,
    });
  } catch (err) {
    throw new CertificateValidationError(
      `Nieprawidłowy klucz prywatny (zła passphrase?): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // Verify the private key produces the same public key as the cert.
  const certPubPem = createPublicKey(cert.publicKey).export({ type: "spki", format: "pem" }) as string;
  const keyPubPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }) as string;
  if (certPubPem.trim() !== keyPubPem.trim()) {
    throw new CertificateValidationError(
      "Klucz prywatny nie pasuje do certyfikatu (public key mismatch).",
    );
  }

  const notAfter = new Date(cert.validTo);
  const notBefore = new Date(cert.validFrom);
  const now = Date.now();
  if (Number.isNaN(notAfter.getTime())) {
    throw new CertificateValidationError("Certyfikat ma nieprawidłową datę wygaśnięcia.");
  }
  if (notAfter.getTime() < now) {
    throw new CertificateValidationError(`Certyfikat wygasł (validTo: ${cert.validTo}).`);
  }

  const daysUntilExpiry = Math.floor((notAfter.getTime() - now) / (24 * 60 * 60 * 1000));

  return {
    notAfter,
    notBefore,
    subject: cert.subject,
    issuer: cert.issuer,
    daysUntilExpiry,
  };
}
