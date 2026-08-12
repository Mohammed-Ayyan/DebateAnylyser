CREATE TYPE "public"."claim_type" AS ENUM('factual', 'value', 'policy', 'causal');--> statement-breakpoint
CREATE TABLE "finding_claim" (
	"finding_id" uuid PRIMARY KEY NOT NULL,
	"claim_type" "claim_type" NOT NULL,
	"check_worthy" boolean NOT NULL,
	"speaker_id" uuid
);
--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN "stage" "pipeline_stage" DEFAULT 'S1' NOT NULL;--> statement-breakpoint
UPDATE "analysis_jobs" AS job
SET "stage" = 'S2',
    "status" = 'queued',
    "attempts" = 0,
    "available_at" = now(),
    "locked_at" = NULL,
    "lock_token" = NULL,
    "last_error_class" = NULL,
    "updated_at" = now()
FROM "analyses" AS analysis
WHERE job."analysis_id" = analysis."id"
  AND job."status" = 'complete'
  AND analysis."status" = 'analyzing'
  AND EXISTS (
    SELECT 1 FROM "transcripts" AS transcript WHERE transcript."analysis_id" = analysis."id"
  );--> statement-breakpoint
ALTER TABLE "finding_claim" ADD CONSTRAINT "finding_claim_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_claim" ADD CONSTRAINT "finding_claim_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finding_claim_check_worthy_idx" ON "finding_claim" USING btree ("check_worthy");--> statement-breakpoint
CREATE INDEX "finding_claim_speaker_idx" ON "finding_claim" USING btree ("speaker_id");