import { eq } from "drizzle-orm";
import type { Store } from "../db/store";
import { farmJobs, providerUsage } from "../db/schema";
import { uid } from "../organizations/service";
import { withProviderMeter } from "../../server/provider-meter.js";
export async function meterAnalysisProvider<T>(
  store: Store,
  jobId: string,
  work: () => Promise<T>,
): Promise<T> {
  const [job] = await store.db
    .select({ organizationId: farmJobs.organizationId })
    .from(farmJobs)
    .where(eq(farmJobs.id, jobId));
  return withProviderMeter(async (event) => {
    await store.db.insert(providerUsage).values({
      id: uid(),
      organizationId: job?.organizationId,
      jobId,
      provider: process.env.SENTINEL_PROVIDER || "unknown-sentinel-provider",
      ...event,
    });
  }, work);
}
