import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { fetchRadarStatistics } from "./satellite.js";

test("Sentinel-1 preserves polarization and linear power, excludes masked pixels, and rejects bad counts", async (t) => {
  const env = Object.fromEntries(["SENTINEL_PROVIDER", "SENTINEL_CLIENT_ID", "SENTINEL_CLIENT_SECRET"]
    .map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SENTINEL_PROVIDER: "cdse", SENTINEL_CLIENT_ID: "fixture", SENTINEL_CLIENT_SECRET: "fixture",
  });
  t.after(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const range = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-02T00:00:00.000Z" };
  let masked = 10;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (url.endsWith("/token")) return Response.json({ access_token: "fixture-token" });
    assert.ok(url.endsWith("/statistics"));
    const request = JSON.parse(init.body);
    assert.equal(request.input.data[0].type, "sentinel-1-grd");
    assert.equal(request.input.data[0].dataFilter.orbitDirection, "DESCENDING");
    assert.equal(request.input.data[0].processing.backCoeff, "GAMMA0_TERRAIN");
    const mask = runInNewContext(request.aggregation.evalscript + "\nevaluatePixel({ VV: .3, VH: .1, localIncidenceAngle: 33, shadowMask: 1, dataMask: 1 }).dataMask[0]");
    assert.equal(mask, 0);
    const stats = (mean) => ({ stats: { mean, sampleCount: 100, noDataCount: masked } });
    return Response.json({
      status: "OK",
      data: [{ interval: range, outputs: { default: { bands: {
        B0: stats(0.3), B1: stats(0.1), B2: stats(33),
      } } } }],
    });
  });
  const geometry = { type: "Polygon", coordinates: [[[26.5, 41], [26.501, 41], [26.501, 41.001], [26.5, 41]]] };
  const result = await fetchRadarStatistics(geometry, range, "DESCENDING");
  assert.equal(result.unit, "LINEAR_POWER");
  assert.equal(result.observations[0].vv, 0.3);
  assert.equal(result.observations[0].validPixels, 90);
  masked = 100;
  const empty = await fetchRadarStatistics(geometry, range, "DESCENDING");
  assert.equal(empty.state, "masked");
  assert.equal(empty.observations[0].vv, null);
  masked = 101;
  await assert.rejects(() => fetchRadarStatistics(geometry, range, "DESCENDING"), /piksel kalite/);
});
