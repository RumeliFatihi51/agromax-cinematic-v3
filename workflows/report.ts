import { getWorkflowMetadata } from "workflow";
import { and, eq } from "drizzle-orm";
import { getStore, type CommercialDb } from "../commercial/db/store";
import { reports } from "../commercial/db/schema";
import { privateObjects } from "../commercial/files/private-store";
import { settleUsage } from "../commercial/usage/service";
import { processReport } from "../commercial/reports/worker";
import { useStorage } from "nitro/storage";

export async function generateReport(id: string, runId: string) {
  "use step";
  const font =
    await useStorage("assets:fonts").getItemRaw<Buffer>("Manrope-Report.ttf");
  if (!font) throw new Error("Report font asset is missing.");
  try {
    return await processReport(
      await getStore(),
      privateObjects(),
      id,
      runId,
      font,
    );
  } catch (error) {
    if (process.env.AGROMAX_DEBUG === "true" && !process.env.VERCEL)
      console.error("Report step failed", error);
    throw error;
  }
}
async function failReport(id: string, runId: string) {
  "use step";
  const { db } = await getStore();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(reports)
      .set({
        state: "failed",
        error:
          "PDF üretilemedi; yeni bir rapor isteğiyle tekrar deneyebilirsiniz.",
      })
      .where(
        and(
          eq(reports.id, id),
          eq(reports.runId, runId),
          eq(reports.state, "running"),
        ),
      )
      .returning();
    if (row?.reservationId)
      await settleUsage(
        tx as unknown as CommercialDb,
        row.organizationId,
        row.reservationId,
        "released",
      );
  });
}
export async function reportWorkflow(id: string) {
  "use workflow";
  const runId = getWorkflowMetadata().workflowRunId;
  try {
    await generateReport(id, runId);
  } catch {
    await failReport(id, runId);
  }
}
