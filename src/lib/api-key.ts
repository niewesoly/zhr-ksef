import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";

// API key format: `<id>_<secret>`. The id is a lookup handle (O(1) DB
// probe, stored plain); the full token is bcrypt-hashed. bcrypt.compare
// is constant-time so timing never leaks which half mismatched.
//
// base64url encoding gives URL-safe keys without extra escaping for
// headers or copy-paste.

const ID_BYTES = 16; // 22 chars base64url
const SECRET_BYTES = 32; // 43 chars base64url
const BCRYPT_COST = 12;

export interface IssuedApiKey {
  id: string;
  fullKey: string;
  hash: string;
}

export async function issueApiKey(): Promise<IssuedApiKey> {
  const id = randomBytes(ID_BYTES).toString("base64url");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const fullKey = `${id}_${secret}`;
  const hash = await bcrypt.hash(fullKey, BCRYPT_COST);
  return { id, fullKey, hash };
}

export function parseApiKey(
  raw: string | undefined,
): { id: string; fullKey: string } | null {
  if (!raw) return null;
  const idx = raw.indexOf("_");
  if (idx <= 0 || idx === raw.length - 1) return null;
  const id = raw.slice(0, idx);
  if (id.length < 10 || id.length > 40) return null;
  return { id, fullKey: raw };
}

export async function verifyApiKey(
  fullKey: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(fullKey, hash);
}
