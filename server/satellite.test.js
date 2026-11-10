import test from "node:test";
import assert from "node:assert/strict";
import {
  comparisonRange,
  summarize,
  statisticsScript,
  imagePixels,
  imageScript,
} from "./satellite.js";
import {
  indices,
  metrics,
  availableMetrics,
  metricAvailability,
} from "../shared/metrics.js";
import { PNG } from "pngjs";
test("calendar comparison respects Istanbul and year rollover", () => {
  const r = comparisonRange(new Date("2026-01-02T12:00:00Z"));
  assert.equal(r.from, "2025-11-30T21:00:00.000Z");
  assert.equal(r.split, "2025-12-31T21:00:00.000Z");
});
const day = (from, mean, sampleCount, noDataCount) => ({
  interval: { from, to: from },
  outputs: {
    NDVI: {
      bands: {
        B0: {
          stats: {
            mean,
            min: mean,
            max: mean,
            stDev: 0,
            sampleCount,
            noDataCount,
          },
        },
      },
    },
  },
});
test("no data does not become zero, and low coverage never enters period means", () => {
  const range = { split: "2026-10-01T00:00:00Z" };
  const result = summarize(
    {
      data: [
        day("2026-09-15", 0.2, 100, 0),
        day("2026-10-15", 0.4, 100, 0),
        day("2026-10-16", 0.9, 100, 90),
        day("2026-10-17", 0, 100, 100),
      ],
    },
    range,
  );
  assert.equal(result.comparison.NDVI.previous.mean, 0.2);
  assert.equal(result.comparison.NDVI.current.mean, 0.4);
  assert.ok(Math.abs(result.comparison.NDVI.delta - 0.2) < 1e-9);
  assert.equal(result.observations[3].stats.NDVI, null);
  assert.equal(result.comparison.NDWI.delta, null);
});
test("the split instant belongs to the second period regardless of ISO precision", () => {
  const result = summarize({
    data: [
      day("2026-09-30T00:00:00Z", 0.2, 10, 0),
      day("2026-10-01T00:00:00.000Z", 0.4, 10, 0),
    ],
  }, { split: "2026-10-01T00:00:00Z" });
  assert.equal(result.comparison.NDVI.previous.mean, 0.2);
  assert.equal(result.comparison.NDVI.current.mean, 0.4);
});
test("every declared metric is emitted and nonfinite calculations are masked", () => {
  const script = statisticsScript("cdse");
  const available = availableMetrics("cdse");
  assert.equal(indices.length, 24);
  assert.equal(metrics.length, 38);
  assert.equal(available.length, 41);
  for (const m of available) assert.ok(script.includes(`out.${m.id}=`));
  for (const id of ["WVP", "CLP", "CLM"])
    assert.ok(!script.includes(`\"${id}\"`));
  assert.ok(metricAvailability("WVP", "cdse"));
  assert.ok(script.includes("valid=values.map"));
  // Synthetic band inputs verify formula wiring; these never enter user records.
  const execute = new Function(
    script.replace("//VERSION=3", "") + ";return evaluatePixel;",
  )();
  const pixel = {
    B01: 0.1,
    B02: 0.1,
    B03: 0.2,
    B04: 0.2,
    B05: 0.25,
    B06: 0.3,
    B07: 0.35,
    B08: 0.6,
    B8A: 0.6,
    B09: 0.1,
    B11: 0.3,
    B12: 0.2,
    AOT: 0.1,
    WVP: 1,
    SCL: 4,
    CLD: 0,
    SNW: 0,
    CLP: 0,
    CLM: 0,
    dataMask: 1,
  };
  const value = execute(pixel);
  assert.equal(value.dataMask[0], 1);
  assert.ok(Math.abs(value.NDVI[0] - 0.5) < 1e-9);
  assert.ok(Math.abs(value.NDMI[0] - 1 / 3) < 1e-9);
  assert.equal(execute({ ...pixel, SCL: 9 }).dataMask[0], 0);
  const partial = execute({ ...pixel, B03: 0 });
  assert.equal(partial.dataMask[0], 1);
  assert.equal(partial.dataMask[available.findIndex((m) => m.id === "GCI")], 0);
  assert.equal(execute({ ...pixel, CLD: 60 }).dataMask[0], 0);
  assert.equal(execute({ ...pixel, B04: undefined }).dataMask[0], 0);
});
test("provider-specific bands preserve commercial WVP support without leaking it into CDSE", () => {
  assert.ok(statisticsScript("sentinelhub").includes("out.WVP="));
  assert.ok(statisticsScript("sentinelhub").includes("s.CLP/255"));
});
test("invalid provider pixel counts and finite statistics cannot become valid measurements", () => {
  assert.throws(
    () =>
      summarize(
        { data: [day("2026-10-15", 0.3, 100, -1)] },
        { split: "2026-10-01" },
      ),
    /piksel/,
  );
  assert.throws(
    () =>
      summarize(
        { data: [day("2026-10-15", NaN, 100, 0)] },
        { split: "2026-10-01" },
      ),
    /istatistik/,
  );
});
test("PNG validation distinguishes a fully masked image from actual visible pixels", () => {
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(0);
  assert.equal(imagePixels(PNG.sync.write(png)).validPixels, 0);
  png.data[3] = 255;
  assert.equal(imagePixels(PNG.sync.write(png)).validPixels, 1);
  assert.throws(() => imagePixels(Buffer.from("not a PNG")), /biçimi/);
});
test("image color scales handle negative and constant measurements without invalid expressions", () => {
  const metric = indices.find((m) => m.id === "NDMI");
  const pixel = { B08: 0.2, B11: 0.6, SCL: 5, CLD: 0, dataMask: 1 };
  for (const scale of [
    { min: -0.9, max: -0.1 },
    { min: -0.5, max: 0.5 },
    { min: -0.5, max: -0.5 },
  ]) {
    const execute = new Function(
      imageScript(metric, scale) + ";return evaluatePixel;",
    )();
    const value = execute(pixel);
    assert.equal(value[3], 1);
    assert.ok(value.every(Number.isFinite));
    assert.deepEqual(execute({ ...pixel, CLD: 80 }), [0, 0, 0, 0]);
  }
});
