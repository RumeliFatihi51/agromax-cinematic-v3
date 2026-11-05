CREATE TABLE "observation_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"organization_id" text NOT NULL,
	"field_id" text NOT NULL,
	"geometry_version" text NOT NULL,
	"body" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "observation_cache" ADD CONSTRAINT "observation_cache_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_cache" ADD CONSTRAINT "observation_cache_field_id_farm_records_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."farm_records"("id") ON DELETE no action ON UPDATE no action;