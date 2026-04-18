import { sql } from "drizzle-orm";
import { db, type Tx } from "./index.js";

// Runs `fn` inside a short transaction with `app.tenant_id` set so RLS
// policies on invoices / invoice_events / sync_runs resolve correctly.
// Background jobs (no HTTP context) must use this helper to touch
// tenant-scoped tables.
export async function withTenantTx<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
