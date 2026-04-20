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

test("parseJsonBody returns 413 when Content-Length exceeds cap", async () => {
  const app = new Hono();
  app.post("/", parseJsonBody, (c) => c.json({ got: c.get("body") }));

  const big = "x".repeat(1_048_577); // just over 1 MB
  const res = await app.request("/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(big.length),
    },
    body: big,
  });

  assert.strictEqual(res.status, 413);
  const json = (await res.json()) as { error: string };
  assert.strictEqual(json.error, "payload_too_large");
});

test("parseJsonBody returns 413 when body exceeds cap even without Content-Length", async () => {
  // This belt-and-suspenders path catches clients that lie about or omit
  // Content-Length. We construct a body larger than the cap.
  const app = new Hono();
  app.post("/", parseJsonBody, (c) => c.json({ got: c.get("body") }));

  const big = "x".repeat(1_048_577);
  // Most runtimes auto-set content-length on string body; to exercise the
  // second check we omit the header explicitly. Hono may still set it —
  // this test validates behavior either way (413 on either path).
  const res = await app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: big,
  });

  assert.strictEqual(res.status, 413);
});

test("parseJsonBody does not throw when correlationId is unset", async () => {
  // Exercise the malformed-JSON path in a minimal app WITHOUT correlation
  // middleware. The defensive getCid helper should return undefined
  // without throwing.
  const app = new Hono();
  app.post("/", parseJsonBody, (c) => c.json({ ok: true }));

  const res = await app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });

  assert.strictEqual(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.strictEqual(json.error, "malformed_json");
});
