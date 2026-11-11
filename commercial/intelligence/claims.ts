import { z } from "zod";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { analysisClaims, farmJobs } from "../db/schema";
import type { CommercialDb } from "../db/store";
import { openSentinelMethod, openSentinelProvider } from "../../shared/open-sentinel.js";

const metricIds = ["NDVI", "NDMI", "NDWI", "NDRE"] as const;
const summary = z.object({
  mean: z.number().min(-1.000001).max(1.000001),
  meanCoverage: z.number().min(0.7).max(1),
  observations: z.number().int().positive(),
});
const interval = z.object({ from: z.iso.datetime(), split: z.iso.datetime(), to: z.iso.datetime() });
const analysisSchema = z.object({
  method: z.enum(["s2-l2a-v3", openSentinelMethod]),
  source: z.string().min(1),
  provider: z.enum(["cdse", "sentinelhub", openSentinelProvider]),
  fetchedAt: z.iso.datetime(),
  range: interval,
  comparison: z.record(z.string(), z.unknown()),
  observations: z.unknown().optional(),
}).refine(value => (value.method === openSentinelMethod) === (value.provider === openSentinelProvider));
type ObservationSummary = z.infer<typeof summary>;
export type ClaimEvidence = {
  kind: "observed_change";
  claimMethod: "s2-period-change-v1";
  measurementMethod: string;
  source: string;
  provider: string;
  observedAt: string;
  range: z.infer<typeof interval>;
  previous: ObservationSummary;
  current: ObservationSummary;
  delta: number;
  warnings: ("period_lengths_differ" | "observation_counts_differ" | "limited_observations")[];
  verification: "observational";
  anomaly?: {
    methodVersion: "median-mad-v1";
    score: number;
    direction: "above" | "below";
    baselineCount: number;
    date: string;
  };
};
const comparison = z.object({ current: summary, previous: summary });
const observation = z.object({
  from: z.iso.datetime(),
  stats: z.record(z.string(), z.unknown()),
});
const metricStat = z.object({
  mean: z.number().min(-1.000001).max(1.000001),
  coverage: z.number().min(0.7).max(1),
});

function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const center = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[center]! : (sorted[center - 1]! + sorted[center]!) / 2;
}

function anomalyFromPeriods(input: unknown, range: z.infer<typeof interval>, metric: string): ClaimEvidence["anomaly"] {
  if (!Array.isArray(input) || input.length > 366) return;
  const values = new Map<number, number>();
  const fromTime = Date.parse(range.from), toTime = Date.parse(range.to), splitTime = Date.parse(range.split);
  for (const row of input) {
    const parsed = observation.safeParse(row);
    if (!parsed.success) continue;
    const { from, stats } = parsed.data;
    const value = metricStat.safeParse(stats[metric]);
    const time = Date.parse(from);
    if (value.success && time >= fromTime && time < toTime)
      values.set(time, value.data.mean);
  }
  const baseline = [...values].filter(([time]) => time < splitTime).map(([, value]) => value);
  const recent = [...values].filter(([time]) => time >= splitTime).sort(([a], [b]) => a - b).at(-1);
  if (baseline.length < 5 || !recent) return;
  const center = median(baseline);
  const deviation = median(baseline.map((value) => Math.abs(value - center)));
  if (deviation <= 1e-6) return;
  const score = 0.67448975 * (recent[1] - center) / deviation;
  if (Math.abs(score) < 3.5) return;
  return {
    methodVersion: "median-mad-v1",
    score, direction: score > 0 ? "above" : "below",
    baselineCount: baseline.length, date: new Date(recent[0]).toISOString(),
  };
}

export function deriveClaims(input: unknown) {
  const parsed = analysisSchema.safeParse(input);
  if (!parsed.success) return [];
  const analysis = parsed.data;
  const { range } = analysis;
  const previousDuration = Date.parse(range.split) - Date.parse(range.from);
  const currentDuration = Date.parse(range.to) - Date.parse(range.split);
  if (previousDuration <= 0 || currentDuration <= 0) return [];
  return metricIds.flatMap((metric) => {
    const pair = comparison.safeParse(analysis.comparison[metric]);
    if (!pair.success) return [];
    const { current, previous } = pair.data;
    const anomaly = anomalyFromPeriods(analysis.observations, range, metric);
    const warnings: ClaimEvidence["warnings"] = [];
    if (Math.abs(previousDuration - currentDuration) > 86400000)
      warnings.push("period_lengths_differ");
    if (previous.observations !== current.observations)
      warnings.push("observation_counts_differ");
    if (Math.min(previous.observations, current.observations) < 3)
      warnings.push("limited_observations");
    const evidence: ClaimEvidence = {
      kind: "observed_change",
      claimMethod: "s2-period-change-v1",
      measurementMethod: analysis.method,
      source: analysis.source,
      provider: analysis.provider,
      observedAt: analysis.fetchedAt,
      range,
      previous,
      current,
      delta: current.mean - previous.mean,
      warnings,
      verification: "observational",
      ...(anomaly ? { anomaly } : {}),
    };
    return [{ metric, evidence }];
  });
}

export function fieldClaims(db: CommercialDb, organizationId: string, fieldId: string, limit = 30) {
  return db.select().from(analysisClaims).where(and(
    eq(analysisClaims.organizationId, organizationId),
    eq(analysisClaims.fieldId, fieldId),
  )).orderBy(desc(analysisClaims.createdAt), desc(analysisClaims.id)).limit(limit);
}

export async function publishProjectedClaims(db: CommercialDb, organizationId: string, fieldId: string) {
  const jobs = await db.select({
    id: farmJobs.id, result: farmJobs.result, geometryVersion: farmJobs.geometryHash,
    createdAt: farmJobs.createdAt, finishedAt: farmJobs.finishedAt,
  }).from(farmJobs).where(and(
    eq(farmJobs.organizationId, organizationId), eq(farmJobs.fieldId, fieldId),
    eq(farmJobs.state, "completed"), isNotNull(farmJobs.result),
  )).orderBy(desc(farmJobs.createdAt), desc(farmJobs.id)).limit(20);
  const claims = jobs.flatMap(job => {
    const createdAt = new Date(job.finishedAt || job.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return [];
    return deriveClaims(JSON.parse(job.result!)).map(claim => ({
      ...claim, organizationId, fieldId, analysisId: job.id, geometryVersion: job.geometryVersion,
      id: createHash("sha256").update(`analysis-claim:${organizationId}:${job.id}:${claim.metric}`).digest("hex").slice(0, 32),
      createdAt,
    }));
  });
  if (claims.length) await db.insert(analysisClaims).values(claims).onConflictDoNothing({
    target: [analysisClaims.analysisId, analysisClaims.metric],
  });
}
