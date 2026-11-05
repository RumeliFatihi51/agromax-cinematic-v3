import test from "node:test";
import assert from "node:assert/strict";
import {
  referenceEt0,
  irrigationBalance,
  fertilizerMass,
  labelQuantity,
} from "./engine";
// Independent published reference, FAO-56 chapter 4 example 17. Not field validation.
const reference = {
  temperatureC: 30.2,
  netRadiationMJm2Day: 14.33,
  groundHeatFluxMJm2Day: 0.14,
  wind2mMs: 2,
  vapourPressureDeficitKpa: 1.57,
  slopeKpaC: 0.246,
  psychrometricKpaC: 0.0674,
};
test("FAO-56 equation 6 matches the published Bangkok reference; missing inputs never become zero", () => {
  assert.ok(Math.abs(referenceEt0(reference).value - 5.72) < 0.03);
  assert.throws(() => referenceEt0({ ...reference, wind2mMs: null }));
  assert.throws(() => referenceEt0({ ...reference, netRadiationMJm2Day: NaN }));
});
test("water depth, volume and runtime conserve units; unsupported soil/stress conditions fail explicitly", () => {
  const input = {
    ...reference,
    cropCoefficient: 1,
    fieldCapacityFraction: 0.3,
    wiltingPointFraction: 0.15,
    rootDepthM: 1,
    initialDepletionMm: 90,
    effectiveRainMm: 0,
    appliedNetIrrigationMm: 0,
    capillaryRiseMm: 0,
    deepPercolationMm: 0,
    depletionFraction: 0.5,
    systemEfficiency: 0.8,
    flowM3Hour: 20,
  };
  const result = irrigationBalance(input, 10000);
  assert.equal(result.availableWaterMm, 150);
  assert.equal(result.volumeM3, result.grossDepthMm * 10);
  assert.equal(result.durationHours, result.volumeM3 / 20);
  assert.throws(() =>
    irrigationBalance({ ...input, initialDepletionMm: 151 }, 10000),
  );
  assert.throws(() =>
    irrigationBalance({ ...input, effectiveRainMm: 1000 }, 10000),
  );
});
test("composition and verified label arithmetic do not select requirements or products", () => {
  assert.equal(
    fertilizerMass({
      requiredNutrientKg: 10,
      productNutrientPercent: 20,
      recoveryFraction: 1,
    }).productMassKg,
    50,
  );
  assert.equal(
    labelQuantity(
      {
        labelId: "EXPLICIT TEST",
        labelVersion: "fixture",
        rate: 2,
        unit: "L/ha",
      },
      2500,
    ).amount,
    0.5,
  );
  assert.throws(() =>
    fertilizerMass({
      requiredNutrientKg: 10,
      productNutrientPercent: 0,
      recoveryFraction: 1,
    }),
  );
});
