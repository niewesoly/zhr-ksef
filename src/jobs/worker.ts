import { Worker, type Job } from "bullmq";
import { sql as pg } from "../db/index.js";
import { logger } from "../lib/logger.js";
import { createRedisConnection } from "./connection.js";
import type { CertCheckJobData, PdfJobData, SyncJobData } from "./queues.js";
import { handleSyncJob } from "./sync-job.js";
import { startSyncScheduler, stopSyncScheduler } from "./sync-scheduler.js";

const connection = createRedisConnection();

async function handleCertCheck(job: Job<CertCheckJobData>): Promise<void> {
  // Implementation lands alongside tenants routes (phase 6).
  logger.info({ jobId: job.id, data: job.data }, "cert-check job (not yet implemented)");
}

async function handlePdf(job: Job<PdfJobData>): Promise<void> {
  // Implementation lands in phase 8 (visualization).
  logger.info({ jobId: job.id, data: job.data }, "pdf job (not yet implemented)");
}

const workers: Worker[] = [
  new Worker<SyncJobData>("sync", handleSyncJob, { connection, concurrency: 2 }),
  new Worker<CertCheckJobData>("cert-check", handleCertCheck, { connection, concurrency: 1 }),
  new Worker<PdfJobData>("pdf", handlePdf, { connection, concurrency: 4 }),
];

for (const w of workers) {
  w.on("failed", (job, err) =>
    logger.error({ queue: w.name, jobId: job?.id, err }, "job failed"),
  );
  w.on("error", (err) => logger.error({ queue: w.name, err }, "worker error"));
}

logger.info({ queues: workers.map((w) => w.name) }, "worker started");

startSyncScheduler().catch((err) =>
  logger.error({ err }, "failed to start sync scheduler"),
);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "worker shutting down");
  await stopSyncScheduler();
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  await pg.end({ timeout: 5 });
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
