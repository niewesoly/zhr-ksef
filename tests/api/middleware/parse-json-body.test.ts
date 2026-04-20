import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { parseJsonBody } from "../../../src/api/middleware/parse-json-body.js";

test("parseJsonBody stores parsed body on context for valid JSON", async () => {
  const app = new Hono();
  app.post("/", parseJsonBody, (c) => c.json({ got: c.get("body") }));

  const res = await app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ a: 1, b: "x" }),
  });

  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { got: { a: 1, b: "x" } });
});

test("parseJsonBody stores empty object when body is empty", async () => {
  // Some clients send POST with no body; the old code treated that as {}.
  // Preserve behavior: either accept empty body as {} or return 400 — the
  // decision is documented below.
  const app = new Hono();
  app.post("/", parseJsonBody, (c) => c.json({ got: c.get("body") }));

  const res = await app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "",
  });

  // parseJsonBody treats empty body as {} (matches the behavior the
  // .catch(() => ({})) pattern provided; downstream Zod will reject
  // missing required fields with clearer messages).
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { got: {} });
});

test("parseJsonBody returns 400 malformed_json on broken JSON", async () => {
  const app = new Hono();
  app.post("/", parseJsonBody, (c) => c.json({ got: c.get("body") }));

  const res = await app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });

  assert.strictEqual(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.strictEqual(json.error, "malformed_json");
});
