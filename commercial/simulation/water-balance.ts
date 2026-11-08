import { z } from "zod";
import { localDate } from "../../shared/contracts/commercial";

const depth = z.number().min(0).max(350);
const waterDay = z.object({
  date: localDate,
  et0Mm: z.number().min(0).max(25),
  effectiveRainMm: depth,
  cropCoefficient: z.number().min(0).max(2),
  meanTempC: z.number().min(-50).max(60),
}).strict();
const scenario = z.object({
  name: z.string().trim().min(1).max(80),
  irrigation: z.array(z.object({ date: localDate, grossMm: depth }).strict()).max(366),
}).strict();

export const balanceInput = z.object({
  scope: z.literal("trakya-winter-wheat"),
  weatherSource: z.string().trim().min(1).max(160),
  soilSource: z.string().trim().min(1).max(160),
  sowingDate: localDate,
  days: z.array(waterDay).min(2).max(366),
  soil: z.object({
    fieldCapacity: z.number().gt(0).max(1),
    wiltingPoint: z.number().min(0).lt(1),
    rootDepthM: z.number().gt(0).max(3),
    initialDepletionMm: z.number().min(0).max(3000),
    depletionFraction: z.number().gt(0).lt(1),
  }).strict(),
  systemEfficiency: z.number().gt(0).max(1),
  baseTemperatureC: z.number().min(-10).max(20),
  scenarios: z.array(scenario).min(2).max(12),
  waterCostMinorPerM3: z.number().int().min(0).max(100_000),
  maxVolumeM3: z.number().nonnegative().max(100_000_000),
  maxCostMinor: z.number().int().nonnegative().max(1_000_000_000_000),
}).strict().superRefine((data, ctx) => {
  const issue = (path: string[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const dates = new Set(data.days.map((day) => day.date));
  const first = data.days[0]?.date;
  if (!first) return;
  if (data.sowingDate > first || data.days.some((day, i) =>
    Date.parse(day.date) - Date.parse(first) !== i * 86400000))
    issue(["days"], "Günler ekim tarihinden sonra sıralı ve boşluksuz olmalı.");
  const available = 1000 * (data.soil.fieldCapacity - data.soil.wiltingPoint) * data.soil.rootDepthM;
  if (available <= 0 || data.soil.initialDepletionMm > available)
    issue(["soil"], "Tarla kapasitesi solma noktasını aşmalı ve başlangıç açığı kullanılabilir suyu aşamaz.");
  if (new Set(data.scenarios.map((item) => item.name)).size !== data.scenarios.length)
    issue(["scenarios"], "Senaryo adları farklı olmalı.");
  for (const { irrigation } of data.scenarios) {
    if (irrigation.some(({ date }) => !dates.has(date)) ||
      new Set(irrigation.map(({ date }) => date)).size !== irrigation.length)
      issue(["scenarios"], "Sulama tarihleri çalışma aralığında ve benzersiz olmalı.");
  }
});

export function runWaterBalance(input: z.infer<typeof balanceInput>, areaM2: number) {
  const { soil } = input;
  const capacity = 1000 * (soil.fieldCapacity - soil.wiltingPoint) * soil.rootDepthM;
  const readilyAvailable = soil.depletionFraction * capacity;
  const scenarios = input.scenarios.map(({ name, irrigation }) => {
    const schedule = new Map(irrigation.map(({ date, grossMm }) => [date, grossMm]));
    function simulate(etScale: number) {
      let stored = capacity - soil.initialDepletionMm;
      let growingDegreeDays = 0;
      return input.days.map((day) => {
        const grossIrrigationMm = schedule.get(day.date) ?? 0;
        const netIrrigationMm = grossIrrigationMm * input.systemEfficiency;
        const replenished = stored + netIrrigationMm + day.effectiveRainMm;
        const drainageMm = Math.max(0, replenished - capacity);
        const beforeEt = replenished - drainageMm;
        const stressFactor = Math.min(1, beforeEt / (capacity - readilyAvailable));
        const potentialEtMm = day.et0Mm * day.cropCoefficient * etScale;
        const actualEtMm = Math.min(beforeEt, stressFactor * potentialEtMm);
        stored = beforeEt - actualEtMm;
        growingDegreeDays += Math.max(0, day.meanTempC - input.baseTemperatureC);
        return {
          date: day.date, grossIrrigationMm, netIrrigationMm, drainageMm,
          potentialEtMm, actualEtMm, stressFactor, depletionMm: capacity - stored,
          growingDegreeDays,
        };
      });
    }
    const days = simulate(1);
    const finalDepletionMm = days.at(-1)!.depletionMm;
    const sensitivity = [finalDepletionMm, simulate(0.9).at(-1)!.depletionMm, simulate(1.1).at(-1)!.depletionMm];
    const volumeM3 = (areaM2 / 1000) * days.reduce((sum, day) => sum + day.grossIrrigationMm, 0);
    const costMinor = Math.round(volumeM3 * input.waterCostMinorPerM3);
    return {
      name, days, volumeM3, costMinor,
      stressDays: days.filter((day) => day.actualEtMm + 1e-9 < day.potentialEtMm).length,
      finalDepletionMm,
      sensitivity: { input: "ET0", perturbationPercent: 10, minDepletionMm: Math.min(...sensitivity), maxDepletionMm: Math.max(...sensitivity) },
      feasible: volumeM3 <= input.maxVolumeM3 && costMinor <= input.maxCostMinor,
    };
  });
  const best = scenarios.filter((row) => row.feasible).sort((a, b) =>
    a.stressDays - b.stressDays || a.volumeM3 - b.volumeM3 || a.costMinor - b.costMinor)[0];
  return {
    kind: "model_output" as const,
    calibration: "unvalidated_pilot" as const,
    methodVersion: "fao56-daily-root-zone-v1",
    methodSource: "https://www.fao.org/4/X0490E/x0490e0e.htm",
    capacityMm: capacity,
    readilyAvailableMm: readilyAvailable,
    currency: "TRY",
    scenarios,
    bestFeasible: best?.name ?? null,
    yieldPrediction: null,
  };
}
