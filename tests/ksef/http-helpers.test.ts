import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetry, withTimeout } from "../../src/ksef/http-helpers.js";

test("withTimeout aborts slow fetch", async () => {
  await assert.rejects(
    withTimeout(
      (signal) =>
        new Promise((_, rej) =>
          signal.addEventListener("abort", () => rej(new Error("aborted"))),
        ),
      50,
    ),
    /aborted/,
  );
});

test("withTimeout passes through on fast resolve", async () => {
  const out = await withTimeout(async () => "ok", 100);
  assert.strictEqual(out, "ok");
});

test("withRetry retries on transient failure and succeeds", async () => {
  let calls = 0;
  const out = await withRetry(
    async () => {
      calls++;
      if (calls < 2) throw new Error("flake");
      return 42;
    },
    { maxRetries: 3, isRetryable: () => true, backoffMs: () => 1 },
  );
  assert.strictEqual(out, 42);
  assert.strictEqual(calls, 2);
});

test("withRetry throws the last error after maxRetries", async () => {
  await assert.rejects(
    withRetry(
      async () => {
        throw new Error("boom");
      },
      { maxRetries: 2, isRetryable: () => true, backoffMs: () => 1 },
    ),
    /boom/,
  );
});

test("withRetry does not retry when isRetryable returns false", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw new Error("fatal");
      },
      { maxRetries: 5, isRetryable: () => false, backoffMs: () => 1 },
    ),
    /fatal/,
  );
  assert.strictEqual(calls, 1);
});
