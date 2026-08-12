CREATE TYPE "public"."credibility_factor" AS ENUM('editorial_standards', 'ownership_transparency', 'corrections_practice', 'method_transparency', 'source_attribution');--> statement-breakpoint
CREATE TYPE "public"."credibility_level" AS ENUM('higher', 'mixed', 'lower');--> statement-breakpoint
CREATE TABLE "finding_credibility" (
	"finding_id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_credibility_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"factor" "credibility_factor" NOT NULL,
	"level" "credibility_level" NOT NULL,
	"method_provenance" text NOT NULL,
	"rater_ref" text NOT NULL,
	"contested" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_credibility_ratings_method_not_empty" CHECK (length(btrim("source_credibility_ratings"."method_provenance")) > 0),
	CONSTRAINT "source_credibility_ratings_rater_not_empty" CHECK (length(btrim("source_credibility_ratings"."rater_ref")) > 0),
	CONSTRAINT "source_credibility_ratings_contested" CHECK ("source_credibility_ratings"."contested")
);
--> statement-breakpoint
CREATE TABLE "finding_fallacy" (
	"finding_id" uuid PRIMARY KEY NOT NULL,
	"source_claim_id" uuid NOT NULL,
	"possible_type" text NOT NULL,
	"taxonomy_ref" text NOT NULL,
	"why" text NOT NULL,
	"caveat" text,
	CONSTRAINT "finding_fallacy_distinct_claim" CHECK ("finding_fallacy"."finding_id" <> "finding_fallacy"."source_claim_id"),
	CONSTRAINT "finding_fallacy_possible_framing" CHECK ("finding_fallacy"."possible_type" like 'Possible %'),
	CONSTRAINT "finding_fallacy_taxonomy_not_empty" CHECK (length(btrim("finding_fallacy"."taxonomy_ref")) > 0),
	CONSTRAINT "finding_fallacy_why_not_empty" CHECK (length(btrim("finding_fallacy"."why")) > 0)
);
--> statement-breakpoint
ALTER TABLE "finding_credibility" ADD CONSTRAINT "finding_credibility_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_credibility" ADD CONSTRAINT "finding_credibility_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_credibility_ratings" ADD CONSTRAINT "source_credibility_ratings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_fallacy" ADD CONSTRAINT "finding_fallacy_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_fallacy" ADD CONSTRAINT "finding_fallacy_source_claim_id_findings_id_fk" FOREIGN KEY ("source_claim_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finding_credibility_source_uidx" ON "finding_credibility" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_credibility_ratings_source_idx" ON "source_credibility_ratings" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "finding_fallacy_source_claim_idx" ON "finding_fallacy" USING btree ("source_claim_id");
--> statement-breakpoint

-- Insert newly enabled S5 before an unstarted S6 handoff, or after a completed S4 boundary.
-- Never rewind an analysis whose S6 run has already completed.
UPDATE "analysis_jobs" AS "job"
SET "status" = 'queued',
	"stage" = 'S5',
	"attempts" = 0,
	"available_at" = now(),
	"locked_at" = NULL,
	"lock_token" = NULL,
	"last_error_class" = NULL,
	"updated_at" = now()
FROM "analyses" AS "analysis"
WHERE "job"."analysis_id" = "analysis"."id"
	AND "analysis"."status" IN ('analyzing', 'partial')
	AND (("job"."status" = 'complete' AND "job"."stage" = 'S4')
		OR ("job"."status" = 'queued' AND "job"."stage" = 'S6'))
	AND NOT EXISTS (
		SELECT 1 FROM "analysis_stage_runs" AS "fallacy_run"
		WHERE "fallacy_run"."analysis_id" = "job"."analysis_id"
			AND "fallacy_run"."stage" = 'S5'
	)
	AND NOT EXISTS (
		SELECT 1 FROM "analysis_stage_runs" AS "evidence_run"
		WHERE "evidence_run"."analysis_id" = "job"."analysis_id"
			AND "evidence_run"."stage" = 'S6'
			AND "evidence_run"."status" = 'complete'
	)
	AND (
		SELECT "structure_run"."status"
		FROM "analysis_stage_runs" AS "structure_run"
		WHERE "structure_run"."analysis_id" = "job"."analysis_id"
			AND "structure_run"."stage" = 'S4'
		ORDER BY "structure_run"."attempt" DESC
		LIMIT 1
	) = 'complete';

--> statement-breakpoint

-- Continue analyses that already completed S6 into S7 without rerunning retrieval.
UPDATE "analysis_jobs" AS "job"
SET "status" = 'queued',
	"stage" = 'S7',
	"attempts" = 0,
	"available_at" = now(),
	"locked_at" = NULL,
	"lock_token" = NULL,
	"last_error_class" = NULL,
	"updated_at" = now()
FROM "analyses" AS "analysis"
WHERE "job"."analysis_id" = "analysis"."id"
	AND "job"."status" = 'complete'
	AND "job"."stage" = 'S6'
	AND "analysis"."status" IN ('analyzing', 'partial')
	AND NOT EXISTS (
		SELECT 1 FROM "analysis_stage_runs" AS "credibility_run"
		WHERE "credibility_run"."analysis_id" = "job"."analysis_id"
			AND "credibility_run"."stage" = 'S7'
	)
	AND (
		SELECT "evidence_run"."status"
		FROM "analysis_stage_runs" AS "evidence_run"
		WHERE "evidence_run"."analysis_id" = "job"."analysis_id"
			AND "evidence_run"."stage" = 'S6'
		ORDER BY "evidence_run"."attempt" DESC
		LIMIT 1
	) = 'complete';