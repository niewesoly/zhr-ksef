import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";

// Rejects requests whose `:id` path segment does not match the tenant
// authenticated via X-API-Key. Prevents a caller with tenant A's key
// from reading tenant B's resources by crafting the URL.
export const tenantScopeMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const pathId = c.req.param("id");
  const tenantId = c.get("tenant").id;
  if (pathId && pathId !== tenantId) {
    return c.json({ error: "forbidden", reason: "tenant_mismatch" }, 403);
  }
  await next();
};
