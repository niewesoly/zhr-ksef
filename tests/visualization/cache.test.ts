import { test, suite } from "node:test";
import { strict as assert } from "node:assert";
import {
  renderKey,
  setRender,
  getRender,
  invalidateRender,
} from "../../src/visualization/cache.js";

// MAX_ENTRIES = 200, MAX_BYTES = 128 * 1024 * 1024 (128 MiB)
const MAX_ENTRIES = 200;
const MAX_BYTES = 128 * 1024 * 1024;

suite("cache", () => {
  test("renderKey format contains tenantId, invoiceId, and format", () => {
    const key = renderKey("t1", "inv1", "html");
    assert.ok(key.includes("t1"), "key must contain tenantId");
    assert.ok(key.includes("inv1"), "key must contain invoiceId");
    assert.ok(key.includes("html"), "key must contain format");
  });

  test("renderKey distinguishes html from pdf for same tenant/invoice", () => {
    const htmlKey = renderKey("t2", "inv2", "html");
    const pdfKey = renderKey("t2", "inv2", "pdf");
    assert.notEqual(htmlKey, pdfKey);
  });

  test("setRender/getRender round-trip preserves buf and contentType", () => {
    const key = renderKey("tenant-rt", "invoice-rt", "html");
    const buf = Buffer.from("hello cache");
    const contentType = "text/html; charset=utf-8";
    setRender(key, buf, contentType);

    const entry = getRender(key);
    assert.ok(entry !== undefined, "entry must exist after setRender");
    assert.equal(entry.contentType, contentType);
    assert.deepEqual(entry.buf, buf);
  });

  test("getRender returns undefined for unknown key", () => {
    const result = getRender("nonexistent-tenant:nonexistent-invoice:html");
    assert.equal(result, undefined);
  });

  test("invalidateRender removes both html and pdf entries", () => {
    const tenantId = "tenant-inv-x";
    const invoiceId = "inv-invalidate";

    const htmlKey = renderKey(tenantId, invoiceId, "html");
    const pdfKey = renderKey(tenantId, invoiceId, "pdf");

    setRender(htmlKey, Buffer.from("<html/>"), "text/html");
    setRender(pdfKey, Buffer.from("%PDF-1.4"), "application/pdf");

    assert.ok(getRender(htmlKey) !== undefined, "html entry should exist before invalidation");
    assert.ok(getRender(pdfKey) !== undefined, "pdf entry should exist before invalidation");

    invalidateRender(tenantId, invoiceId);

    assert.equal(getRender(htmlKey), undefined, "html entry must be gone after invalidation");
    assert.equal(getRender(pdfKey), undefined, "pdf entry must be gone after invalidation");
  });

  test("LRU eviction: oldest entry removed when MAX_ENTRIES exceeded", () => {
    // Use a unique prefix to avoid collisions with other tests.
    const prefix = "lru-evict2";

    // Insert the target entry first (will be the LRU oldest).
    const oldestKey = renderKey(prefix, "oldest", "html");
    setRender(oldestKey, Buffer.from("oldest"), "text/html");

    // Fill up the remaining MAX_ENTRIES - 1 slots. Never re-access oldestKey.
    for (let i = 0; i < MAX_ENTRIES - 1; i++) {
      setRender(renderKey(prefix, `filler-${i}`, "html"), Buffer.from(`v${i}`), "text/html");
    }

    // At this point the store has exactly MAX_ENTRIES entries and oldestKey is the LRU.
    // Insert one more to trigger eviction of the oldest.
    setRender(renderKey(prefix, "overflow", "html"), Buffer.from("overflow"), "text/html");

    // oldestKey must have been evicted.
    assert.equal(
      getRender(oldestKey),
      undefined,
      "LRU entry must be evicted when MAX_ENTRIES is exceeded",
    );
  });

  test("byte budget eviction: second large buffer evicts first", () => {
    // Each buffer is ~64 MiB; two together exceed MAX_BYTES (128 MiB).
    const halfPlus = Math.floor(MAX_BYTES / 2) + 1024;
    const key1 = renderKey("byte-budget", "inv-large-1", "pdf");
    const key2 = renderKey("byte-budget", "inv-large-2", "pdf");

    setRender(key1, Buffer.alloc(halfPlus, 0x41), "application/pdf");
    setRender(key2, Buffer.alloc(halfPlus, 0x42), "application/pdf");

    // key1 should have been evicted because the two buffers together exceed MAX_BYTES.
    assert.equal(
      getRender(key1),
      undefined,
      "first large entry must be evicted after byte budget is exceeded",
    );
    // key2 must still be present.
    assert.ok(
      getRender(key2) !== undefined,
      "second large entry must remain after eviction",
    );
  });

  test("re-inserting an existing key updates its value", () => {
    const key = renderKey("tenant-update", "inv-update", "html");
    const buf1 = Buffer.from("version-one");
    const buf2 = Buffer.from("version-two");

    setRender(key, buf1, "text/html");
    setRender(key, buf2, "text/html");

    const entry = getRender(key);
    assert.ok(entry !== undefined, "entry must exist");
    assert.deepEqual(entry.buf, buf2, "buf must reflect the second setRender call");
  });
});
