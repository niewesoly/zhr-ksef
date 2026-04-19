import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { tenants } from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { syncQueue } from "./queues.js";

const log = logger.child({ module: "sync-scheduler" });

const POLL_INTERVAL_MS = 60_000;

interface ScheduledTenant {
  id: string;
  syncCron: string;
}

let activeSchedules = new Map<string, string>();
let timer: ReturnType<typeof setInterval> | undefined;

async function loadEnabledTenants(): Promise<ScheduledTenant[]> {
  const rows = await db
    .select({ id: tenants.id, syncCron: tenants.syncCron })
    .from(tenants)
    .where(and(eq(tenants.syncEnabled, true), isNotNull(tenants.syncCron)));

  return rows.filter((r): r is ScheduledTenant => r.syncCron !== null);
}

async function reconcile(): Promise<void> {
  const desired = await loadEnabledTenants();
  const desiredMap = new Map(desired.map((t) => [t.id, t.syncCron]));

  for (const [tenantId, cron] of activeSchedules) {
    const newCron = desiredMap.get(tenantId);
    if (!newCron || newCron !== cron) {
      await syncQueue.removeJobScheduler(`sync-cron-${tenantId}`);
      activeSchedules.delete(tenantId);
      log.info({ tenantId }, "removed sync schedule");
    }
  }

  for (const { id, syncCron } of desired) {
    if (activeSchedules.get(id) === syncCron) continue;

    await syncQueue.upsertJobScheduler(
      `sync-cron-${id}`,
      { pattern: syncCron },
      {
        name: `sync-cron-${id}`,
        data: { kind: "incremental" as const, tenantId: id },
      },
    );
    activeSchedules.set(id, syncCron);
    log.info({ tenantId: id, cron: syncCron }, "upserted sync schedule");
  }
}

export async function startSyncScheduler(): Promise<void> {
  log.info("starting sync scheduler");
  await reconcile();
  timer = setInterval(() => {
    reconcile().catch((err) => log.error({ err }, "scheduler reconcile failed"));
  }, POLL_INTERVAL_MS);
}

export async function stopSyncScheduler(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
  activeSchedules.clear();
  log.info("sync scheduler stopped");
}
