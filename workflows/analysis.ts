import { getWorkflowMetadata, FatalError } from "workflow";
import { getStore } from "../commercial/db/store";
import {
  claimAnalysis,
  assertActive,
  finishAnalysis,
  type AnalysisPlan,
} from "../commercial/analyses/service";
import {
  fetchAnalysis,
  fetchObservations,
  assembleAnalysis,
} from "../server/satellite.js";
import { meterAnalysisProvider } from "../commercial/usage/provider-meter";

async function claim(jobId: string, runId: string) {
  "use step";
  return claimAnalysis(await getStore(), jobId, runId);
}
async function statistics(
  jobId: string,
  runId: string,
  geometry: unknown,
  plan: AnalysisPlan,
  group: string[],
) {
  "use step";
  if (!(await assertActive(await getStore(), jobId, runId)))
    throw new FatalError("Analiz iptal edildi.");
  if (process.env.SENTINEL_PROVIDER !== plan.provider)
    throw new FatalError("Analiz sağlayıcısı değişti.");
  return meterAnalysisProvider(await getStore(), jobId, () =>
    fetchAnalysis(geometry, {
      range: plan.range,
      metricIds: group,
      catalog: false,
      maximumRequests: Math.max(1, Math.floor(128 / plan.groups.length)),
      signal: AbortSignal.timeout(210000),
    }),
  );
}
async function observations(
  jobId: string,
  runId: string,
  geometry: unknown,
  plan: AnalysisPlan,
) {
  "use step";
  if (!(await assertActive(await getStore(), jobId, runId)))
    throw new FatalError("Analiz iptal edildi.");
  if (process.env.SENTINEL_PROVIDER !== plan.provider)
    throw new FatalError("Analiz sağlayıcısı değişti.");
  return meterAnalysisProvider(await getStore(), jobId, () =>
    fetchObservations(geometry, plan.range, {
      signal: AbortSignal.timeout(210000),
    }),
  );
}
statistics.maxRetries = 2;
observations.maxRetries = 2;

async function publish(
  jobId: string,
  runId: string,
  parts: Awaited<ReturnType<typeof fetchAnalysis>>[],
  scenes: unknown[],
) {
  "use step";
  return finishAnalysis(
    await getStore(),
    jobId,
    runId,
    assembleAnalysis(parts, scenes),
  );
}
async function fail(jobId: string, runId: string) {
  "use step";
  await finishAnalysis(
    await getStore(),
    jobId,
    runId,
    null,
    "Uydu işlemi tamamlanamadı; kısmi veri yayımlanmadı. Yeniden deneyebilirsiniz.",
  );
}
export async function analysisWorkflow(jobId: string) {
  "use workflow";
  const runId = getWorkflowMetadata().workflowRunId;
  const job = await claim(jobId, runId);
  if (!job) return;
  try {
    const parts = [];
    for (const group of job.plan.groups)
      parts.push(await statistics(jobId, runId, job.geometry, job.plan, group));
    const scenes = await observations(jobId, runId, job.geometry, job.plan);
    await publish(jobId, runId, parts, scenes);
  } catch {
    await fail(jobId, runId);
  }
}
