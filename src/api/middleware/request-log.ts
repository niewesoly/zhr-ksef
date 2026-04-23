import type { Context, MiddlewareHandler } from "hono";
import { logger as rootLogger } from "../../lib/logger.js";
import type { AppEnv } from "../types.js";

// Routes excluded from the access log. Health probes run on a tight cadence
// from load balancers and would drown out real traffic.
const SKIP_PATHS = new Set<string>(["/health", "/"]);

function pickLogger(c: Context<AppEnv>): typeof rootLogger {
  try {
    const l = c.get("logger");
    if (l) return l as typeof rootLogger;
  } catch {
    // c.get throws when the variable was never set.
  }
  return rootLogger;
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
  const log = pickLogger(c);

  const payload = { method, path, status, durationMs, tenantId };
  if (status >= 500) log.error(payload, "request");
  else if (status >= 400) log.warn(payload, "request");
  else log.info(payload, "request");
};
