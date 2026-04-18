import { Queue } from "bullmq";
import { createRedisConnection } from "./connection.js";

const connection = createRedisConnection();

const defaultJobOptions = {
  removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
  removeOnFail: { age: 30 * 24 * 3600 },
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
} as const;

export type SyncJobData =
  | { kind: "incremental"; tenantId: string }
  | { kind: "range"; tenantId: string; dateFrom: string; dateTo: string };

export type CertCheckJobData = { tenantId?: string };

export type PdfJobData = { tenantId: string; invoiceId: string };

export const syncQueue = new Queue<SyncJobData>("sync", {
  connection,
  defaultJobOptions,
});

export const certCheckQueue = new Queue<CertCheckJobData>("cert-check", {
  connection,
  defaultJobOptions,
});

export const pdfQueue = new Queue<PdfJobData>("pdf", {
  connection,
  defaultJobOptions,
});

export const queues = { syncQueue, certCheckQueue, pdfQueue } as const;
