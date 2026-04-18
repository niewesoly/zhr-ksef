import { eq, or } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { db } from "../../db/index.js";
import { tenants } from "../../db/schema.js";
import { parseApiKey, verifyApiKey } from "../../lib/api-key.js";
import type { AppEnv } from "../types.js";

const GRACE_MS = 24 * 60 * 60 * 1000;

const unauthorized = (reason: string) => ({ error: "unauthorized", reason });

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const parsed = parseApiKey(c.req.header("x-api-key"));
  if (!parsed) return c.json(unauthorized("missing_or_malformed_api_key"), 401);

  const rows = await db
    .select()
    .from(tenants)
    .where(or(eq(tenants.apiKeyId, parsed.id), eq(tenants.apiKeyIdPrev, parsed.id)))
    .limit(2);

  // Random 128-bit ids make cross-tenant collision astronomically unlikely,
  // but reject defensively if it ever happens.
  if (rows.length !== 1) return c.json(unauthorized("invalid_api_key"), 401);
  const tenant = rows[0]!;

  const isCurrent = tenant.apiKeyId === parsed.id;
  const hash = isCurrent ? tenant.apiKeyHash : tenant.apiKeyHashPrev;
  if (!hash) return c.json(unauthorized("invalid_api_key"), 401);

  const ok = await verifyApiKey(parsed.fullKey, hash);
  if (!ok) return c.json(unauthorized("invalid_api_key"), 401);

  if (!isCurrent) {
    if (!tenant.apiKeyRotatedAt) return c.json(unauthorized("previous_key_expired"), 401);
    if (Date.now() - tenant.apiKeyRotatedAt.getTime() > GRACE_MS) {
      return c.json(unauthorized("previous_key_expired"), 401);
    }
  }

  c.set("tenant", tenant);
  await next();
};
