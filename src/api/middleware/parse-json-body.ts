import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";

const MAX_BODY_BYTES = 1_048_576; // 1 MB

function getCid(c: Context<AppEnv>): string | undefined {
  try {
    return c.get("correlationId");
  } catch {
    return undefined;
  }
}

/**
 * Parses the request body as JSON and stores it at `c.get("body")`.
 *
 * - Bodies larger than 1 MB (either by Content-Length header or measured
 *   after reading) → 413 `{ error: "payload_too_large", correlation_id }`.
 * - Empty body → `{}` (matches prior `.catch(() => ({}))` behavior; Zod
 *   parses that further and reports missing required fields clearly).
 * - Malformed JSON → 400 `{ error: "malformed_json", correlation_id }`.
 *
 * Downstream handlers read `const body = c.get("body")` and pass it to a
 * Zod schema. `body` is typed `unknown` on purpose so Zod validation
 * cannot be skipped.
 */
export const parseJsonBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  const contentLength = c.req.header("content-length");
  if (contentLength !== undefined) {
    const n = Number.parseInt(contentLength, 10);
    if (Number.isFinite(n) && n > MAX_BODY_BYTES) {
      return c.json(
        { error: "payload_too_large", correlation_id: getCid(c) },
        413,
      );
    }
  }

  const raw = await c.req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return c.json(
      { error: "payload_too_large", correlation_id: getCid(c) },
      413,
    );
  }

  let body: unknown = {};
  if (raw.length > 0) {
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json(
        { error: "malformed_json", correlation_id: getCid(c) },
        400,
      );
    }
  }
  c.set("body", body);
  await next();
};
