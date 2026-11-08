import { defineEventHandler } from "nitro/h3";
import { timingSafeEqual } from "node:crypto";
import { start } from "workflow/api";
import { analysisWorkflow } from "../../../workflows/analysis";
import { getStore } from "../../../commercial/db/store";
import { dispatchPendingWork } from "../../../commercial/operations/dispatch";
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
  const result = await dispatchPendingWork(
    store.db,
    (id) => start(analysisWorkflow, [id]),
    (id) => start(reportWorkflow, [id]),
  );
  if (result.failed) console.warn("Pending work dispatch failed", result);
  return Response.json(result, { status: result.failed ? 503 : 200 });
});
