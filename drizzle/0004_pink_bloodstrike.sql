CREATE TYPE "public"."support_level" AS ENUM('present', 'weak', 'absent');--> statement-breakpoint
CREATE TABLE "finding_support" (
	"finding_id" uuid PRIMARY KEY NOT NULL,
	"claim_id" uuid NOT NULL,
	"support_level" "support_level",
	"rationale" text NOT NULL,
	"reason_code" text NOT NULL,
	CONSTRAINT "finding_support_distinct_claim" CHECK ("finding_support"."finding_id" <> "finding_support"."claim_id"),
	CONSTRAINT "finding_support_rationale_not_empty" CHECK (length(btrim("finding_support"."rationale")) > 0),
	CONSTRAINT "finding_support_reason_allowed" CHECK ("finding_support"."reason_code" in ('explicit_support', 'limited_support', 'no_support_found', 'speaker_unattributed', 'attribution_uncertain', 'context_incomplete', 'model_uncertain'))
);
--> statement-breakpoint
ALTER TABLE "finding_support" ADD CONSTRAINT "finding_support_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_support" ADD CONSTRAINT "finding_support_claim_id_findings_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finding_support_claim_uidx" ON "finding_support" USING btree ("claim_id");

--> statement-breakpoint
UPDATE "analysis_jobs" AS "job"
SET "status" = 'queued',
	"stage" = 'S3',
	"attempts" = 0,
	"available_at" = now(),
	"locked_at" = NULL,
	"lock_token" = NULL,
	"last_error_class" = NULL,
	"updated_at" = now()
FROM "analyses" AS "analysis"
WHERE "job"."analysis_id" = "analysis"."id"
	AND "job"."status" = 'complete'
	AND "job"."stage" = 'S2'
	AND "analysis"."status" = 'analyzing'
	AND (
		SELECT "run"."status"
		FROM "analysis_stage_runs" AS "run"
		WHERE "run"."analysis_id" = "job"."analysis_id"
			AND "run"."stage" = 'S2'
		ORDER BY "run"."attempt" DESC
		LIMIT 1
	) = 'complete';