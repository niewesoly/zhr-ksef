import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";
import type { Logger } from "../../lib/logger.js";

// Routes excluded from the access log. Health probes run on a tight cadence
// from load balancers and would drown out real traffic.
const SKIP_PATHS = new Set<string>(["/health", "/"]);

// Lazily resolved so that importing this module in tests (which do not set
// DATABASE_URL / REDIS_URL / ENCRYPTION_KEY) does not trigger config
// validation and process.exit(1). In production the fallback is reached only
// if a request arrives before the correlation middleware has run.
let _rootLogger: Logger | undefined;
async function getRootLogger(): Promise<Logger> {
  if (!_rootLogger) {
    const mod = await import("../../lib/logger.js");
    _rootLogger = mod.logger;
  }
  return _rootLogger;
}

function pickTenantId(c: Context<AppEnv>): string | undefined {
  try {
    return c.get("tenant")?.id;
  } catch {
    return undefined;
  }
}

export const requestLogMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const start = performance.now();
  await next();
  const path = c.req.path;
  if (SKIP_PATHS.has(path)) return;

  const durationMs = Math.round(performance.now() - start);
  const status = c.res.status;
  const method = c.req.method;
  const tenantId = pickTenantId(c);

  // Prefer the per-request child logger set by the correlation middleware;
  // fall back to the root logger if the context logger is missing.
  let log: Logger;
  try {
    const l = c.get("logger");
    log = (l ?? (await getRootLogger())) as Logger;
  } catch {
    // c.get throws when the variable was never set.
    log = await getRootLogger();
  }

  const payload = { method, path, status, durationMs, tenantId };
  if (status >= 500) log.error(payload, "request");
  else if (status >= 400) log.warn(payload, "request");
  else log.info(payload, "request");
};
