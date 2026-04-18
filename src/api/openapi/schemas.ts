import { z } from "@hono/zod-openapi";

// Colocated to make it easy to evolve the spec without re-plumbing the
// route-level request validation schemas.

export const ErrorResponse = z
  .object({
    error: z.string().openapi({ example: "not_found" }),
    message: z.string().optional(),
    correlationId: z.string().optional(),
  })
  .openapi("ErrorResponse");

export const RotationConflictResponse = z
  .object({ error: z.literal("rotation_conflict") })
  .openapi("RotationConflictResponse");

export const InvalidTransitionResponse = z
  .object({
    error: z.literal("invalid_transition"),
    from: z.string(),
    action: z.string(),
    message: z.string(),
  })
  .openapi("InvalidTransitionResponse");

export const Nip = z
  .string()
  .regex(/^\d{10}$/)
  .openapi({ example: "1234567890", description: "Polish tax ID (10 digits)" });

export const KsefEnv = z
  .enum(["production", "test", "demo"])
  .openapi({ description: "KSeF environment selector" });

export const InvoiceStatus = z
  .enum(["synced", "pending", "unassigned", "assigned", "imported", "dismissed"])
  .openapi({ description: "Invoice workflow state" });

export const InvoiceAction = z
  .enum(["release", "assign", "import", "dismiss"])
  .openapi({ description: "State machine action" });

export const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .openapi({ example: "2026-04-01", description: "ISO date (YYYY-MM-DD)" });

export const CertificateInfo = z
  .object({
    notAfter: z.string().datetime().openapi({ description: "Certificate expiry" }),
    notBefore: z.string().datetime(),
    subject: z.string(),
    issuer: z.string(),
    daysUntilExpiry: z.number().int(),
    warnings: z.array(z.string()),
  })
  .openapi("CertificateInfo");

export const PublicTenant = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    nip: Nip,
    apiUrl: KsefEnv,
    apiKeyId: z.string(),
    syncEnabled: z.boolean(),
    syncCron: z.string().nullable(),
    lastHwmDate: z.string().datetime().nullable(),
    lastSyncAt: z.string().datetime().nullable(),
    lastSyncStatus: z.string().nullable(),
    lastSyncError: z.string().nullable(),
    certNotAfter: z.string().datetime().nullable(),
    hasCertificate: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Tenant");

export const CreateTenantRequest = z
  .object({
    name: z.string().min(1).max(200),
    nip: Nip,
    apiUrl: KsefEnv.default("test"),
  })
  .openapi("CreateTenantRequest");

export const CreateTenantResponse = z
  .object({
    tenant: PublicTenant,
    apiKey: z
      .string()
      .openapi({ description: "Full API key; shown exactly once." }),
  })
  .openapi("CreateTenantResponse");

export const CredentialsInput = z
  .object({
    certBase64: z.string().min(1).openapi({
      description:
        "X.509 certificate — raw bytes of the `.crt`/`.pem` file, base64-encoded.",
    }),
    keyBase64: z.string().min(1).openapi({
      description:
        "Private key — raw bytes of the `.key`/`.pem` file, base64-encoded. PKCS#8, PKCS#1, and encrypted variants all accepted.",
    }),
    passphrase: z
      .string()
      .optional()
      .openapi({ description: "Required only if the key is encrypted." }),
  })
  .openapi("CredentialsInput");

export const PatchTenantRequest = z
  .object({
    name: z.string().min(1).max(200).optional(),
    nip: Nip.optional(),
    apiUrl: KsefEnv.optional(),
    syncEnabled: z.boolean().optional(),
    syncCron: z.string().max(100).nullable().optional(),
    credentials: CredentialsInput.optional(),
  })
  .openapi("PatchTenantRequest");

export const PatchTenantResponse = z
  .object({
    tenant: PublicTenant,
    certificate: CertificateInfo.optional(),
  })
  .openapi("PatchTenantResponse");

export const RotateKeyResponse = z
  .object({
    tenant: PublicTenant,
    apiKey: z.string(),
    gracePeriodHours: z.number().int(),
  })
  .openapi("RotateKeyResponse");

export const ClearCredentialsResponse = z
  .object({
    tenant: PublicTenant,
    cleared: z.literal(true),
  })
  .openapi("ClearCredentialsResponse");

export const InvoiceSummary = z
  .object({
    id: z.string().uuid(),
    ksefNumber: z.string(),
    invoiceNumber: z.string().nullable(),
    issueDate: DateStr.nullable(),
    sellerNip: z.string().nullable(),
    sellerName: z.string().nullable(),
    buyerNip: z.string().nullable(),
    buyerName: z.string().nullable(),
    netAmount: z.string().nullable(),
    grossAmount: z.string().nullable(),
    currency: z.string().nullable(),
    status: InvoiceStatus,
    syncedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("InvoiceSummary");

export const InvoiceDetail = InvoiceSummary.extend({
  metadata: z.record(z.string(), z.unknown()).nullable(),
  parsedData: z.record(z.string(), z.unknown()).nullable(),
  schemaVersion: z.string().nullable(),
}).openapi("InvoiceDetail");

export const InvoiceListQuery = z
  .object({
    status: InvoiceStatus.optional(),
    nip: z.string().max(20).optional(),
    dateFrom: DateStr.optional(),
    dateTo: DateStr.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  .openapi("InvoiceListQuery");

export const InvoiceListResponse = z
  .object({
    page: z.number().int(),
    pageSize: z.number().int(),
    items: z.array(InvoiceSummary),
  })
  .openapi("InvoiceListResponse");

export const InvoiceDetailResponse = z
  .object({ invoice: InvoiceDetail })
  .openapi("InvoiceDetailResponse");

export const TransitionRequest = z
  .object({
    action: InvoiceAction,
    actor: z.string().max(200).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("TransitionRequest");

export const TransitionResult = z
  .object({
    id: z.string().uuid(),
    fromStatus: InvoiceStatus,
    toStatus: InvoiceStatus,
    eventId: z.string().uuid(),
  })
  .openapi("TransitionResult");

export const TransitionResponse = z
  .object({ invoice: TransitionResult })
  .openapi("TransitionResponse");

export const InvoiceEvent = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    fromStatus: InvoiceStatus.nullable(),
    toStatus: InvoiceStatus,
    actor: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi("InvoiceEvent");

export const InvoiceEventsResponse = z
  .object({ items: z.array(InvoiceEvent) })
  .openapi("InvoiceEventsResponse");

export const SyncJobResponse = z
  .object({
    jobId: z.string(),
    kind: z.enum(["incremental", "range"]),
    tenantId: z.string().uuid(),
    dateFrom: DateStr.optional(),
    dateTo: DateStr.optional(),
  })
  .openapi("SyncJobResponse");

export const RangeSyncRequest = z
  .object({ dateFrom: DateStr, dateTo: DateStr })
  .openapi("RangeSyncRequest");

export const SyncRun = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    mode: z.enum(["incremental", "range"]),
    status: z.enum(["running", "ok", "error"]),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    dateFrom: DateStr.nullable(),
    dateTo: DateStr.nullable(),
    imported: z.number().int().nullable(),
    error: z.string().nullable(),
  })
  .openapi("SyncRun");

export const SyncRunsResponse = z
  .object({ items: z.array(SyncRun) })
  .openapi("SyncRunsResponse");

export const SyncRunResponse = z
  .object({ run: SyncRun })
  .openapi("SyncRunResponse");

export const HealthResponse = z
  .object({ status: z.literal("ok"), tenant: z.string().uuid().optional() })
  .openapi("HealthResponse");

export const DeletedResponse = z
  .object({ deleted: z.literal(true) })
  .openapi("DeletedResponse");
