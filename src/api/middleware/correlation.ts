import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { logger } from "../../lib/logger.js";
import type { AppEnv } from "../types.js";

export const correlationMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const provided = c.req.header("x-correlation-id");
  const correlationId =
    provided && /^[a-zA-Z0-9_-]{1,64}$/.test(provided) ? provided : randomUUID();
  c.set("correlationId", correlationId);
  c.set("logger", logger.child({ correlationId }));
  c.header("x-correlation-id", correlationId);
  await next();
};
