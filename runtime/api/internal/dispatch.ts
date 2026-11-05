import { defineEventHandler } from "nitro/h3";
import { eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { start } from "workflow/api";
import { analysisWorkflow } from "../../../workflows/analysis";
import { getStore } from "../../../commercial/db/store";
import { farmJobs } from "../../../commercial/db/schema";
import { reports } from "../../../commercial/db/schema";
import { reportWorkflow } from "../../../workflows/report";
export default defineEventHandler(async ({ req }) => {
  const supplied = Buffer.from(req.headers.get("authorization") || ""),
    expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  if (
    !process.env.CRON_SECRET ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return new Response(null, { status: 401 });
  const store = await getStore();
  const jobs = await store.db
    .select({ id: farmJobs.id })
    .from(farmJobs)
    .where(eq(farmJobs.state, "queued"))
    .limit(20);
  let dispatched = 0;
  for (const job of jobs) {
    await start(analysisWorkflow, [job.id]);
    dispatched++;
  }
  const pendingReports = await store.db
    .select({ id: reports.id })
    .from(reports)
    .where(eq(reports.state, "queued"))
    .limit(20);
  for (const report of pendingReports) {
    await start(reportWorkflow, [report.id]);
    dispatched++;
  }
  return { dispatched };
});
