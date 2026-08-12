CREATE EXTENSION IF NOT EXISTS "citext";--> statement-breakpoint
CREATE TYPE "public"."analysis_status" AS ENUM('queued', 'transcribing', 'analyzing', 'partial', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."confidence_band" AS ENUM('high', 'medium', 'low', 'insufficient');--> statement-breakpoint
CREATE TYPE "public"."confidence_display" AS ENUM('categorical', 'numeric_optin');--> statement-breakpoint
CREATE TYPE "public"."finding_kind" AS ENUM('claim', 'support', 'structure', 'fallacy', 'credibility');--> statement-breakpoint
CREATE TYPE "public"."finding_state" AS ENUM('ok', 'insufficient', 'contested');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10');--> statement-breakpoint
CREATE TYPE "public"."producing_stage" AS ENUM('S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8');--> statement-breakpoint
CREATE TYPE "public"."reading_density" AS ENUM('comfortable', 'low_density');--> statement-breakpoint
CREATE TYPE "public"."retention_setting" AS ENUM('keep', '30d', '90d', 'delete_on_complete');--> statement-breakpoint
CREATE TYPE "public"."rights_check_result" AS ENUM('passed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."analysis_source_type" AS ENUM('upload', 'url', 'paste');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('pending', 'running', 'complete', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."transcript_source" AS ENUM('asr', 'user_supplied');--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"source_type" "analysis_source_type" NOT NULL,
	"source_media_key" text,
	"source_url" text,
	"title" text NOT NULL,
	"status" "analysis_status" DEFAULT 'queued' NOT NULL,
	"rights_check_result" "rights_check_result",
	"rights_block_reason" text,
	"retention_setting" "retention_setting" DEFAULT 'keep' NOT NULL,
	"language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "speakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transcript_id" uuid NOT NULL,
	"label" text NOT NULL,
	"display_name" text,
	"is_named_person" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transcript_id" uuid NOT NULL,
	"speaker_id" uuid,
	"idx" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"asr_conf" real,
	"diar_conf" real,
	"low_conf" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_segments_time_range" CHECK ("transcript_segments"."start_ms" >= 0 and "transcript_segments"."end_ms" >= "transcript_segments"."start_ms"),
	CONSTRAINT "transcript_segments_asr_conf_range" CHECK ("transcript_segments"."asr_conf" is null or ("transcript_segments"."asr_conf" >= 0 and "transcript_segments"."asr_conf" <= 1)),
	CONSTRAINT "transcript_segments_diar_conf_range" CHECK ("transcript_segments"."diar_conf" is null or ("transcript_segments"."diar_conf" >= 0 and "transcript_segments"."diar_conf" <= 1))
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"source" "transcript_source" NOT NULL,
	"language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcripts_analysis_id_unique" UNIQUE("analysis_id")
);
--> statement-breakpoint
CREATE TABLE "finding_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"segment_id" uuid NOT NULL,
	"start_char" integer NOT NULL,
	"end_char" integer NOT NULL,
	CONSTRAINT "finding_spans_valid_range" CHECK ("finding_spans"."start_char" >= 0 and "finding_spans"."end_char" > "finding_spans"."start_char")
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"kind" "finding_kind" NOT NULL,
	"text" text NOT NULL,
	"paraphrase" boolean DEFAULT false NOT NULL,
	"confidence_raw" real,
	"confidence_signals" jsonb,
	"confidence_band" "confidence_band",
	"state" "finding_state" DEFAULT 'ok' NOT NULL,
	"person_involved" boolean DEFAULT false NOT NULL,
	"produced_by_stage" "producing_stage" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "findings_confidence_raw_range" CHECK ("findings"."confidence_raw" is null or ("findings"."confidence_raw" >= 0 and "findings"."confidence_raw" <= 1))
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"confidence_display" "confidence_display" DEFAULT 'categorical' NOT NULL,
	"jargon_plain_language" boolean DEFAULT false NOT NULL,
	"reading_density" "reading_density" DEFAULT 'comfortable' NOT NULL,
	"accessibility_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"auth_provider_ref" text NOT NULL,
	"acceptable_use_accepted_at" timestamp with time zone,
	"acceptable_use_version" text,
	"default_retention_setting" "retention_setting" DEFAULT 'keep' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "analysis_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"sequence" bigint NOT NULL,
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "analysis_events_schema_version_positive" CHECK ("analysis_events"."schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "analysis_stage_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"stage" "pipeline_stage" NOT NULL,
	"status" "stage_status" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stage_runs_attempt_positive" CHECK ("analysis_stage_runs"."attempt" > 0)
);
--> statement-breakpoint
CREATE TABLE "injection_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"segment_id" uuid,
	"signal" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_spans" ADD CONSTRAINT "finding_spans_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_spans" ADD CONSTRAINT "finding_spans_segment_id_transcript_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_events" ADD CONSTRAINT "analysis_events_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_stage_runs" ADD CONSTRAINT "analysis_stage_runs_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injection_flags" ADD CONSTRAINT "injection_flags_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injection_flags" ADD CONSTRAINT "injection_flags_segment_id_transcript_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_owner_created_idx" ON "analyses" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "analyses_owner_status_idx" ON "analyses" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "speakers_transcript_idx" ON "speakers" USING btree ("transcript_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_segments_transcript_idx_uidx" ON "transcript_segments" USING btree ("transcript_id","idx");--> statement-breakpoint
CREATE INDEX "transcript_segments_timeline_idx" ON "transcript_segments" USING btree ("transcript_id","start_ms");--> statement-breakpoint
CREATE INDEX "finding_spans_finding_idx" ON "finding_spans" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "findings_analysis_kind_idx" ON "findings" USING btree ("analysis_id","kind");--> statement-breakpoint
CREATE INDEX "findings_analysis_state_idx" ON "findings" USING btree ("analysis_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_provider_ref_uidx" ON "users" USING btree ("auth_provider_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_events_analysis_sequence_uidx" ON "analysis_events" USING btree ("analysis_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_events_event_id_uidx" ON "analysis_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "analysis_events_replay_idx" ON "analysis_events" USING btree ("analysis_id","sequence","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_runs_analysis_stage_attempt_uidx" ON "analysis_stage_runs" USING btree ("analysis_id","stage","attempt");--> statement-breakpoint
CREATE INDEX "stage_runs_analysis_status_idx" ON "analysis_stage_runs" USING btree ("analysis_id","status");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "enforce_finding_traceability"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'findings' THEN
    target_id := NEW.id;
    IF EXISTS (
      SELECT 1 FROM findings f
      WHERE f.id = target_id AND f.state <> 'insufficient'
    ) AND NOT EXISTS (
      SELECT 1 FROM finding_spans fs WHERE fs.finding_id = target_id
    ) THEN
      RAISE EXCEPTION 'finding % must have a span or be insufficient', target_id
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF TG_OP IN ('DELETE', 'UPDATE') THEN
      target_id := OLD.finding_id;
      IF EXISTS (
        SELECT 1 FROM findings f
        WHERE f.id = target_id AND f.state <> 'insufficient'
      ) AND NOT EXISTS (
        SELECT 1 FROM finding_spans fs WHERE fs.finding_id = target_id
      ) THEN
        RAISE EXCEPTION 'finding % must have a span or be insufficient', target_id
          USING ERRCODE = '23514';
      END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      target_id := NEW.finding_id;
      IF EXISTS (
        SELECT 1 FROM findings f
        WHERE f.id = target_id AND f.state <> 'insufficient'
      ) AND NOT EXISTS (
        SELECT 1 FROM finding_spans fs WHERE fs.finding_id = target_id
      ) THEN
        RAISE EXCEPTION 'finding % must have a span or be insufficient', target_id
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "findings_traceability_constraint"
AFTER INSERT OR UPDATE ON "findings"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_finding_traceability"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "finding_spans_traceability_constraint"
AFTER INSERT OR UPDATE OR DELETE ON "finding_spans"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_finding_traceability"();
