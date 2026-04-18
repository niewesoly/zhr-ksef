import { test } from "node:test";
import { strict as assert } from "node:assert";
import { renderInvoicePdf } from "../../src/visualization/pdf-renderer.js";
import { parseInvoiceFa3 } from "../../src/ksef/parser.js";
import { loadFixture } from "../helpers/fixtures.js";

test("renderInvoicePdf produces a non-empty Buffer for sample_fa3.xml", async () => {
  const xml = loadFixture("sample_fa3.xml");
  const invoice = parseInvoiceFa3(xml, "TEST-KSEF");
  const buf = await renderInvoicePdf(invoice);
  assert.ok(Buffer.isBuffer(buf), "result must be a Buffer");
  assert.ok(buf.length > 1024, "PDF must be at least 1KB");
  // PDF magic bytes
  assert.equal(buf.slice(0, 4).toString("ascii"), "%PDF", "must start with %PDF");
});
