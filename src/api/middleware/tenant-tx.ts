import { sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { db } from "../../db/index.js";
import type { AppEnv } from "../types.js";

// Every request that accesses tenant-scoped tables runs inside a single
// transaction with `SET LOCAL app.tenant_id = <uuid>`. The RLS policies
// read that setting; a downstream query without a WHERE clause still
// cannot leak cross-tenant rows.
export const tenantTxMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const tenant = c.get("tenant");
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
    c.set("tx", tx);
    await next();
  });
};
