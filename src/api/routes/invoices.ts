import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import type { Tx } from "../../db/index.js";
import { invoiceEvents, invoices } from "../../db/schema.js";
import type { InvoiceFa3 } from "../../ksef/parser.js";
import { InvoiceFa3ShapeCheck } from "../../ksef/types.js";
import type { Logger } from "../../lib/logger.js";
import {
  getRender,
  renderKey,
  setRender,
} from "../../visualization/cache.js";
import { renderInvoiceHtml } from "../../visualization/html-renderer.js";
import { renderInvoicePdf } from "../../visualization/pdf-renderer.js";
import {
  InvalidTransitionError,
} from "../../workflow/state-machine.js";
import { transitionInvoice } from "../../workflow/transition.js";
import { parseJsonBody } from "../middleware/parse-json-body.js";
import { InvoiceListQuery, TransitionRequest } from "../openapi/schemas.js";
import type { AppEnv } from "../types.js";

const CSP_HTML = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function invoiceSummary(row: typeof invoices.$inferSelect) {
  return {
    id: row.id,
    ksefNumber: row.ksefNumber,
    invoiceNumber: row.invoiceNumber,
    issueDate: row.issueDate,
    sellerNip: row.sellerNip,
    sellerName: row.sellerName,
    buyerNip: row.buyerNip,
    buyerName: row.buyerName,
    netAmount: row.netAmount,
    grossAmount: row.grossAmount,
    currency: row.currency,
    status: row.status,
    syncedAt: row.syncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const invoicesRouter = new Hono<AppEnv>();

invoicesRouter.get("/", async (c) => {
  const tx = c.get("tx");
  const query = InvoiceListQuery.parse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );

  const conditions = [eq(invoices.tenantId, c.get("tenant").id)];
  if (query.status) conditions.push(eq(invoices.status, query.status));
  if (query.nip) {
    conditions.push(or(eq(invoices.sellerNip, query.nip), eq(invoices.buyerNip, query.nip))!);
  }
  if (query.dateFrom) conditions.push(gte(invoices.issueDate, query.dateFrom));
  if (query.dateTo) conditions.push(lte(invoices.issueDate, query.dateTo));

  const rows = await tx
    .select()
    .from(invoices)
    .where(and(...conditions))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return c.json({
    page: query.page,
    pageSize: query.pageSize,
    items: rows.map(invoiceSummary),
  });
});

invoicesRouter.get("/:iid", async (c) => {
  const tx = c.get("tx");
  const iid = c.req.param("iid");
  const [row] = await tx.select().from(invoices).where(eq(invoices.id, iid)).limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);

  return c.json({
    invoice: {
      ...invoiceSummary(row),
      metadata: row.metadata,
      parsedData: row.parsedData,
      schemaVersion: row.schemaVersion,
    },
  });
});

invoicesRouter.post("/:iid/transition", parseJsonBody, async (c) => {
  const tx = c.get("tx");
  const tenant = c.get("tenant");
  const iid = c.req.param("iid");
  const body = c.get("body");
  const parsed = TransitionRequest.parse(body);

  try {
    const result = await transitionInvoice(tx, {
      tenantId: tenant.id,
      invoiceId: iid,
      action: parsed.action,
      actor: parsed.actor,
      metadata: parsed.metadata,
    });
    if (!result) return c.json({ error: "not_found" }, 404);
    return c.json({ invoice: result });
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return c.json(
        {
          error: "invalid_transition",
          from: err.from,
          action: parsed.action,
          message: err.message,
        },
        409,
      );
    }
    throw err;
  }
});

invoicesRouter.get("/:iid/events", async (c) => {
  const tx = c.get("tx");
  const iid = c.req.param("iid");
  const rows = await tx
    .select()
    .from(invoiceEvents)
    .where(eq(invoiceEvents.invoiceId, iid))
    .orderBy(desc(invoiceEvents.createdAt))
    .limit(100);
  return c.json({ items: rows });
});

invoicesRouter.get("/:iid/xml", async (c) => {
  const tx = c.get("tx");
  const iid = c.req.param("iid");
  const [row] = await tx
    .select({ invoiceXml: invoices.invoiceXml, ksefNumber: invoices.ksefNumber })
    .from(invoices)
    .where(eq(invoices.id, iid))
    .limit(1);
  if (!row || !row.invoiceXml) return c.json({ error: "not_found" }, 404);

  c.header("Content-Type", "application/xml; charset=utf-8");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Disposition", `inline; filename="${row.ksefNumber}.xml"`);
  return c.body(row.invoiceXml);
});

// Hono's `c.body` types a raw Node Buffer awkwardly; copying into a
// fresh ArrayBuffer satisfies the BodyInit overload without depending
// on Buffer-specific internals.
function bodyFromBuffer(buf: Buffer): ArrayBuffer {
  const out = new ArrayBuffer(buf.byteLength);
  new Uint8Array(out).set(buf);
  return out;
}

async function loadParsedInvoice(
  tx: Tx,
  iid: string,
  logger: Logger,
): Promise<{ ksefNumber: string; parsed: InvoiceFa3 } | null> {
  const [row] = await tx
    .select({ parsedData: invoices.parsedData, ksefNumber: invoices.ksefNumber })
    .from(invoices)
    .where(eq(invoices.id, iid))
    .limit(1);
  if (!row || !row.parsedData) return null;
  const shapeCheck = InvoiceFa3ShapeCheck.safeParse(row.parsedData);
  if (!shapeCheck.success) {
    logger.warn(
      { issues: shapeCheck.error.issues, invoiceId: iid },
      "parsedData failed shape check; falling through to renderer anyway",
    );
  }
  return { ksefNumber: row.ksefNumber, parsed: row.parsedData as InvoiceFa3 };
}

invoicesRouter.get("/:iid/html", async (c) => {
  const tenant = c.get("tenant");
  const iid = c.req.param("iid");
  const key = renderKey(tenant.id, iid, "html");

  c.header("Content-Security-Policy", CSP_HTML);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");

  const cached = getRender(key);
  if (cached) {
    c.header("Content-Type", cached.contentType);
    return c.body(bodyFromBuffer(cached.buf));
  }

  const found = await loadParsedInvoice(c.get("tx"), iid, c.get("logger"));
  if (!found) return c.json({ error: "not_found" }, 404);

  const html = renderInvoiceHtml(found.parsed);
  const buf = Buffer.from(html, "utf8");
  setRender(key, buf, "text/html; charset=utf-8");
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(bodyFromBuffer(buf));
});

invoicesRouter.get("/:iid/pdf", async (c) => {
  const tenant = c.get("tenant");
  const iid = c.req.param("iid");
  const key = renderKey(tenant.id, iid, "pdf");

  const cached = getRender(key);
  if (cached) {
    c.header("Content-Type", cached.contentType);
    c.header("Content-Disposition", `inline; filename="${iid}.pdf"`);
    return c.body(bodyFromBuffer(cached.buf));
  }

  const found = await loadParsedInvoice(c.get("tx"), iid, c.get("logger"));
  if (!found) return c.json({ error: "not_found" }, 404);

  const buf = await renderInvoicePdf(found.parsed);
  setRender(key, buf, "application/pdf");
  c.header("Content-Type", "application/pdf");
  c.header("Content-Disposition", `inline; filename="${found.ksefNumber}.pdf"`);
  return c.body(bodyFromBuffer(buf));
});
