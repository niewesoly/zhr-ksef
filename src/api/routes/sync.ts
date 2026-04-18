import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { syncRuns } from "../../db/schema.js";
import { syncQueue } from "../../jobs/queues.js";
import type { AppEnv } from "../types.js";

const rangeSchema = z
  .object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((v) => v.dateFrom <= v.dateTo, {
    message: "dateFrom must be <= dateTo",
    path: ["dateFrom"],
  });

export const syncRouter = new Hono<AppEnv>();

syncRouter.post("/", async (c) => {
  const tenant = c.get("tenant");
  const job = await syncQueue.add("incremental", {
    kind: "incremental",
    tenantId: tenant.id,
  });
  return c.json({ jobId: job.id, kind: "incremental", tenantId: tenant.id }, 202);
});

syncRouter.post("/range", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json().catch(() => ({}));
  const parsed = rangeSchema.parse(body);
  const job = await syncQueue.add("range", {
    kind: "range",
    tenantId: tenant.id,
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
  });
  return c.json(
    { jobId: job.id, kind: "range", tenantId: tenant.id, ...parsed },
    202,
  );
});

syncRouter.get("/runs", async (c) => {
  const tx = c.get("tx");
  const rows = await tx
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(50);
  return c.json({ items: rows });
});

syncRouter.get("/runs/:rid", async (c) => {
  const tx = c.get("tx");
  const rid = c.req.param("rid");
  const [row] = await tx.select().from(syncRuns).where(eq(syncRuns.id, rid)).limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ run: row });
});
