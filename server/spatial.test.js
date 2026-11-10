import test from "node:test";
import assert from "node:assert/strict";
import { changeOutliers, compareRasters, containsPoint, metricFrame, pixelIndex, rasterGrid } from "../shared/spatial.js";
import { validateManagementZones } from "./management-zones.js";
import { openSentinelValue, readOpenSentinel, searchOpenSentinel } from "./open-sentinel.js";
import { groupOutlierFootprints, measuredCells, mergeRegion, summarizeFootprints } from "../shared/raster-footprints.js";
import area from "@turf/area";
import { openRasterImage } from "./parcel-satellite.js";
import { PNG } from "pngjs";

const ring = (x, y, size) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
const geometry = { type: "MultiPolygon", coordinates: [
  [ring(27.5, 38.5, 0.001), ring(27.5003, 38.5003, 0.0003)],
  [ring(27.5012, 38.5, 0.0004)],
] };

test("open satellite PNG retains the parcel bounds and transparent masked pixels", () => {
  const raster = { ...rasterGrid(geometry, 20), parcelPixels: 2, unit: "birimsiz" };
  const values = Array(raster.width * raster.height).fill(null);
  values[0] = 0;
  const layer = openRasterImage({ ...raster, values });
  assert.equal(layer.bounds.length, 4);
  assert.equal(layer.validPixels, 1);
  assert.equal(layer.totalPixels, 2);
  assert.equal(layer.legend.min, 0);
  const decoded = PNG.sync.read(layer.image);
  assert.equal(decoded.data[3], 255);
  assert.equal(decoded.data[7], 0);
});

test("local metric coordinates retain holes and separate polygons without oversampling", () => {
  const frame = metricFrame(geometry);
  assert.ok(frame.width > 130 && frame.width < 150);
  const point = [27.5013, 38.5002];
  const roundTrip = frame.coordinate(...frame.local(point));
  assert.ok(roundTrip.every((value, index) => Math.abs(value - point[index]) < 1e-9));
  assert.equal(containsPoint(geometry, point), true);
  assert.equal(containsPoint(geometry, [27.5004, 38.5004]), false);
  assert.equal(containsPoint(geometry, [27.5011, 38.5002]), false);
  const grid = rasterGrid(geometry, 20);
  assert.ok(grid.width <= 96 && grid.height <= 96);
  assert.ok(grid.resolution.every(value => value >= 20));
  assert.ok(pixelIndex(grid, point) >= 0);
  assert.equal(pixelIndex(grid, [28, 39]), -1);
});

test("raster differences retain missing pixels and require matching source and geometry", () => {
  const grid = { ...rasterGrid(geometry, 20), metric: "NDVI", unit: "birimsiz", method: "s2-l2a-spatial-v1",
    geometryHash: "test", provider: "cdse" };
  const current = { ...grid, values: [0.5, null, 0] };
  const before = { ...grid, values: [0.25, 0.4, 0] };
  assert.deepEqual(compareRasters(current, before).values, [0.25, null, 0]);
  assert.equal(compareRasters(current, { ...before, geometryHash: "other" }), null);
  assert.equal(compareRasters(current, { ...before, provider: "sentinelhub" }), null);
  assert.equal(changeOutliers({ ...current, values: [0, 1, 2] }), null);
  const samples = [...Array.from({ length: 20 }, (_, index) => index / 1000), -0.35, null];
  const result = changeOutliers({ ...current, values: samples });
  assert.deepEqual(result.values.filter(Number.isFinite), [-0.35]);
});

test("management zones cannot extend through holes, gaps or another zone", () => {
  const zone = (name, coordinates) => ({ name, rate: 5, geometry: { type: "Polygon", coordinates: [coordinates] } });
  const accepted = zone("inside", ring(27.5, 38.5, 0.0002));
  assert.doesNotThrow(() => validateManagementZones([accepted], geometry));
  assert.throws(() => validateManagementZones([zone("hole", ring(27.5002, 38.5002, 0.0004))], geometry), /dışına/);
  assert.throws(() => validateManagementZones([accepted, accepted], geometry), /örtüşüyor/);
});

test("open Sentinel indices preserve valid zero and reject invalid reflectance or empty ratios", async () => {
  assert.equal(openSentinelValue("NDVI", [0, 0.15]), -1);
  assert.equal(openSentinelValue("NDVI", [0.4, 0.4]), 0);
  assert.equal(openSentinelValue("NDVI", [0, 0]), null);
  assert.equal(openSentinelValue("NDWI", [0.4, null]), null);
  assert.equal(openSentinelValue("NDRE", [0.3, -0.05]), null);
  assert.ok(Math.abs(openSentinelValue("EVI", [0.5, 0.2, 0.1]) - 0.75 / 1.95) < 1e-10);
  assert.ok(Math.abs(openSentinelValue("WDRVI", [0.5, 0.1]) + 1 / 3) < 1e-10);
  await assert.rejects(readOpenSentinel(geometry, "https://example.invalid", "NDVI"), { status: 400 });
  await assert.rejects(searchOpenSentinel(geometry, "2025-13"), { status: 400 });
});

test("valid area and contiguous review regions use clipped ground footprints, including holes", () => {
  const grid = rasterGrid(geometry, 20);
  const raster = { ...grid, values: Array(grid.width * grid.height).fill(0.4), screen: { center: 0 } };
  const cells = measuredCells(raster, geometry);
  const { buckets, covered } = summarizeFootprints(raster, cells, 0, 1);
  assert.ok(Math.abs(covered - area(geometry)) < 0.01);
  assert.equal(buckets.filter(Boolean).length, 1);
  const masked = { ...raster, values: raster.values.map((value, index) => index % 2 === 0 ? value : null) };
  assert.ok(summarizeFootprints(masked, measuredCells(masked, geometry), 0, 1).covered < covered);
  const regions = groupOutlierFootprints(raster, cells);
  assert.equal(regions.length, 2);
  assert.ok(Math.abs(regions.reduce((sum, region) => sum + region.squareMeters, 0) - covered) < 0.01);
  const largest = regions[0];
  assert.ok(Math.abs(area(mergeRegion(largest)) - largest.squareMeters) < 0.01);
  assert.equal(largest.direction, "high");
});
