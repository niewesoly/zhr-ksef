import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config.js";

// Envelope encryption, two layers, both AES-256-GCM with 12-byte nonce and
// 16-byte auth tag. Every packed blob is `nonce || ciphertext || tag`.
//
//   KEK (from ENCRYPTION_KEY env) ──wraps──> DEK (per tenant, in tenants.dek_enc)
//   DEK ──wraps──> cert/key/passphrase (in tenants.*_enc)
//
// AAD is a domain-separating label + tenant id so a ciphertext cannot be
// swapped into a different tenant row or a different field.

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export type FieldLabel = "dek" | "cert_pem" | "key_pem" | "key_passphrase";

function aad(tenantId: string, label: FieldLabel): Buffer {
  return Buffer.from(`zhr-ksef:${tenantId}:${label}`, "utf8");
}

function seal(
  plaintext: Buffer,
  key: Buffer,
  associatedData: Buffer,
): Buffer {
  if (key.length !== KEY_BYTES) throw new Error("key must be 32 bytes");
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(associatedData);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, ct, tag]);
}

function open(
  packed: Buffer,
  key: Buffer,
  associatedData: Buffer,
): Buffer {
  if (key.length !== KEY_BYTES) throw new Error("key must be 32 bytes");
  if (packed.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error("ciphertext too short");
  }
  const nonce = packed.subarray(0, NONCE_BYTES);
  const tag = packed.subarray(packed.length - TAG_BYTES);
  const ct = packed.subarray(NONCE_BYTES, packed.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(associatedData);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export function generateDek(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function wrapDek(dek: Buffer, tenantId: string): Buffer {
  return seal(dek, config.encryptionKey, aad(tenantId, "dek"));
}

export function unwrapDek(wrapped: Buffer, tenantId: string): Buffer {
  return open(wrapped, config.encryptionKey, aad(tenantId, "dek"));
}

export function encryptField(
  plaintext: string | Buffer,
  dek: Buffer,
  tenantId: string,
  label: Exclude<FieldLabel, "dek">,
): Buffer {
  const buf = Buffer.isBuffer(plaintext)
    ? plaintext
    : Buffer.from(plaintext, "utf8");
  return seal(buf, dek, aad(tenantId, label));
}

export function decryptField(
  wrapped: Buffer,
  dek: Buffer,
  tenantId: string,
  label: Exclude<FieldLabel, "dek">,
): Buffer {
  return open(wrapped, dek, aad(tenantId, label));
}

export function decryptFieldAsString(
  wrapped: Buffer,
  dek: Buffer,
  tenantId: string,
  label: Exclude<FieldLabel, "dek">,
): string {
  return decryptField(wrapped, dek, tenantId, label).toString("utf8");
}
