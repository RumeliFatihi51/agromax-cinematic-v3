import { z } from "zod";
export const fao56Input = z
  .object({
    temperatureC: z.number().finite().min(-50).max(60),
    netRadiationMJm2Day: z.number().finite(),
    groundHeatFluxMJm2Day: z.number().finite(),
    wind2mMs: z.number().finite().min(0).max(100),
    vapourPressureDeficitKpa: z.number().finite().min(0).max(20),
    slopeKpaC: z.number().finite().positive(),
    psychrometricKpaC: z.number().finite().positive(),
  })
  .strict();
export function referenceEt0(input: unknown) {
  const v = fao56Input.parse(input);
  const denominator =
    v.slopeKpaC + v.psychrometricKpaC * (1 + 0.34 * v.wind2mMs);
  const value =
    (0.408 * v.slopeKpaC * (v.netRadiationMJm2Day - v.groundHeatFluxMJm2Day) +
      v.psychrometricKpaC *
        (900 / (v.temperatureC + 273)) *
        v.wind2mMs *
        v.vapourPressureDeficitKpa) /
    denominator;
  if (!Number.isFinite(value) || value < 0)
    throw new Error(
      "Reference ET is outside the supported nonnegative daily range.",
    );
  return {
    value,
    unit: "mm/day",
    methodVersion: "fao56-eq6-v1",
    source: "https://www.fao.org/4/x0490e/x0490e08.htm",
  };
}
export const irrigationInput = fao56Input
  .extend({
    cropCoefficient: z.number().finite().min(0).max(2),
    fieldCapacityFraction: z.number().finite().min(0).max(1),
    wiltingPointFraction: z.number().finite().min(0).max(1),
    rootDepthM: z.number().finite().positive().max(5),
    initialDepletionMm: z.number().finite().min(0),
    effectiveRainMm: z.number().finite().min(0),
    appliedNetIrrigationMm: z.number().finite().min(0),
    capillaryRiseMm: z.number().finite().min(0),
    deepPercolationMm: z.number().finite().min(0),
    depletionFraction: z.number().finite().gt(0).lt(1),
    systemEfficiency: z.number().finite().gt(0).max(1),
    flowM3Hour: z.number().finite().positive(),
  })
  .strict()
  .refine(
    (v) => v.fieldCapacityFraction > v.wiltingPointFraction,
    "Field capacity must exceed wilting point",
  );
export function irrigationBalance(input: unknown, areaM2: number) {
  const v = irrigationInput.parse(input);
  if (!Number.isFinite(areaM2) || areaM2 <= 0)
    throw new Error("Validated field area is required.");
  const weather = Object.fromEntries(
    Object.keys(fao56Input.shape).map((key) => [key, v[key as keyof typeof v]]),
  );
  const et0 = referenceEt0(weather).value,
    availableWaterMm =
      1000 * (v.fieldCapacityFraction - v.wiltingPointFraction) * v.rootDepthM;
  if (v.initialDepletionMm > availableWaterMm)
    throw new Error("Initial depletion exceeds root-zone available water.");
  const potentialCropEtMm = et0 * v.cropCoefficient;
  const rawDepletionMm =
    v.initialDepletionMm +
    potentialCropEtMm -
    v.effectiveRainMm -
    v.appliedNetIrrigationMm -
    v.capillaryRiseMm +
    v.deepPercolationMm;
  if (rawDepletionMm < 0 || rawDepletionMm > availableWaterMm)
    throw new Error(
      "Water balance requires an explicit drainage or crop stress treatment outside this method's range.",
    );
  const readilyAvailableWaterMm = v.depletionFraction * availableWaterMm,
    netDepthMm = rawDepletionMm >= readilyAvailableWaterMm ? rawDepletionMm : 0,
    grossDepthMm = netDepthMm / v.systemEfficiency,
    volumeM3 = (grossDepthMm * areaM2) / 1000;
  return {
    et0MmDay: et0,
    potentialCropEtMm,
    availableWaterMm,
    readilyAvailableWaterMm,
    depletionMm: rawDepletionMm,
    netDepthMm,
    grossDepthMm,
    volumeM3,
    durationHours: volumeM3 / v.flowM3Hour,
    methodVersion: "fao56-single-kc-balance-v1",
    source: "https://www.fao.org/4/x0490e/x0490e0a.htm",
  };
}
export const nutrientInput = z
  .object({
    requiredNutrientKg: z.number().finite().positive(),
    productNutrientPercent: z.number().finite().gt(0).max(100),
    recoveryFraction: z.number().finite().gt(0).max(1),
  })
  .strict();
export function fertilizerMass(input: unknown) {
  const v = nutrientInput.parse(input);
  return {
    productMassKg:
      v.requiredNutrientKg /
      (v.productNutrientPercent / 100) /
      v.recoveryFraction,
    methodVersion: "nutrient-product-mass-v1",
    scope:
      "Unit and composition arithmetic only; the nutrient requirement must be independently validated.",
  };
}
export const protectionInput = z
  .object({
    labelId: z.string().min(1).max(150),
    labelVersion: z.string().min(1).max(100),
    rate: z.number().finite().positive(),
    unit: z.enum(["kg/ha", "L/ha"]),
  })
  .strict();
export function labelQuantity(input: unknown, areaM2: number) {
  const v = protectionInput.parse(input);
  if (!Number.isFinite(areaM2) || areaM2 <= 0)
    throw new Error("Validated field area is required.");
  return {
    amount: (v.rate * areaM2) / 10000,
    unit: v.unit === "kg/ha" ? "kg" : "L",
    labelId: v.labelId,
    labelVersion: v.labelVersion,
    methodVersion: "label-area-quantity-v1",
  };
}
