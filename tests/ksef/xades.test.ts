import { test } from "node:test";
import assert from "node:assert/strict";
import { ecDerToRawSignature } from "../../src/ksef/xades.js";

/**
 * Builds a well-formed DER SEQUENCE { INTEGER r, INTEGER s } with either
 * short-form (len ≤ 127) or long-form (0x81 prefix) SEQUENCE length.
 * Chooses the form based on body size.
 */
function buildDer(r: Buffer, s: Buffer): Buffer {
  const body = Buffer.concat([
    Buffer.from([0x02, r.length]), r,
    Buffer.from([0x02, s.length]), s,
  ]);
  if (body.length <= 0x7f) {
    return Buffer.concat([Buffer.from([0x30, body.length]), body]);
  }
  return Buffer.concat([Buffer.from([0x30, 0x81, body.length]), body]);
}

// --- Happy paths ---

test("ecDerToRawSignature converts well-formed DER to raw R||S for P-256", () => {
  const r = Buffer.alloc(32, 0x01);
  const s = Buffer.alloc(32, 0x02);
  const der = buildDer(r, s);
  const raw = ecDerToRawSignature(der, 32);
  assert.strictEqual(raw.length, 64);
  assert.deepStrictEqual(raw.subarray(0, 32), r);
  assert.deepStrictEqual(raw.subarray(32, 64), s);
});

test("ecDerToRawSignature handles long-form SEQUENCE length (P-521, 66-byte coords)", () => {
  const r = Buffer.alloc(66, 0x03);
  const s = Buffer.alloc(66, 0x04);
  const der = buildDer(r, s); // SEQUENCE body = 2+66+2+66 = 136 > 127, forces long-form
  assert.strictEqual(der[1], 0x81); // sanity: long-form marker
  const raw = ecDerToRawSignature(der, 66);
  assert.strictEqual(raw.length, 132);
  assert.deepStrictEqual(raw.subarray(0, 66), r);
  assert.deepStrictEqual(raw.subarray(66, 132), s);
});

// --- Error paths ---

test("ecDerToRawSignature throws when SEQUENCE tag is wrong", () => {
  const bad = Buffer.from([0x31, 0x06, 0x02, 0x01, 0xAB, 0x02, 0x01, 0xCD]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});

test("ecDerToRawSignature throws when buffer is too short for header", () => {
  assert.throws(() => ecDerToRawSignature(Buffer.from([0x30]), 32), /DER/);
});

test("ecDerToRawSignature throws when rLen exceeds remaining buffer", () => {
  // SEQUENCE len declared 4, INTEGER rLen=10, only 2 bytes follow.
  const bad = Buffer.from([0x30, 0x04, 0x02, 0x0A, 0x01, 0x02]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});

test("ecDerToRawSignature throws when sLen exceeds remaining buffer", () => {
  // Valid r (1 byte 0xAB), INTEGER tag, sLen=99, no bytes follow.
  const bad = Buffer.from([0x30, 0x06, 0x02, 0x01, 0xAB, 0x02, 0x63]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});

test("ecDerToRawSignature throws when s-length byte itself is past buffer end", () => {
  // REGRESSION: previously bypassed bounds check via NaN comparison.
  // SEQUENCE len=6, INTEGER len=1 r=0xAB, INTEGER tag at offset 5, no length byte.
  const bad = Buffer.from([0x30, 0x06, 0x02, 0x01, 0xAB, 0x02]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});

test("ecDerToRawSignature throws when SEQUENCE body is empty", () => {
  const bad = Buffer.from([0x30, 0x00]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});

test("ecDerToRawSignature throws on trailing bytes after s", () => {
  const r = Buffer.alloc(32, 0x01);
  const s = Buffer.alloc(32, 0x02);
  const good = buildDer(r, s);
  const withTrailing = Buffer.concat([good, Buffer.from([0xFF])]);
  assert.throws(() => ecDerToRawSignature(withTrailing, 32), /DER/);
});

test("ecDerToRawSignature throws on zero-length r", () => {
  const bad = Buffer.from([0x30, 0x05, 0x02, 0x00, 0x02, 0x01, 0xAB]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});

test("ecDerToRawSignature throws on zero-length s", () => {
  const bad = Buffer.from([0x30, 0x05, 0x02, 0x01, 0xAB, 0x02, 0x00]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});

test("ecDerToRawSignature throws when INTEGER tag is wrong", () => {
  // SEQUENCE OK, but first inner tag is 0x03 (BIT STRING) not 0x02 (INTEGER)
  const bad = Buffer.from([0x30, 0x03, 0x03, 0x01, 0xAB]);
  assert.throws(() => ecDerToRawSignature(bad, 32), /DER/);
});
