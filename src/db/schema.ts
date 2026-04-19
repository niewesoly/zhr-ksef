import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer) {
    return value;
  },
  fromDriver(value: unknown) {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    throw new TypeError("Expected bytea value");
  },
});

export const ksefEnv = pgEnum("ksef_env", ["production", "test", "demo"]);

export const invoiceStatus = pgEnum("invoice_status", [
  "synced",
  "pending",
  "unassigned",
  "assigned",
  "imported",
  "dismissed",
]);

export const syncRunStatus = pgEnum("sync_run_status", ["running", "ok", "error"]);
export const syncMode = pgEnum("sync_mode", ["incremental", "range"]);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().$defaultFn(() => randomUUID()),
    name: varchar("name", { length: 200 }).notNull(),

    // API key auth. The caller presents `${apiKeyId}_${secret}`; we look up by
    // apiKeyId (O(1), indexed) then bcrypt-compare the whole token against
    // apiKeyHash. `prev` columns hold the previous key during the 24h grace.
    apiKeyId: varchar("api_key_id", { length: 32 }).notNull(),
    apiKeyHash: varchar("api_key_hash", { length: 120 }).notNull(),
    apiKeyIdPrev: varchar("api_key_id_prev", { length: 32 }),
    apiKeyHashPrev: varchar("api_key_hash_prev", { length: 120 }),
    apiKeyRotatedAt: timestamp("api_key_rotated_at", { withTimezone: true }),

    // Envelope encryption: `dekEnc` is AES-256-GCM(KEK, DEK).
    // The other *_enc columns are AES-256-GCM(DEK, value).
    // Each value is packed as: nonce(12) || ciphertext || tag(16).
    dekEnc: bytea("dek_enc").notNull(),
    certPemEnc: bytea("cert_pem_enc"),
    keyPemEnc: bytea("key_pem_enc"),
    keyPassphraseEnc: bytea("key_passphrase_enc"),
    certNotAfter: timestamp("cert_not_after", { withTimezone: true }),

    nip: varchar("nip", { length: 10 }).notNull(),
    apiUrl: ksefEnv("api_url").notNull().default("test"),

    syncEnabled: boolean("sync_enabled").notNull().default(false),
    syncCron: varchar("sync_cron", { length: 100 }),
    lastHwmDate: timestamp("last_hwm_date", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncStatus: varchar("last_sync_status", { length: 20 }),
    lastSyncError: text("last_sync_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    apiKeyIdIdx: uniqueIndex("tenants_api_key_id_idx").on(table.apiKeyId),
    apiKeyIdPrevIdx: index("tenants_api_key_id_prev_idx").on(table.apiKeyIdPrev),
  }),
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    ksefNumber: varchar("ksef_number", { length: 100 }).notNull(),
    invoiceNumber: varchar("invoice_number", { length: 100 }),
    issueDate: date("issue_date"),

    sellerNip: varchar("seller_nip", { length: 20 }),
    sellerName: varchar("seller_name", { length: 500 }),
    buyerNip: varchar("buyer_nip", { length: 20 }),
    buyerName: varchar("buyer_name", { length: 500 }),

    netAmount: decimal("net_amount", { precision: 14, scale: 2 }),
    grossAmount: decimal("gross_amount", { precision: 14, scale: 2 }),
    currency: varchar("currency", { length: 3 }),

    invoiceXml: text("invoice_xml"),
    parsedData: jsonb("parsed_data"),
    schemaVersion: varchar("schema_version", { length: 20 }),

    status: invoiceStatus("status").notNull().default("synced"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),

    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantKsefNumberIdx: uniqueIndex("invoices_tenant_ksef_number_idx").on(
      table.tenantId,
      table.ksefNumber,
    ),
    tenantStatusIdx: index("invoices_tenant_status_idx").on(table.tenantId, table.status),
    tenantIssueDateIdx: index("invoices_tenant_issue_date_idx").on(
      table.tenantId,
      table.issueDate,
    ),
  }),
);

export const invoiceEvents = pgTable(
  "invoice_events",
  {
    id: uuid("id").primaryKey().$defaultFn(() => randomUUID()),
    // tenant_id is denormalised here so RLS can enforce isolation without a
    // join back to invoices (the RLS policy reads current_setting directly).
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    fromStatus: invoiceStatus("from_status"),
    toStatus: invoiceStatus("to_status").notNull(),
    actor: varchar("actor", { length: 200 }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    invoiceIdIdx: index("invoice_events_invoice_id_idx").on(table.invoiceId),
    tenantCreatedAtIdx: index("invoice_events_tenant_created_at_idx").on(
      table.tenantId,
      table.createdAt,
    ),
  }),
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: syncRunStatus("status").notNull().default("running"),
    mode: syncMode("mode").notNull().default("incremental"),
    dateFrom: date("date_from"),
    dateTo: date("date_to"),
    invoicesSynced: integer("invoices_synced").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    tenantStartedAtIdx: index("sync_runs_tenant_started_at_idx").on(
      table.tenantId,
      table.startedAt,
    ),
  }),
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceEvent = typeof invoiceEvents.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
