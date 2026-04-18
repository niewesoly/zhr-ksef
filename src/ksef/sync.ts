import AdmZip from "adm-zip";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { invoices, syncRuns, tenants, type Tenant } from "../db/schema.js";
import { withTenantTx } from "../db/tenant-tx.js";
import { logger } from "../lib/logger.js";
import { invalidateToken, type KsefCredentials } from "./auth.js";
import { loadTenantKsefCredentials } from "./credentials.js";
import {
  downloadAndDecryptZip,
  pollExportStatus,
  requestInvoiceExport,
} from "./exporter.js";
import { parseInvoiceFa3 } from "./parser.js";

const log = logger.child({ module: "ksef-sync" });

// Hard caps echoed from the plan's XML parsing hardening section.
const MAX_ZIP_ENTRIES = 1000;
const LAST_SYNC_ERROR_MAX = 1000;

export interface SyncResult {
  syncRunId: string;
  imported: number;
  newHwmDate: string | null;
}

export interface SyncOptions {
  mode: "incremental" | "range";
  dateFrom?: string;
  dateTo?: string;
}

/** Friendly, length-capped representation of a sync error. The raw message
 *  may include KSeF API dumps that carry sensitive data — we strip PEM
 *  blocks and cap at 1000 chars before storing it in the DB. */
function sanitizeSyncError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const noPem = raw.replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[redacted-pem]");
  return noPem.length > LAST_SYNC_ERROR_MAX
    ? `${noPem.slice(0, LAST_SYNC_ERROR_MAX - 1)}…`
    : noPem;
}

/** Runs a KSeF export for a tenant: request → poll → download → parse → upsert.
 *  Idempotent on (tenant_id, ksef_number). Each DB touch is a short tenant-scoped
 *  transaction so RLS enforces isolation even if a query omits a WHERE clause. */
export async function syncTenant(tenant: Tenant, opts: SyncOptions): Promise<SyncResult> {
  const childLog = log.child({ tenantId: tenant.id, mode: opts.mode });
  const credentials = loadTenantKsefCredentials(tenant);

  const syncRunId = await withTenantTx(tenant.id, async (tx) => {
    const [row] = await tx
      .insert(syncRuns)
      .values({
        tenantId: tenant.id,
        status: "running",
        mode: opts.mode,
        dateFrom: opts.dateFrom?.slice(0, 10) ?? null,
        dateTo: opts.dateTo?.slice(0, 10) ?? null,
      })
      .returning({ id: syncRuns.id });
    return row!.id;
  });

  childLog.info({ syncRunId }, "sync started");

  try {
    const fromDate = opts.mode === "range"
      ? opts.dateFrom
      : (tenant.lastHwmDate?.toISOString() ?? undefined);

    const { imported, newHwmDate } = await runKsefExport(
      tenant,
      credentials,
      fromDate,
      opts.dateTo,
      childLog,
    );

    const finishedAt = new Date();
    await withTenantTx(tenant.id, async (tx) => {
      await tx
        .update(syncRuns)
        .set({
          status: "ok",
          invoicesSynced: imported,
          finishedAt,
        })
        .where(eq(syncRuns.id, syncRunId));
    });

    // Tenants table is not RLS-protected (singleton per row is keyed by id);
    // a plain update outside the tenant tx keeps the HWM write decoupled.
    if (opts.mode === "incremental") {
      await db
        .update(tenants)
        .set({
          lastHwmDate: newHwmDate ? new Date(newHwmDate) : tenant.lastHwmDate,
          lastSyncAt: finishedAt,
          lastSyncStatus: "ok",
          lastSyncError: null,
          updatedAt: finishedAt,
        })
        .where(eq(tenants.id, tenant.id));
    } else {
      await db
        .update(tenants)
        .set({
          lastSyncAt: finishedAt,
          lastSyncStatus: "ok",
          lastSyncError: null,
          updatedAt: finishedAt,
        })
        .where(eq(tenants.id, tenant.id));
    }

    childLog.info({ syncRunId, imported, newHwmDate }, "sync ok");
    return { syncRunId, imported, newHwmDate };
  } catch (err) {
    const errorMessage = sanitizeSyncError(err);
    childLog.error({ syncRunId, err }, "sync failed");

    // If the cached token was the problem (401/expired) drop it so the
    // next run re-authenticates from scratch.
    invalidateToken(tenant.id);

    const finishedAt = new Date();
    await withTenantTx(tenant.id, async (tx) => {
      await tx
        .update(syncRuns)
        .set({ status: "error", errorMessage, finishedAt })
        .where(eq(syncRuns.id, syncRunId));
    });
    await db
      .update(tenants)
      .set({
        lastSyncAt: finishedAt,
        lastSyncStatus: "error",
        lastSyncError: errorMessage,
        updatedAt: finishedAt,
      })
      .where(eq(tenants.id, tenant.id));

    throw err;
  }
}

async function runKsefExport(
  tenant: Tenant,
  credentials: KsefCredentials,
  fromDate: string | undefined,
  toDate: string | undefined,
  childLog: typeof log,
): Promise<{ imported: number; newHwmDate: string | null }> {
  const { referenceNumber, aesCredentials } = await requestInvoiceExport(
    tenant.id,
    credentials,
    fromDate,
    toDate,
  );
  childLog.info({ referenceNumber }, "export requested");

  const status = await pollExportStatus(tenant.id, credentials, referenceNumber);
  const pkg = status.package;

  if (!pkg?.parts || pkg.parts.length === 0) {
    childLog.info({ referenceNumber }, "export empty");
    return {
      imported: 0,
      newHwmDate: hwmFromPackage(pkg),
    };
  }

  let imported = 0;
  for (let i = 0; i < pkg.parts.length; i++) {
    const part = pkg.parts[i]!;
    childLog.info({ partIndex: i, totalParts: pkg.parts.length }, "downloading part");
    const zipBuffer = await downloadAndDecryptZip(part.url, aesCredentials);
    imported += await importZipBuffer(tenant.id, zipBuffer, childLog);
  }

  return { imported, newHwmDate: hwmFromPackage(pkg) };
}

function hwmFromPackage(pkg: {
  isTruncated?: boolean;
  permanentStorageHwmDate?: string;
  lastPermanentStorageDate?: string;
} | undefined): string | null {
  if (!pkg) return null;
  const candidate = pkg.isTruncated
    ? pkg.lastPermanentStorageDate
    : pkg.permanentStorageHwmDate;
  return candidate ?? null;
}

async function importZipBuffer(
  tenantId: string,
  zipBuffer: Buffer,
  childLog: typeof log,
): Promise<number> {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(
      `Paczka ZIP zawiera ${entries.length} wpisów, maksymalnie dozwolone ${MAX_ZIP_ENTRIES}.`,
    );
  }

  let insertedCount = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (entry.entryName.endsWith("_metadata.json")) continue;
    if (!entry.entryName.endsWith(".xml")) continue;

    const ksefNumber = entry.entryName.replace(/\.xml$/, "").split("/").pop() ?? entry.entryName;
    const xml = entry.getData().toString("utf-8");

    let parsed;
    try {
      parsed = parseInvoiceFa3(xml, ksefNumber);
    } catch (parseErr) {
      childLog.warn({ ksefNumber, err: parseErr }, "parse failed, skipping");
      continue;
    }

    const inserted = await withTenantTx(tenantId, async (tx) => {
      const rows = await tx
        .insert(invoices)
        .values({
          tenantId,
          ksefNumber,
          invoiceNumber: parsed.invoiceNumber,
          issueDate: parsed.issueDate,
          sellerNip: parsed.seller.nip,
          sellerName: parsed.seller.nazwa,
          buyerNip: parsed.buyer.nip,
          buyerName: parsed.buyer.nazwa,
          netAmount: null,
          grossAmount: parsed.totalGross != null ? parsed.totalGross.toFixed(2) : null,
          currency: parsed.currency,
          invoiceXml: xml,
          parsedData: parsed,
          schemaVersion: "FA(3)",
          status: "synced",
          syncedAt: new Date(),
        })
        .onConflictDoNothing({ target: [invoices.tenantId, invoices.ksefNumber] })
        .returning({ id: invoices.id });
      return rows.length;
    });

    insertedCount += inserted;
  }

  return insertedCount;
}
