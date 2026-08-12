CREATE TYPE "public"."ingest_job_status" AS ENUM('queued', 'processing', 'complete', 'failed');--> statement-breakpoint
CREATE TABLE "analysis_inputs" (
	"analysis_id" uuid PRIMARY KEY NOT NULL,
	"paste_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_inputs_text_not_empty" CHECK (length(btrim("analysis_inputs"."paste_text")) > 0)
);
--> statement-breakpoint
CREATE TABLE "analysis_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"status" "ingest_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"lock_token" uuid,
	"last_error_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_jobs_attempts_nonnegative" CHECK ("analysis_jobs"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_response_status_range" CHECK ("idempotency_records"."response_status" >= 200 and "idempotency_records"."response_status" <= 599)
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"media_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_size_positive" CHECK ("uploads"."size" > 0)
);
--> statement-breakpoint
ALTER TABLE "analysis_inputs" ADD CONSTRAINT "analysis_inputs_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_jobs_analysis_uidx" ON "analysis_jobs" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "analysis_jobs_claim_idx" ON "analysis_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_owner_scope_key_uidx" ON "idempotency_records" USING btree ("owner_id","scope","key_hash");--> statement-breakpoint
CREATE INDEX "idempotency_expiry_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uploads_media_key_uidx" ON "uploads" USING btree ("media_key");--> statement-breakpoint
CREATE INDEX "uploads_owner_created_idx" ON "uploads" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "uploads_expiry_idx" ON "uploads" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analyses_source_media_key_uidx" ON "analyses" USING btree ("source_media_key") WHERE "analyses"."source_media_key" is not null;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_source_shape" CHECK ((
        ("analyses"."source_type" = 'upload' and "analyses"."source_media_key" is not null and "analyses"."source_url" is null) or
        ("analyses"."source_type" = 'url' and "analyses"."source_media_key" is null and "analyses"."source_url" is not null) or
        ("analyses"."source_type" = 'paste' and "analyses"."source_media_key" is null and "analyses"."source_url" is null)
      ));