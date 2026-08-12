CREATE TYPE "public"."annotation_visibility" AS ENUM('shown', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."contest_state" AS ENUM('open', 'acknowledged', 'resolved_valid', 'resolved_invalid');--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"finding_id" uuid,
	"author_id" uuid NOT NULL,
	"note" text,
	"visibility" "annotation_visibility" DEFAULT 'shown' NOT NULL,
	"highlighted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annotations_note_valid" CHECK ("annotations"."note" is null or (length(btrim("annotations"."note")) between 1 and 4000)),
	CONSTRAINT "annotations_meaningful" CHECK ("annotations"."note" is not null or "annotations"."visibility" = 'hidden' or "annotations"."highlighted" = true)
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text,
	"state" "contest_state" DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contests_reason_valid" CHECK ("contests"."reason" is null or (length(btrim("contests"."reason")) between 1 and 2000)),
	CONSTRAINT "contests_resolution_shape" CHECK ((
        ("contests"."state" in ('open', 'acknowledged') and "contests"."resolution" is null and "contests"."resolved_at" is null) or
        ("contests"."state" in ('resolved_valid', 'resolved_invalid') and "contests"."resolution" is not null and length(btrim("contests"."resolution")) between 1 and 4000 and "contests"."resolved_at" is not null)
      ))
);
--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotations_analysis_created_idx" ON "annotations" USING btree ("analysis_id","created_at");--> statement-breakpoint
CREATE INDEX "annotations_finding_idx" ON "annotations" USING btree ("finding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "annotations_finding_author_uidx" ON "annotations" USING btree ("finding_id","author_id");--> statement-breakpoint
CREATE INDEX "contests_finding_created_idx" ON "contests" USING btree ("finding_id","created_at");--> statement-breakpoint
CREATE INDEX "contests_user_created_idx" ON "contests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contests_active_finding_user_uidx" ON "contests" USING btree ("finding_id","user_id") WHERE "contests"."state" in ('open', 'acknowledged');