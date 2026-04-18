import crypto from "node:crypto";

export interface AesCredentials {
  key: Buffer;
  iv: Buffer;
}

export function generateAesKey(): AesCredentials {
  return {
    key: crypto.randomBytes(32),
    iv: crypto.randomBytes(16),
  };
}

/** Encrypts AES key with RSA-OAEP (SHA-256) using the MF public key. */
export function encryptAesKeyWithRsa(publicKeyPem: string, aesKey: Buffer): Buffer {
  return crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    aesKey,
  );
}

export function decryptAesCbc(encrypted: Buffer, key: Buffer, iv: Buffer): Buffer {
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

export function toBase64(buf: Buffer): string {
  return buf.toString("base64");
}

/** Extracts PEM public key from an X.509 DER certificate (base64) as returned by the KSeF API. */
export function publicKeyPemFromDerCert(derBase64: string): string {
  const pemCert = `-----BEGIN CERTIFICATE-----\n${derBase64}\n-----END CERTIFICATE-----`;
  const x509 = new crypto.X509Certificate(pemCert);
  return x509.publicKey.export({ type: "spki", format: "pem" }) as string;
}

/** Encrypts a KSeF token with RSA-OAEP (SHA-256): Base64(RSA-OAEP(token|timestampMs)). */
export function encryptTokenWithCertificate(
  token: string,
  timestampMs: number,
  derBase64: string,
): string {
  const plaintext = Buffer.from(`${token}|${timestampMs}`, "utf-8");
  const publicKeyPem = publicKeyPemFromDerCert(derBase64);
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    plaintext,
  );
  return toBase64(encrypted);
}
