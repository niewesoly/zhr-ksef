-- Row-Level Security: a request missing `SET LOCAL app.tenant_id`
-- sees zero rows. `current_setting(..., true)` returns '' when unset;
-- NULLIF maps that to NULL so the ::uuid cast never throws.
--
-- FORCE makes RLS apply even to the table owner so a misconfigured
-- app role cannot bypass it.
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "invoices"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid);--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "invoice_events"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid);--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "sync_runs"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid);
