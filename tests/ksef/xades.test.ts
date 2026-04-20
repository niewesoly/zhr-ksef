import { test } from "node:test";
import assert from "node:assert/strict";
import { ecDerToRawSignature } from "../../src/ksef/xades.js";

// A "good enough" happy-path test so the happy path is pinned too.
test("ecDerToRawSignature converts well-formed DER to raw R||S for P-256", () => {
  // SEQUENCE { INTEGER r (32 bytes, 0x01 x32), INTEGER s (32 bytes, 0x02 x32) }
  const r = Buffer.alloc(32, 0x01);
  const s = Buffer.alloc(32, 0x02);
  const der = Buffer.concat([
    Buffer.from([0x30, 2 + 32 + 2 + 32]), // SEQUENCE
    Buffer.from([0x02, 32]), r,           // INTEGER r
    Buffer.from([0x02, 32]), s,           // INTEGER s
  ]);
  const raw = ecDerToRawSignature(der, 32);
  assert.strictEqual(raw.length, 64);
  assert.deepStrictEqual(raw.subarray(0, 32), r);
  assert.deepStrictEqual(raw.subarray(32, 64), s);
});

test("ecDerToRawSignature throws when rLen exceeds remaining buffer", () => {
  // SEQUENCE tag + len(ignored), INTEGER tag, rLen=10, but only 2 bytes follow.
  // Under current (buggy) code, subarray clamps silently and returns a short r.
  const bad = Buffer.from([0x30, 0x04, 0x02, 0x0A, 0x01, 0x02]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});

test("ecDerToRawSignature throws when sLen exceeds remaining buffer", () => {
  // Valid r (1 byte: 0xAB), then INTEGER tag, sLen=99, but no bytes follow.
  const bad = Buffer.from([0x30, 0x06, 0x02, 0x01, 0xAB, 0x02, 0x63]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});

test("ecDerToRawSignature throws when missing SEQUENCE body", () => {
  // Only SEQUENCE + len bytes, no INTEGERs
  const bad = Buffer.from([0x30, 0x00]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});
