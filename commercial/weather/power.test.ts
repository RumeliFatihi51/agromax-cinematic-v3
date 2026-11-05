import test from "node:test";
import assert from "node:assert/strict";
import { normalizePower, powerParameters, fetchPower } from "./power";
const point = { lat: 38, lng: 27 },
  range = { start: "2026-10-01", end: "2026-10-02" };
function fixture() {
  return {
    header: {
      fill_value: -999,
      time_standard: "LST",
      start: "20261001",
      end: "20261002",
      sources: ["EXPLICIT TEST MODEL"],
      api: { version: "fixture" },
    },
    geometry: { coordinates: [27, 38, 0] },
    parameters: Object.fromEntries(
      Object.entries(powerParameters).map(([id, p]) => [
        id,
        { units: String(p.unit), longname: "Explicit fixture" },
      ]),
    ),
    properties: {
      parameter: Object.fromEntries(
        Object.keys(powerParameters).map((id) => [
          id,
          {
            "20261001": id === "PRECTOTCORR" ? 0 : id === "PS" ? 100 : 10,
            "20261002": -999,
          },
        ]),
      ),
    },
  };
}
test("POWER preserves true zero, fill values, daily LST and actual parameter units", () => {
  const data = normalizePower(fixture(), point, range);
  assert.equal(data.observations[0]!.values.PRECTOTCORR, 0);
  assert.equal(data.observations[1]!.values.PRECTOTCORR, null);
  assert.equal(data.kind, "model_estimate");
  assert.equal(data.timeStandard, "LST");
  assert.equal(data.observations.length, 2);
});
test("wrong coordinates, units, dates and impossible physical values cannot become weather", () => {
  const a = fixture();
  a.geometry.coordinates[0] = 28;
  assert.throws(() => normalizePower(a, point, range));
  const b = fixture();
  b.parameters.PS!.units = "Pa";
  assert.throws(() => normalizePower(b, point, range));
  const c = fixture();
  c.properties.parameter.RH2M!["20261001"] = 101;
  assert.throws(() => normalizePower(c, point, range));
  assert.throws(() =>
    normalizePower(fixture(), point, { ...range, end: "2026-10-03" }),
  );
});
test("provider throttling and future dates never return invented observations", async () => {
  await assert.rejects(
    () =>
      fetchPower(point, range, async () => new Response("", { status: 429 })),
    /429/,
  );
  let calls = 0;
  await assert.rejects(() =>
    fetchPower(point, { start: "2099-01-01", end: "2099-01-02" }, async () => {
      calls++;
      return new Response();
    }),
  );
  assert.equal(calls, 0);
});
