import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { db, sql as pg } from "./db/index.js";
import { logger } from "./lib/logger.js";
import { authMiddleware } from "./api/middleware/auth.js";
import { correlationMiddleware } from "./api/middleware/correlation.js";
import { errorHandler } from "./api/middleware/error-handler.js";
import { tenantScopeMiddleware } from "./api/middleware/tenant-scope.js";
import { tenantTxMiddleware } from "./api/middleware/tenant-tx.js";
import { buildOpenApiDocument } from "./api/openapi/spec.js";
import { invoicesRouter } from "./api/routes/invoices.js";
import { previewRouter } from "./api/routes/preview.js";
import { syncRouter } from "./api/routes/sync.js";
import { tenantsRouter } from "./api/routes/tenants.js";
import type { AppEnv } from "./api/types.js";

const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.notFound((c) => c.json({ error: "not_found" }, 404));

app.use("*", correlationMiddleware);

if (config.CORS_ORIGINS.length > 0) {
  app.use(
    "*",
    cors({
      origin: config.CORS_ORIGINS,
      allowHeaders: ["Content-Type", "X-API-Key", "X-Correlation-Id"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE"],
      maxAge: 600,
    }),
  );
}

// Built once at startup — the spec is static relative to the code, and the
// generator does non-trivial work (zod → JSON Schema traversal).
const openApiDocument = buildOpenApiDocument();

// OpenAPI 3 JSON spec + interactive Swagger UI. Both are unauthenticated;
// they describe the API surface only. The UI loads the spec over the same
// origin, so no CORS allowance is required.
app.get("/api/v1/openapi.json", (c) => c.json(openApiDocument));
app.get("/api/v1/docs", swaggerUI({ url: "/api/v1/openapi.json" }));

// Unauthenticated liveness probe — does not touch the DB.
app.get("/health", (c) => c.json({ status: "ok" }));

// Visualization preview — accepts raw FA(3) XML, renders without DB/auth.
// Disabled in production; only useful for local dev and CI smoke tests.
if (process.env["NODE_ENV"] !== "production") {
  app.route("/api/v1/preview", previewRouter);
}

// Authenticated readiness probe — verifies DB connectivity.
app.get("/health/detailed", authMiddleware, async (c) => {
  await db.execute(sql`SELECT 1`);
  return c.json({ status: "ok", tenant: c.get("tenant").id });
});

// The tenants router hosts its own auth (admin vs. tenant) because
// provisioning endpoints cannot use a tenant API key they don't have yet.
app.route("/api/v1/tenants", tenantsRouter);

// Tenant-scoped resource routers: `/:id` is validated against the authed
// tenant (tenantScopeMiddleware), then tenantTxMiddleware opens an
// RLS-scoped transaction before handlers touch invoices / sync_runs.
// Middleware is bound to a path containing `:id` so the param is populated
// when tenantScopeMiddleware runs.
const scoped = new Hono<AppEnv>();
scoped.use("/tenants/:id/*", authMiddleware, tenantScopeMiddleware, tenantTxMiddleware);
scoped.route("/tenants/:id/invoices", invoicesRouter);
scoped.route("/tenants/:id/sync", syncRouter);
app.route("/api/v1", scoped);

const server = serve(
  { fetch: app.fetch, port: config.PORT },
  (info) => logger.info({ port: info.port }, "zhr-ksef listening"),
);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "shutting down");
  server.close();
  await pg.end({ timeout: 5 });
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { app };
