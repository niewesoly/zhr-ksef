import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ClearCredentialsResponse,
  CreateTenantRequest,
  CreateTenantResponse,
  DeletedResponse,
  ErrorResponse,
  HealthResponse,
  InvalidTransitionResponse,
  InvoiceDetailResponse,
  InvoiceEventsResponse,
  InvoiceListQuery,
  InvoiceListResponse,
  PatchTenantRequest,
  PatchTenantResponse,
  PublicTenant,
  RangeSyncRequest,
  RotateKeyResponse,
  RotationConflictResponse,
  SyncJobResponse,
  SyncRunResponse,
  SyncRunsResponse,
  TransitionRequest,
  TransitionResponse,
} from "./schemas.js";

// This OpenAPIHono is **never mounted** on the main server — it exists
// only so we can call `getOpenAPIDocument` on it. Keeping it separate
// avoids churning the existing route handlers during docs work.

const json = <T>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

const binary = (contentType: string, description: string) => ({
  content: {
    [contentType]: { schema: z.string().openapi({ format: "binary" }) },
  },
  description,
});

const ApiKeySecurity = [{ ApiKeyAuth: [] as string[] }];
const AdminSecurity = [{ AdminKeyAuth: [] as string[] }];

const TenantParams = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" }, example: "0f8fad5b-d9cb-469f-a165-70867728950e" }),
});

const InvoiceParams = TenantParams.extend({
  iid: z
    .string()
    .uuid()
    .openapi({ param: { name: "iid", in: "path" } }),
});

const SyncRunParams = TenantParams.extend({
  rid: z
    .string()
    .uuid()
    .openapi({ param: { name: "rid", in: "path" } }),
});

const notFound = json(ErrorResponse, "Not found");
const unauthorized = json(ErrorResponse, "Missing or invalid API key");
const forbidden = json(ErrorResponse, "Caller is not authorized for this resource");
const badRequest = json(ErrorResponse, "Validation failed");

const stub = () => ({}) as never;

export const docsApp = new OpenAPIHono();

// ---- Health ---------------------------------------------------------------

docsApp.openapi(
  createRoute({
    method: "get",
    path: "/health",
    tags: ["health"],
    summary: "Liveness probe",
    responses: { 200: json(HealthResponse, "Service alive") },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "get",
    path: "/health/detailed",
    tags: ["health"],
    summary: "Readiness probe (authenticated)",
    security: ApiKeySecurity,
    responses: {
      200: json(HealthResponse, "Service ready"),
      401: unauthorized,
    },
  }),
  stub,
);

// ---- Tenants --------------------------------------------------------------

docsApp.openapi(
  createRoute({
    method: "post",
    path: "/api/v1/tenants",
    tags: ["tenants"],
    summary: "Provision a new tenant (admin)",
    security: AdminSecurity,
    request: {
      body: { content: { "application/json": { schema: CreateTenantRequest } }, required: true },
    },
    responses: {
      201: json(CreateTenantResponse, "Tenant created; plaintext API key returned once."),
      400: badRequest,
      401: unauthorized,
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "delete",
    path: "/api/v1/tenants/{id}",
    tags: ["tenants"],
    summary: "Delete a tenant (admin)",
    security: AdminSecurity,
    request: { params: TenantParams },
    responses: {
      200: json(DeletedResponse, "Tenant deleted"),
      401: unauthorized,
      404: notFound,
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "get",
    path: "/api/v1/tenants/{id}",
    tags: ["tenants"],
    summary: "Fetch tenant details",
    security: ApiKeySecurity,
    request: { params: TenantParams },
    responses: {
      200: json(z.object({ tenant: PublicTenant }), "Tenant"),
      401: unauthorized,
      403: forbidden,
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "patch",
    path: "/api/v1/tenants/{id}",
    tags: ["tenants"],
    summary: "Update tenant (profile, sync, credentials)",
    security: ApiKeySecurity,
    request: {
      params: TenantParams,
      body: { content: { "application/json": { schema: PatchTenantRequest } }, required: true },
    },
    responses: {
      200: json(PatchTenantResponse, "Updated"),
      400: json(ErrorResponse, "Invalid certificate or payload"),
      401: unauthorized,
      403: forbidden,
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "post",
    path: "/api/v1/tenants/{id}/rotate-key",
    tags: ["tenants"],
    summary: "Rotate API key (24h grace on previous key)",
    security: ApiKeySecurity,
    request: { params: TenantParams },
    responses: {
      200: json(RotateKeyResponse, "Rotation succeeded; new plaintext API key returned once."),
      401: unauthorized,
      403: forbidden,
      409: json(RotationConflictResponse, "Rotation race — retry with the old key"),
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "delete",
    path: "/api/v1/tenants/{id}/credentials",
    tags: ["tenants"],
    summary: "Clear stored certificate and key",
    security: ApiKeySecurity,
    request: { params: TenantParams },
    responses: {
      200: json(ClearCredentialsResponse, "Credentials cleared"),
      401: unauthorized,
      403: forbidden,
    },
  }),
  stub,
);

// ---- Invoices -------------------------------------------------------------

docsApp.openapi(
  createRoute({
    method: "get",
    path: "/api/v1/tenants/{id}/invoices",
    tags: ["invoices"],
    summary: "List invoices with filters",
    security: ApiKeySecurity,
    request: { params: TenantParams, query: InvoiceListQuery },
    responses: {
      200: json(InvoiceListResponse, "Filtered, paginated invoice list"),
      401: unauthorized,
      403: forbidden,
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "get",
    path: "/api/v1/tenants/{id}/invoices/{iid}",
    tags: ["invoices"],
    summary: "Fetch invoice with parsed data",
    security: ApiKeySecurity,
    request: { params: InvoiceParams },
    responses: {
      200: json(InvoiceDetailResponse, "Invoice detail"),
      401: unauthorized,
      403: forbidden,
      404: notFound,
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "post",
    path: "/api/v1/tenants/{id}/invoices/{iid}/transition",
    tags: ["invoices"],
    summary: "Advance the invoice state machine",
    security: ApiKeySecurity,
    request: {
      params: InvoiceParams,
      body: { content: { "application/json": { schema: TransitionRequest } }, required: true },
    },
    responses: {
      200: json(TransitionResponse, "Transition recorded"),
      400: badRequest,
      401: unauthorized,
      403: forbidden,
      404: notFound,
      409: json(InvalidTransitionResponse, "Action not valid from current state"),
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "get",
    path: "/api/v1/tenants/{id}/invoices/{iid}/events",
    tags: ["invoices"],
    summary: "Invoice audit events",
    security: ApiKeySecurity,
    request: { params: InvoiceParams },
    responses: {
      200: json(InvoiceEventsResponse, "Up to 100 latest events"),
      401: unauthorized,
      403: forbidden,
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "get",
    path: "/api/v1/tenants/{id}/invoices/{iid}/xml",
    tags: ["invoices"],
    summary: "Original KSeF XML document",
    security: ApiKeySecurity,
    request: { params: InvoiceParams },
    responses: {
      200: binary("application/xml", "Raw XML body"),
      401: unauthorized,
      403: forbidden,
      404: notFound,
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "get",
    path: "/api/v1/tenants/{id}/invoices/{iid}/html",
    tags: ["invoices"],
    summary: "HTML rendering of the invoice",
    security: ApiKeySecurity,
    request: { params: InvoiceParams },
    responses: {
      200: binary("text/html", "Self-contained HTML with strict CSP headers"),
      401: unauthorized,
      403: forbidden,
      404: notFound,
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "get",
    path: "/api/v1/tenants/{id}/invoices/{iid}/pdf",
    tags: ["invoices"],
    summary: "PDF rendering of the invoice",
    security: ApiKeySecurity,
    request: { params: InvoiceParams },
    responses: {
      200: binary("application/pdf", "PDF body"),
      401: unauthorized,
      403: forbidden,
      404: notFound,
    },
  }),
  stub,
);

// ---- Sync -----------------------------------------------------------------

docsApp.openapi(
  createRoute({
    method: "post",
    path: "/api/v1/tenants/{id}/sync",
    tags: ["sync"],
    summary: "Enqueue an incremental sync job",
    security: ApiKeySecurity,
    request: { params: TenantParams },
    responses: {
      202: json(SyncJobResponse, "Job enqueued"),
      401: unauthorized,
      403: forbidden,
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "post",
    path: "/api/v1/tenants/{id}/sync/range",
    tags: ["sync"],
    summary: "Enqueue a date-range sync job",
    security: ApiKeySecurity,
    request: {
      params: TenantParams,
      body: { content: { "application/json": { schema: RangeSyncRequest } }, required: true },
    },
    responses: {
      202: json(SyncJobResponse, "Job enqueued"),
      400: badRequest,
      401: unauthorized,
      403: forbidden,
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "get",
    path: "/api/v1/tenants/{id}/sync/runs",
    tags: ["sync"],
    summary: "List recent sync runs",
    security: ApiKeySecurity,
    request: { params: TenantParams },
    responses: {
      200: json(SyncRunsResponse, "Latest 50 sync runs"),
      401: unauthorized,
      403: forbidden,
    },
  }),
  stub,
);

docsApp.openapi(
  createRoute({
    method: "get",
    path: "/api/v1/tenants/{id}/sync/runs/{rid}",
    tags: ["sync"],
    summary: "Fetch a sync run",
    security: ApiKeySecurity,
    request: { params: SyncRunParams },
    responses: {
      200: json(SyncRunResponse, "Sync run"),
      401: unauthorized,
      403: forbidden,
      404: notFound,
    },
  }),
  stub,
);

// ---- Security schemes -----------------------------------------------------

docsApp.openAPIRegistry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "X-API-Key",
  description:
    "Tenant API key in the form `<id>_<secret>`. Issued on tenant creation and rotation.",
});

docsApp.openAPIRegistry.registerComponent("securitySchemes", "AdminKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "X-Admin-Key",
  description: "Admin API key for tenant provisioning endpoints.",
});

export function buildOpenApiDocument() {
  return docsApp.getOpenAPIDocument({
    openapi: "3.0.0",
    info: {
      version: "0.1.0",
      title: "zhr-ksef",
      description:
        "Standalone multi-tenant KSeF integration service. Exposes tenant provisioning, invoice sync, invoice workflow transitions, and rendering (XML/HTML/PDF).",
    },
    servers: [{ url: "/", description: "This service" }],
  });
}
