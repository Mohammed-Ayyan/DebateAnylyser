CREATE TYPE "public"."evidence_relation" AS ENUM('supports', 'refutes', 'neutral', 'insufficient');--> statement-breakpoint
CREATE TYPE "public"."source_tier" AS ENUM('T1', 'T2', 'T3');--> statement-breakpoint
CREATE TYPE "public"."structure_relation" AS ENUM('supports', 'warrants', 'backs', 'qualifies', 'rebuts');--> statement-breakpoint
CREATE TYPE "public"."toulmin_role" AS ENUM('claim', 'data', 'warrant', 'backing', 'qualifier', 'rebuttal');--> statement-breakpoint
CREATE TABLE "finding_evidence" (
	"finding_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "finding_evidence_finding_id_source_id_pk" PRIMARY KEY("finding_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"url" text NOT NULL,
	"retrieved_snippet" text NOT NULL,
	"provenance" text NOT NULL,
	"tier" "source_tier" NOT NULL,
	"resolves" boolean NOT NULL,
	"supports_relation" "evidence_relation" NOT NULL,
	"licensing_quote_verified" boolean DEFAULT false NOT NULL,
	"verification_signals" jsonb,
	"retrieved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_https_url" CHECK ("sources"."url" ~ '^https://'),
	CONSTRAINT "sources_snippet_not_empty" CHECK (length(btrim("sources"."retrieved_snippet")) > 0),
	CONSTRAINT "sources_provenance_not_empty" CHECK (length(btrim("sources"."provenance")) > 0),
	CONSTRAINT "sources_verified_only" CHECK ("sources"."resolves" and "sources"."licensing_quote_verified" and "sources"."supports_relation" <> 'insufficient')
);
--> statement-breakpoint
CREATE TABLE "finding_structure" (
	"finding_id" uuid PRIMARY KEY NOT NULL,
	"source_claim_id" uuid NOT NULL,
	"role" "toulmin_role" NOT NULL,
	"inferred" boolean DEFAULT false NOT NULL,
	"anchor_role" text NOT NULL,
	CONSTRAINT "finding_structure_distinct_claim" CHECK ("finding_structure"."finding_id" <> "finding_structure"."source_claim_id"),
	CONSTRAINT "finding_structure_anchor_role_allowed" CHECK ("finding_structure"."anchor_role" in ('asserted_content', 'inference_context', 'claim_subject')),
	CONSTRAINT "finding_structure_inference_anchor" CHECK (("finding_structure"."inferred" and "finding_structure"."anchor_role" = 'inference_context') or (not "finding_structure"."inferred" and "finding_structure"."anchor_role" in ('asserted_content', 'claim_subject')))
);
--> statement-breakpoint
CREATE TABLE "structure_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"from_finding_id" uuid NOT NULL,
	"to_finding_id" uuid NOT NULL,
	"relation" "structure_relation" NOT NULL,
	CONSTRAINT "structure_edges_no_self_reference" CHECK ("structure_edges"."from_finding_id" <> "structure_edges"."to_finding_id")
);
--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_structure" ADD CONSTRAINT "finding_structure_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_structure" ADD CONSTRAINT "finding_structure_source_claim_id_findings_id_fk" FOREIGN KEY ("source_claim_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_edges" ADD CONSTRAINT "structure_edges_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_edges" ADD CONSTRAINT "structure_edges_from_finding_id_findings_id_fk" FOREIGN KEY ("from_finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_edges" ADD CONSTRAINT "structure_edges_to_finding_id_findings_id_fk" FOREIGN KEY ("to_finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finding_evidence_source_idx" ON "finding_evidence" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "sources_analysis_retrieved_idx" ON "sources" USING btree ("analysis_id","retrieved_at");--> statement-breakpoint
CREATE INDEX "finding_structure_source_claim_idx" ON "finding_structure" USING btree ("source_claim_id");--> statement-breakpoint
CREATE INDEX "structure_edges_analysis_idx" ON "structure_edges" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "structure_edges_from_idx" ON "structure_edges" USING btree ("from_finding_id");--> statement-breakpoint
CREATE INDEX "structure_edges_to_idx" ON "structure_edges" USING btree ("to_finding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "structure_edges_unique_relation_idx" ON "structure_edges" USING btree ("analysis_id","from_finding_id","to_finding_id","relation");

--> statement-breakpoint
UPDATE "analysis_jobs" AS "job"
SET "status" = 'queued',
	"stage" = 'S6',
	"attempts" = 0,
	"available_at" = now(),
	"locked_at" = NULL,
	"lock_token" = NULL,
	"last_error_class" = NULL,
	"updated_at" = now()
FROM "analyses" AS "analysis"
WHERE "job"."analysis_id" = "analysis"."id"
	AND "job"."status" = 'complete'
	AND "job"."stage" IN ('S2', 'S3', 'S4')
	AND "analysis"."status" IN ('analyzing', 'partial')
	AND NOT EXISTS (
		SELECT 1
		FROM "analysis_stage_runs" AS "evidence_run"
		WHERE "evidence_run"."analysis_id" = "job"."analysis_id"
			AND "evidence_run"."stage" = 'S6'
	)
	AND (
		SELECT "run"."status"
		FROM "analysis_stage_runs" AS "run"
		WHERE "run"."analysis_id" = "job"."analysis_id"
			AND "run"."stage" = "job"."stage"
		ORDER BY "run"."attempt" DESC
		LIMIT 1
	) = 'complete';
