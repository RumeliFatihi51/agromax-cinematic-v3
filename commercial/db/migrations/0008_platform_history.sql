CREATE TABLE IF NOT EXISTS "farm_platform_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"field_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "farm_platform_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"record_id" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "farm_platform_records_owner" ON "farm_platform_records" USING btree ("user_id","field_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "farm_platform_revision_unique" ON "farm_platform_revisions" USING btree ("record_id","version");
