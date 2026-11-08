CREATE TABLE "analysis_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"field_id" text NOT NULL,
	"analysis_id" text NOT NULL,
	"metric" text NOT NULL,
	"geometry_version" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_claims" ADD CONSTRAINT "analysis_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_claims" ADD CONSTRAINT "analysis_claims_field_id_farm_records_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."farm_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_claims" ADD CONSTRAINT "analysis_claims_analysis_id_farm_analysis_jobs_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."farm_analysis_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_claim_metric_idx" ON "analysis_claims" USING btree ("analysis_id","metric");--> statement-breakpoint
CREATE INDEX "analysis_claim_field_idx" ON "analysis_claims" USING btree ("organization_id","field_id","created_at");