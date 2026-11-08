CREATE TABLE "analysis_requests" (
	"organization_id" text NOT NULL,
	"request_key" text NOT NULL,
	"job_id" text NOT NULL,
	"selection" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_job_id_farm_analysis_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."farm_analysis_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_requests_org_key_idx" ON "analysis_requests" USING btree ("organization_id","request_key");