CREATE TYPE "public"."source_retrieval_method" AS ENUM('official_api', 'official_captions', 'direct_fetch', 'none');--> statement-breakpoint
ALTER TABLE "analyses" DROP CONSTRAINT "analyses_source_shape";--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "source_retrieval_method" "source_retrieval_method";--> statement-breakpoint
UPDATE "analyses" SET "source_retrieval_method" = 'none' WHERE "source_type" = 'url';--> statement-breakpoint
CREATE UNIQUE INDEX "speakers_transcript_label_uidx" ON "speakers" USING btree ("transcript_id","label");--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_source_shape" CHECK ((
        ("analyses"."source_type" = 'upload' and "analyses"."source_media_key" is not null and "analyses"."source_url" is null and "analyses"."source_retrieval_method" is null) or
        ("analyses"."source_type" = 'url' and "analyses"."source_media_key" is null and "analyses"."source_url" is not null and "analyses"."source_retrieval_method" is not null) or
        ("analyses"."source_type" = 'paste' and "analyses"."source_media_key" is null and "analyses"."source_url" is null and "analyses"."source_retrieval_method" is null)
      ));--> statement-breakpoint
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_label_not_empty" CHECK (length(btrim("speakers"."label")) > 0);--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_idx_nonnegative" CHECK ("transcript_segments"."idx" >= 0);--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_text_not_empty" CHECK (length(btrim("transcript_segments"."text")) > 0);