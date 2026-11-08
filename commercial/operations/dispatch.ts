import { asc, eq } from "drizzle-orm";
import { farmJobs, jobExecutions, reports } from "../db/schema";
import type { CommercialDb } from "../db/store";

export async function dispatchPendingWork(
  db: CommercialDb,
  startAnalysis: (id: string) => Promise<unknown>,
  startReport: (id: string) => Promise<unknown>,
) {
  const [analyses, pendingReports] = await Promise.all([
    db
      .select({ id: farmJobs.id })
      .from(farmJobs)
      .innerJoin(jobExecutions, eq(jobExecutions.jobId, farmJobs.id))
      .where(eq(farmJobs.state, "queued"))
      .orderBy(asc(farmJobs.createdAt), asc(farmJobs.id))
      .limit(20),
    db
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.state, "queued"))
      .orderBy(asc(reports.createdAt), asc(reports.id))
      .limit(20),
  ]);
  let dispatched = 0;
  let failed = 0;
  for (const [jobs, start] of [
    [analyses, startAnalysis],
    [pendingReports, startReport],
  ] as const) {
    for (const { id } of jobs) {
      try {
        await start(id);
        dispatched++;
      } catch {
        failed++;
      }
    }
  }
  return { dispatched, failed };
}
