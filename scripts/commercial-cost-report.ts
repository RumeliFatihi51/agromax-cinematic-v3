import { createStore } from "../commercial/db/store";
import { providerUsage } from "../commercial/db/schema";
import { writeFile, mkdir } from "node:fs/promises";
const store = await createStore({
  url: process.env.AGROMAX_DATABASE_URL,
  dataDir: process.env.AGROMAX_LOCAL_DATA_DIR || "data/commercial-pg",
});
try {
  const rows = await store.db.select().from(providerUsage),
    groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.provider}/${row.operation}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    source: "provider_usage PostgreSQL records",
    operations: [...groups].map(([operation, items]) => {
      const times = items.map((r) => r.durationMs).sort((a, b) => a - b);
      return {
        operation,
        requests: items.reduce((s, r) => s + r.requestCount, 0),
        responseFailures: items.filter(
          (r) => r.httpStatus !== null && r.httpStatus >= 400,
        ).length,
        unknownHttpOutcomes: items.filter((r) => r.httpStatus === null).length,
        p95DurationMs:
          times[Math.max(0, Math.ceil(times.length * 0.95) - 1)] ?? null,
        knownCosts: items
          .filter((r) => r.monetaryCost !== null)
          .map((r) => ({
            amount: r.monetaryCost,
            currency: r.currency,
            rateSource: r.rateSource,
          })),
        unknownCostCount: items.filter((r) => r.monetaryCost === null).length,
      };
    }),
    monthlyCostVerified: false,
    monthly200CustomerWorkloadVerified: false,
  };
  await mkdir("data/measurements", { recursive: true });
  await writeFile(
    "data/measurements/provider-costs.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      path: "data/measurements/provider-costs.json",
      measuredRequests: rows.length,
      monthlyCostVerified: false,
    }),
  );
} finally {
  await store.close();
}
