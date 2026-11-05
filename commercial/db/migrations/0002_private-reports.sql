ALTER TABLE "reports" ADD COLUMN "request_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "reservation_id" text;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reservation_id_usage_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."usage_reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_org_request_idx" ON "reports" USING btree ("organization_id","request_key");