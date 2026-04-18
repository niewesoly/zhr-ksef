CREATE TYPE "public"."invoice_status" AS ENUM('synced', 'pending', 'unassigned', 'assigned', 'imported', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."ksef_env" AS ENUM('production', 'test', 'demo');--> statement-breakpoint
CREATE TYPE "public"."sync_mode" AS ENUM('incremental', 'range');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'ok', 'error');--> statement-breakpoint
CREATE TABLE "invoice_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"from_status" "invoice_status",
	"to_status" "invoice_status" NOT NULL,
	"actor" varchar(200),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ksef_number" varchar(100) NOT NULL,
	"invoice_number" varchar(100),
	"issue_date" date,
	"seller_nip" varchar(20),
	"seller_name" varchar(500),
	"buyer_nip" varchar(20),
	"buyer_name" varchar(500),
	"net_amount" numeric(14, 2),
	"gross_amount" numeric(14, 2),
	"currency" varchar(3),
	"invoice_xml" text,
	"parsed_data" jsonb,
	"schema_version" varchar(20),
	"status" "invoice_status" DEFAULT 'synced' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"mode" "sync_mode" DEFAULT 'incremental' NOT NULL,
	"date_from" date,
	"date_to" date,
	"invoices_synced" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"api_key_id" varchar(32) NOT NULL,
	"api_key_hash" varchar(120) NOT NULL,
	"api_key_id_prev" varchar(32),
	"api_key_hash_prev" varchar(120),
	"api_key_rotated_at" timestamp with time zone,
	"dek_enc" "bytea" NOT NULL,
	"cert_pem_enc" "bytea",
	"key_pem_enc" "bytea",
	"key_passphrase_enc" "bytea",
	"cert_not_after" timestamp with time zone,
	"nip" varchar(10) NOT NULL,
	"api_url" "ksef_env" DEFAULT 'test' NOT NULL,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"sync_cron" varchar(100),
	"last_hwm_date" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" varchar(20),
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_events" ADD CONSTRAINT "invoice_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_events" ADD CONSTRAINT "invoice_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_events_invoice_id_idx" ON "invoice_events" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_events_tenant_created_at_idx" ON "invoice_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_tenant_ksef_number_idx" ON "invoices" USING btree ("tenant_id","ksef_number");--> statement-breakpoint
CREATE INDEX "invoices_tenant_status_idx" ON "invoices" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "invoices_tenant_issue_date_idx" ON "invoices" USING btree ("tenant_id","issue_date");--> statement-breakpoint
CREATE INDEX "sync_runs_tenant_started_at_idx" ON "sync_runs" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_api_key_id_idx" ON "tenants" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "tenants_api_key_id_prev_idx" ON "tenants" USING btree ("api_key_id_prev");