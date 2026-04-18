import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { config } from "../../config.js";
import type { AppEnv } from "../types.js";

const expected = Buffer.from(config.ADMIN_API_KEY, "utf8");

// Guard for the narrow set of endpoints that cannot use tenant API keys
// (initial provisioning, hard delete). Constant-time compare so timing
// cannot reveal prefix matches on the secret.
export const adminAuthMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const provided = c.req.header("x-admin-key");
  if (!provided) {
    return c.json({ error: "unauthorized", reason: "missing_admin_key" }, 401);
  }
  const providedBuf = Buffer.from(provided, "utf8");
  if (providedBuf.length !== expected.length) {
    return c.json({ error: "unauthorized", reason: "invalid_admin_key" }, 401);
  }
  if (!timingSafeEqual(providedBuf, expected)) {
    return c.json({ error: "unauthorized", reason: "invalid_admin_key" }, 401);
  }
  await next();
};
