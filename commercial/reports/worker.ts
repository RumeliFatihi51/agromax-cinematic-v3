import { and, eq } from "drizzle-orm";
import type { Store, CommercialDb } from "../db/store";
import { reports } from "../db/schema";
import { renderReport } from "./pdf";
import type { ReportSnapshot } from "./service";
import { contentHash, type PrivateObjects } from "../files/private-store";
import { settleUsage } from "../usage/service";

export async function processReport(
  store: Store,
  objects: PrivateObjects,
  id: string,
  runId: string,
  font?: Uint8Array,
) {
  const { db } = store;
  const row = await db.transaction(async (tx) => {
    const [report] = await tx
      .select()
      .from(reports)
      .where(eq(reports.id, id))
      .for("update");
    if (
      !report ||
      !["queued", "running"].includes(report.state) ||
      (report.runId && report.runId !== runId)
    )
      return null;
    await tx
      .update(reports)
      .set({ runId, state: "running" })
      .where(eq(reports.id, id));
    return report;
  });
  if (!row) return;
  const bytes = await renderReport(row.snapshot as unknown as ReportSnapshot, {
    font,
  });
  const key = `organizations/${row.organizationId}/reports/${id}.pdf`;
  await objects.put(key, bytes, "application/pdf");
  await db.transaction(async (tx) => {
    const [completed] = await tx
      .update(reports)
      .set({
        state: "completed",
        objectKey: key,
        sha256: contentHash(bytes),
        completedAt: new Date(),
        error: null,
      })
      .where(
        and(
          eq(reports.id, id),
          eq(reports.state, "running"),
          eq(reports.runId, runId),
        ),
      )
      .returning();
    if (completed?.reservationId)
      await settleUsage(
        tx as unknown as CommercialDb,
        row.organizationId,
        completed.reservationId,
        "consumed",
      );
  });
}
