import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { requestLogMiddleware } from "../../../src/api/middleware/request-log.js";
import type { AppEnv } from "../../../src/api/types.js";

interface LogCall {
  level: "info" | "warn" | "error";
  obj: Record<string, unknown>;
  msg: string;
}

function fakeLogger() {
  const calls: LogCall[] = [];
  const push = (level: LogCall["level"]) =>
    (obj: Record<string, unknown>, msg: string) => {
      calls.push({ level, obj, msg });
    };
  return {
    calls,
    logger: { info: push("info"), warn: push("warn"), error: push("error") },
  };
}

function buildApp(injectLogger: ReturnType<typeof fakeLogger>["logger"]) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("logger", injectLogger as unknown as AppEnv["Variables"]["logger"]);
    await next();
  });
  app.use("*", requestLogMiddleware);
  return app;
}

test("requestLogMiddleware emits one info line with method/path/status/durationMs", async () => {
  const fake = fakeLogger();
  const app = buildApp(fake.logger);
  app.get("/widgets/:id", (c) => c.json({ ok: true }));

  const res = await app.request("/widgets/abc");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(fake.calls.length, 1);

  const [call] = fake.calls;
  assert.strictEqual(call!.level, "info");
  assert.strictEqual(call!.msg, "request");
  assert.strictEqual(call!.obj["method"], "GET");
  assert.strictEqual(call!.obj["path"], "/widgets/abc");
  assert.strictEqual(call!.obj["status"], 200);
  assert.ok(
    typeof call!.obj["durationMs"] === "number" &&
      (call!.obj["durationMs"] as number) >= 0,
    "durationMs should be a non-negative number",
  );
});

test("requestLogMiddleware logs 4xx at warn level", async () => {
  const fake = fakeLogger();
  const app = buildApp(fake.logger);
  app.get("/bad", (c) => c.json({ error: "x" }, 404));

  await app.request("/bad");
  assert.strictEqual(fake.calls.length, 1);
  assert.strictEqual(fake.calls[0]!.level, "warn");
  assert.strictEqual(fake.calls[0]!.obj["status"], 404);
});

test("requestLogMiddleware logs 5xx at error level", async () => {
  const fake = fakeLogger();
  const app = buildApp(fake.logger);
  app.get("/boom", (c) => c.json({ error: "x" }, 500));

  await app.request("/boom");
  assert.strictEqual(fake.calls.length, 1);
  assert.strictEqual(fake.calls[0]!.level, "error");
  assert.strictEqual(fake.calls[0]!.obj["status"], 500);
});

test("requestLogMiddleware skips /health and /", async () => {
  const fake = fakeLogger();
  const app = buildApp(fake.logger);
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/", (c) => c.json({ status: "ok" }));

  await app.request("/health");
  await app.request("/");
  assert.strictEqual(fake.calls.length, 0);
});

test("requestLogMiddleware captures tenantId when downstream middleware sets it", async () => {
  const fake = fakeLogger();
  const app = buildApp(fake.logger);
  app.use("/api/*", async (c, next) => {
    // Simulate tenantScopeMiddleware populating the tenant after auth.
    c.set("tenant", { id: "tenant-123" } as AppEnv["Variables"]["tenant"]);
    await next();
  });
  app.get("/api/things", (c) => c.json({ ok: true }));

  await app.request("/api/things");
  assert.strictEqual(fake.calls.length, 1);
  assert.strictEqual(fake.calls[0]!.obj["tenantId"], "tenant-123");
});

test("requestLogMiddleware omits tenantId when tenant is not set", async () => {
  const fake = fakeLogger();
  const app = buildApp(fake.logger);
  app.get("/public", (c) => c.json({ ok: true }));

  await app.request("/public");
  assert.strictEqual(fake.calls.length, 1);
  assert.strictEqual(fake.calls[0]!.obj["tenantId"], undefined);
});
