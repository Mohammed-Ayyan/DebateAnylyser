CREATE TYPE "public"."data_event_type" AS ENUM('analysis_deletion_requested', 'analysis_deleted', 'account_deletion_requested', 'account_deleted', 'retention_updated');--> statement-breakpoint
CREATE TYPE "public"."export_kind" AS ENUM('report_html', 'account_data_json');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('queued', 'processing', 'complete', 'failed', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."operation_job_status" AS ENUM('queued', 'processing', 'complete', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."operation_job_type" AS ENUM('analysis_cleanup', 'account_cleanup', 'report_export', 'account_data_export');--> statement-breakpoint
CREATE TYPE "public"."retention_schedule_status" AS ENUM('scheduled', 'processing', 'complete', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."share_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "data_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"analysis_id" uuid,
	"event_type" "data_event_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"analysis_id" uuid,
	"kind" "export_kind" NOT NULL,
	"status" "export_status" DEFAULT 'queued' NOT NULL,
	"object_key" text,
	"content_type" text,
	"policy_version" text,
	"disclaimer_version" text,
	"limitations_url" text,
	"error_class" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exports_kind_scope" CHECK (("exports"."kind" = 'report_html' and "exports"."analysis_id" is not null) or ("exports"."kind" = 'account_data_json' and "exports"."analysis_id" is null))
);
--> statement-breakpoint
CREATE TABLE "operation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "operation_job_type" NOT NULL,
	"status" "operation_job_status" DEFAULT 'queued' NOT NULL,
	"owner_id" uuid,
	"analysis_id" uuid,
	"dedupe_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"lock_token" uuid,
	"last_error_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_jobs_attempts_nonnegative" CHECK ("operation_jobs"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "retention_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"retention_setting" "retention_setting" NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "retention_schedule_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retention_schedules_bounded" CHECK ("retention_schedules"."retention_setting" <> 'keep')
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "share_status" DEFAULT 'active' NOT NULL,
	"policy_version" text NOT NULL,
	"disclaimer_version" text NOT NULL,
	"limitations_url" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_revocation_shape" CHECK (("shares"."status" = 'active' and "shares"."revoked_at" is null) or ("shares"."status" = 'revoked' and "shares"."revoked_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "data_events" ADD CONSTRAINT "data_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_events" ADD CONSTRAINT "data_events_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_jobs" ADD CONSTRAINT "operation_jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_jobs" ADD CONSTRAINT "operation_jobs_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_schedules" ADD CONSTRAINT "retention_schedules_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_events_owner_created_idx" ON "data_events" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "data_events_analysis_created_idx" ON "data_events" USING btree ("analysis_id","created_at");--> statement-breakpoint
CREATE INDEX "exports_owner_created_idx" ON "exports" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "exports_analysis_status_idx" ON "exports" USING btree ("analysis_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "exports_object_key_uidx" ON "exports" USING btree ("object_key") WHERE "exports"."object_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "operation_jobs_dedupe_key_uidx" ON "operation_jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "operation_jobs_claim_idx" ON "operation_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "operation_jobs_analysis_idx" ON "operation_jobs" USING btree ("analysis_id","status");--> statement-breakpoint
CREATE INDEX "operation_jobs_owner_idx" ON "operation_jobs" USING btree ("owner_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_schedules_analysis_uidx" ON "retention_schedules" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "retention_schedules_claim_idx" ON "retention_schedules" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shares_token_hash_uidx" ON "shares" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "shares_analysis_status_idx" ON "shares" USING btree ("analysis_id","status");

--> statement-breakpoint
INSERT INTO "retention_schedules" (
  "analysis_id",
  "retention_setting",
  "due_at",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "retention_setting",
  "created_at" + CASE
    WHEN "retention_setting" = '30d' THEN interval '30 days'
    ELSE interval '90 days'
  END,
  'scheduled',
  now(),
  now()
FROM "analyses"
WHERE "deleted_at" IS NULL
  AND "retention_setting" IN ('30d', '90d')
ON CONFLICT ("analysis_id") DO NOTHING;
