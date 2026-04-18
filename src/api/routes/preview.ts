import { Hono } from "hono";
import { parseInvoiceFa3, MAX_INVOICE_XML_BYTES } from "../../ksef/parser.js";
import { renderInvoiceHtml } from "../../visualization/html-renderer.js";
import { renderInvoicePdf } from "../../visualization/pdf-renderer.js";

// Test-only visualization preview — accepts raw FA(3) XML and renders HTML or
// PDF without requiring a tenant, API key, or stored invoice. Only mounted
// when NODE_ENV !== "production".

const CSP_HTML = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const previewRouter = new Hono();

previewRouter.post("/html", async (c) => {
  const xml = await c.req.text();
  if (Buffer.byteLength(xml, "utf8") > MAX_INVOICE_XML_BYTES) {
    return c.json({ error: "payload_too_large" }, 413);
  }
  let parsed;
  try {
    parsed = parseInvoiceFa3(xml, "preview");
  } catch (err) {
    return c.json({ error: "parse_error", message: String(err) }, 422);
  }
  const html = renderInvoiceHtml(parsed);
  c.header("Content-Type", "text/html; charset=utf-8");
  c.header("Content-Security-Policy", CSP_HTML);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  return c.body(html);
});

previewRouter.post("/pdf", async (c) => {
  const xml = await c.req.text();
  if (Buffer.byteLength(xml, "utf8") > MAX_INVOICE_XML_BYTES) {
    return c.json({ error: "payload_too_large" }, 413);
  }
  let parsed;
  try {
    parsed = parseInvoiceFa3(xml, "preview");
  } catch (err) {
    return c.json({ error: "parse_error", message: String(err) }, 422);
  }
  const buf = await renderInvoicePdf(parsed);
  const out = new ArrayBuffer(buf.byteLength);
  new Uint8Array(out).set(buf);
  c.header("Content-Type", "application/pdf");
  c.header("Content-Disposition", 'inline; filename="preview.pdf"');
  return c.body(out);
});
