import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { db } from "../db/index.js";
import { tenants } from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { syncTenant } from "../ksef/sync.js";
import type { SyncJobData } from "./queues.js";

const log = logger.child({ module: "sync-job" });

export async function handleSyncJob(job: Job<SyncJobData>): Promise<void> {
  const data = job.data;
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, data.tenantId)).limit(1);

  if (!tenant) {
    log.warn({ jobId: job.id, tenantId: data.tenantId }, "tenant not found, skipping");
    return;
  }

  if (data.kind === "incremental") {
    await syncTenant(tenant, { mode: "incremental" });
    return;
  }

  await syncTenant(tenant, {
    mode: "range",
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
  });
}
