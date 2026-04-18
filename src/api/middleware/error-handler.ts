import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { config } from "../../config.js";
import { logger } from "../../lib/logger.js";
import type { AppEnv } from "../types.js";

function correlationId(c: Context<AppEnv>): string | undefined {
  try {
    return c.get("correlationId");
  } catch {
    return undefined;
  }
}

// Walk the `.cause` chain and produce a short, redacted summary. Drizzle
// wraps driver errors so the top-level `message` is the full SQL + params
// dump (including bcrypt hashes and encrypted bytea) — we never want that
// anywhere near a response body or a log line.
function redactedMessage(err: Error): string {
  // Drizzle's DrizzleQueryError.message is the full SQL + params dump.
  // Strip it entirely — the real information is in the cause chain.
  if (err.message.startsWith("Failed query:")) return "database query failed";
  return err.message.slice(0, 300).replace(/\s+/g, " ");
}

function causeChain(err: unknown): Array<{ name: string; message: string }> {
  const out: Array<{ name: string; message: string }> = [];
  let cur: unknown = err;
  while (cur instanceof Error && out.length < 5) {
    out.push({ name: cur.name, message: redactedMessage(cur) });
    cur = (cur as { cause?: unknown }).cause;
  }
  return out;
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const cid = correlationId(c);
  const log = (c.get("logger") as typeof logger | undefined) ?? logger;

  if (err instanceof HTTPException) {
    log.warn({ err, status: err.status, path: c.req.path }, "http exception");
    return c.json(
      { error: err.message || "http_error", correlation_id: cid },
      err.status,
    );
  }

  if (err instanceof ZodError) {
    log.warn({ err, path: c.req.path }, "validation error");
    return c.json(
      {
        error: "validation_error",
        issues: err.issues.map((i) => ({ path: i.path, message: i.message })),
        correlation_id: cid,
      },
      400,
    );
  }

  const chain = causeChain(err);
  log.error({ err, path: c.req.path, causeChain: chain }, "unhandled error");

  if (config.isProd) {
    return c.json({ error: "internal_error", correlation_id: cid }, 500);
  }

  // Dev only: return the redacted cause chain so the driver message is
  // visible in the client without ever exposing SQL/params/stack.
  return c.json(
    { error: "internal_error", correlation_id: cid, causes: chain },
    500,
  );
};
