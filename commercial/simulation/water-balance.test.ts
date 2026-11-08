import test from "node:test";
import assert from "node:assert/strict";
import { balanceInput, runWaterBalance } from "./water-balance";

const fixture = {
  scope: "trakya-winter-wheat",
  weatherSource: "Explicit synthetic weather fixture",
  soilSource: "Explicit synthetic soil fixture",
  sowingDate: "2026-01-01",
  days: ["2026-01-02", "2026-01-03"].map((date) => ({
    date, et0Mm: 4, effectiveRainMm: 0, cropCoefficient: 1, meanTempC: 10,
  })),
  soil: {
    fieldCapacity: 0.3, wiltingPoint: 0.15, rootDepthM: 1,
    initialDepletionMm: 120, depletionFraction: 0.5,
  },
  systemEfficiency: 0.8,
  baseTemperatureC: 2,
  scenarios: [
    { name: "Baseline", irrigation: [] },
    { name: "Alternative", irrigation: [{ date: "2026-01-02", grossMm: 100 }] },
  ],
  waterCostMinorPerM3: 200,
  maxVolumeM3: 100,
  maxCostMinor: 20_000,
};

test("daily FAO-56 model preserves units, water storage and feasibility constraints", () => {
  const result = runWaterBalance(balanceInput.parse(fixture), 1000);
  const [baseline, alternative] = result.scenarios;
  assert.equal(result.capacityMm, 150);
  assert.equal(baseline!.days[0]!.actualEtMm, 1.6);
  assert.equal(baseline!.stressDays, 2);
  assert.equal(alternative!.days[0]!.depletionMm, 44);
  assert.equal(alternative!.days[1]!.growingDegreeDays, 16);
  assert.equal(alternative!.stressDays, 0);
  assert.ok(alternative!.sensitivity.minDepletionMm < alternative!.finalDepletionMm);
  assert.ok(alternative!.sensitivity.maxDepletionMm > alternative!.finalDepletionMm);
  assert.equal(alternative!.volumeM3, 100);
  assert.equal(alternative!.costMinor, 20_000);
  assert.equal(result.bestFeasible, "Alternative");
  assert.equal(result.yieldPrediction, null);
  const limited = runWaterBalance(balanceInput.parse({ ...fixture, maxVolumeM3: 99 }), 1000);
  assert.equal(limited.bestFeasible, "Baseline");
});

test("invalid days, schedules and initial depletion cannot silently produce a model output", () => {
  assert.equal(balanceInput.safeParse({ ...fixture, days: [] }).success, false);
  const gap = { ...fixture.days[1], date: "2026-01-04" };
  assert.equal(balanceInput.safeParse({ ...fixture, days: [fixture.days[0], gap] }).success, false);
  assert.equal(balanceInput.safeParse({ ...fixture, soil: { ...fixture.soil, initialDepletionMm: 151 } }).success, false);
  const repeated = [...fixture.scenarios[1]!.irrigation, ...fixture.scenarios[1]!.irrigation];
  assert.equal(balanceInput.safeParse({
    ...fixture, scenarios: [fixture.scenarios[0], { name: "Alternative", irrigation: repeated }],
  }).success, false);
});
