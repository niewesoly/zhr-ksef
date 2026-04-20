import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, firstOrThrow } from "../../db/index.js";
import { tenants } from "../../db/schema.js";
import {
  encryptField,
  generateDek,
  unwrapDek,
  wrapDek,
} from "../../lib/encryption.js";
import { issueApiKey } from "../../lib/api-key.js";
import { invalidateToken } from "../../ksef/auth.js";
import {
  CertificateValidationError,
  validateCertAndKey,
} from "../../ksef/cert-validate.js";
import { adminAuthMiddleware } from "../middleware/admin-auth.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

const NIP = z.string().regex(/^\d{10}$/, "NIP must be 10 digits");
const KSEF_ENV = z.enum(["production", "test", "demo"]);

const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  nip: NIP,
  apiUrl: KSEF_ENV.default("test"),
});

// PEM is delivered base64-encoded so callers can ship raw `.crt` / `.key`
// file bytes without worrying about JSON `\n` escaping. We decode to UTF-8
// before validating — base64 wraps PEM transparently.
const BASE64 = /^[A-Za-z0-9+/=\s]+$/;
const credentialsSchema = z.object({
  certBase64: z.string().min(1).regex(BASE64, "must be base64"),
  keyBase64: z.string().min(1).regex(BASE64, "must be base64"),
  passphrase: z.string().optional(),
});

function decodePem(b64: string, label: string): string {
  const buf = Buffer.from(b64, "base64");
  if (buf.byteLength === 0) {
    throw Object.assign(new Error(`${label} is empty or not valid base64`), {
      status: 400,
    });
  }
  return buf.toString("utf8");
}

const patchTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nip: NIP.optional(),
  apiUrl: KSEF_ENV.optional(),
  syncEnabled: z.boolean().optional(),
  syncCron: z.string().max(100).nullable().optional(),
  credentials: credentialsSchema.optional(),
});

function publicTenantView(t: typeof tenants.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    nip: t.nip,
    apiUrl: t.apiUrl,
    apiKeyId: t.apiKeyId,
    syncEnabled: t.syncEnabled,
    syncCron: t.syncCron,
    lastHwmDate: t.lastHwmDate,
    lastSyncAt: t.lastSyncAt,
    lastSyncStatus: t.lastSyncStatus,
    lastSyncError: t.lastSyncError,
    certNotAfter: t.certNotAfter,
    hasCertificate: Boolean(t.certPemEnc && t.keyPemEnc),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function requireSelf(routeId: string, tenantId: string): void {
  if (routeId !== tenantId) {
    // Constant-like mismatch; do not disclose whether the tenant exists.
    throw Object.assign(new Error("forbidden"), { status: 403 });
  }
}

const adminApp = new Hono<AppEnv>();

adminApp.post("/", adminAuthMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = createTenantSchema.parse(body);

  const id = randomUUID();
  const dek = generateDek();
  const dekEnc = wrapDek(dek, id);
  const { id: apiKeyId, fullKey, hash } = await issueApiKey();

  const rows = await db
    .insert(tenants)
    .values({
      id,
      name: parsed.name,
      nip: parsed.nip,
      apiUrl: parsed.apiUrl,
      dekEnc,
      apiKeyId,
      apiKeyHash: hash,
    })
    .returning();

  return c.json(
    {
      tenant: publicTenantView(firstOrThrow(rows, "tenants insert returned no row")),
      // `apiKey` is returned exactly once — the plaintext is never stored.
      apiKey: fullKey,
    },
    201,
  );
});

adminApp.delete("/:id", adminAuthMiddleware, async (c) => {
  const id = c.req.param("id");
  const deleted = await db.delete(tenants).where(eq(tenants.id, id)).returning({ id: tenants.id });
  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
  invalidateToken(id);
  return c.json({ deleted: true });
});

const tenantApp = new Hono<AppEnv>();

tenantApp.use("*", authMiddleware);

tenantApp.get("/:id", async (c) => {
  const tenant = c.get("tenant");
  requireSelf(c.req.param("id"), tenant.id);
  return c.json({ tenant: publicTenantView(tenant) });
});

tenantApp.patch("/:id", async (c) => {
  const tenant = c.get("tenant");
  requireSelf(c.req.param("id"), tenant.id);

  const body = await c.req.json().catch(() => ({}));
  const parsed = patchTenantSchema.parse(body);

  const patch: Partial<typeof tenants.$inferInsert> = {};
  if (parsed.name !== undefined) patch.name = parsed.name;
  if (parsed.nip !== undefined) patch.nip = parsed.nip;
  if (parsed.apiUrl !== undefined) patch.apiUrl = parsed.apiUrl;
  if (parsed.syncEnabled !== undefined) patch.syncEnabled = parsed.syncEnabled;
  if (parsed.syncCron !== undefined) patch.syncCron = parsed.syncCron;

  let certValidation;
  if (parsed.credentials) {
    const certPem = decodePem(parsed.credentials.certBase64, "certBase64");
    const keyPem = decodePem(parsed.credentials.keyBase64, "keyBase64");

    try {
      certValidation = validateCertAndKey(certPem, keyPem, parsed.credentials.passphrase);
    } catch (err) {
      if (err instanceof CertificateValidationError) {
        return c.json({ error: "invalid_certificate", message: err.message }, 400);
      }
      throw err;
    }

    const rawDek = unwrapDek(tenant.dekEnc, tenant.id);
    patch.certPemEnc = encryptField(certPem, rawDek, tenant.id, "cert_pem");
    patch.keyPemEnc = encryptField(keyPem, rawDek, tenant.id, "key_pem");
    patch.keyPassphraseEnc = parsed.credentials.passphrase
      ? encryptField(parsed.credentials.passphrase, rawDek, tenant.id, "key_passphrase")
      : null;
    patch.certNotAfter = certValidation.notAfter;

    // New cert invalidates any cached access token tied to the old identity.
    invalidateToken(tenant.id);
  }

  patch.updatedAt = new Date();
  const updatedRows = await db
    .update(tenants)
    .set(patch)
    .where(eq(tenants.id, tenant.id))
    .returning();

  return c.json({
    tenant: publicTenantView(firstOrThrow(updatedRows, "tenants update returned no row")),
    certificate: certValidation
      ? {
          notAfter: certValidation.notAfter,
          notBefore: certValidation.notBefore,
          subject: certValidation.subject,
          issuer: certValidation.issuer,
          daysUntilExpiry: certValidation.daysUntilExpiry,
          warnings: certValidation.daysUntilExpiry < 30
            ? [`Certyfikat wygasa za ${certValidation.daysUntilExpiry} dni`]
            : [],
        }
      : undefined,
  });
});

tenantApp.post("/:id/rotate-key", async (c) => {
  const tenant = c.get("tenant");
  requireSelf(c.req.param("id"), tenant.id);

  const { id: newId, fullKey, hash } = await issueApiKey();
  const now = new Date();
  const [updated] = await db
    .update(tenants)
    .set({
      apiKeyIdPrev: tenant.apiKeyId,
      apiKeyHashPrev: tenant.apiKeyHash,
      apiKeyRotatedAt: now,
      apiKeyId: newId,
      apiKeyHash: hash,
      updatedAt: now,
    })
    .where(
      and(
        eq(tenants.id, tenant.id),
        eq(tenants.apiKeyId, tenant.apiKeyId),
      ),
    )
    .returning();

  if (!updated) {
    return c.json({ error: "rotation_conflict" }, 409);
  }

  return c.json({
    tenant: publicTenantView(updated),
    apiKey: fullKey,
    gracePeriodHours: 24,
  });
});

tenantApp.delete("/:id/credentials", async (c) => {
  const tenant = c.get("tenant");
  requireSelf(c.req.param("id"), tenant.id);

  const updatedRows = await db
    .update(tenants)
    .set({
      certPemEnc: null,
      keyPemEnc: null,
      keyPassphraseEnc: null,
      certNotAfter: null,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenant.id))
    .returning();

  invalidateToken(tenant.id);
  return c.json({
    tenant: publicTenantView(firstOrThrow(updatedRows, "tenants credentials clear returned no row")),
    cleared: true,
  });
});

export const tenantsRouter = new Hono<AppEnv>();
tenantsRouter.route("/", adminApp);
tenantsRouter.route("/", tenantApp);
