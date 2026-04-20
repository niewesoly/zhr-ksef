import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";

/**
 * Parses the request body as JSON and stores it at `c.get("body")`.
 *
 * - Empty body → `{}` (matches prior `.catch(() => ({}))` behavior; Zod
 *   parses that further and reports missing required fields clearly).
 * - Malformed JSON → 400 `{ error: "malformed_json", correlation_id }`.
 *
 * Downstream handlers read `const body = c.get("body")` and pass it to a
 * Zod schema. `body` is typed `unknown` on purpose so Zod validation
 * cannot be skipped.
 */
export const parseJsonBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  const raw = await c.req.text();
  let body: unknown = {};
  if (raw.length > 0) {
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json(
        { error: "malformed_json", correlation_id: c.get("correlationId") },
        400,
      );
    }
  }
  c.set("body", body);
  await next();
};
