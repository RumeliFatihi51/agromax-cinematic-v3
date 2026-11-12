import assert from "node:assert/strict";
import test from "node:test";
import { compareWaterPlans } from "../src/features/spatial/water-comparison.js";

const day = (date, depletionMm, grossIrrigationMm) => ({
  date, depletionMm, grossIrrigationMm, potentialEtMm: 3, actualEtMm: 2, stressFactor: 0.66,
});

test("water comparison aligns dates and recomputes totals only within common model days", () => {
  const a = { days: [day("2026-01-01", 20, 10), day("2026-01-02", 30, 20)], stressDays: 2, volumeM3: 30, costMinor: 6000 };
  const b = { days: [day("2026-01-02", 20, 30), day("2026-01-03", 21, 50)], stressDays: 2, volumeM3: 80, costMinor: 16000 };
  const input = { waterCostMinorPerM3: 200, days: [{ date: "2026-01-02", effectiveRainMm: 4 }] };
  const model = compareWaterPlans(a, b, input, 1000);
  assert.deepEqual(model.totals, [[1, 20, 40], [1, 30, 60]]);
  assert.equal(model.changed, "2026-01-02");
  assert.equal(model.rows[0].rain, 4);
  assert.deepEqual(compareWaterPlans(a, b, {}, undefined).totals, [[1, null, null], [1, null, null]]);
  const separated = compareWaterPlans(a, { ...b, days: b.days.slice(1), costMinor: undefined }, input, 1000);
  assert.deepEqual(separated.rows, []);
  assert.deepEqual(separated.totals, [[2, 30, 60], [2, 80, null]]);
});
