import test from "node:test";
import assert from "node:assert/strict";
import { searchLandsat } from "./landsat";
import { landsatPixel } from "./landsat-raster";

test("Landsat QA excludes clouds, shadows, fill and saturation before USGS scaling", () => {
  const surface = landsatPixel(0, 0, 18_639, 28_639);
  assert.ok(surface && typeof surface.red === "number");
  assert.ok(Math.abs(surface.red - 0.3125725) < 1e-10);
  assert.ok(surface.ndvi && surface.ndvi > 0 && surface.ndvi < 1);
  assert.equal(landsatPixel(1 << 3, 0, 18_639, 28_639), null);
  assert.equal(landsatPixel(1 << 4, 0, 18_639, 28_639), null);
  assert.equal(landsatPixel(0, 1, 18_639, 28_639), null);
  assert.equal(landsatPixel(0, 0, 0), null);
  assert.deepEqual(landsatPixel(0, 0, 44947), { surfaceTemperatureK: 44947 * 0.00341802 + 149 });
});

test("USGS discovery preserves the requested collection, Landsat 8/9 IDs and date range", async () => {
  const range = { from: "2026-10-01T00:00:00Z", to: "2026-10-21T00:00:00Z" };
  const product = "landsat-c2l2-sr";
  const search = await searchLandsat({ type: "Polygon" }, range, "reflectance", async (url, init) => {
    assert.equal(url, "https://landsatlook.usgs.gov/stac-server/search");
    assert.deepEqual(JSON.parse(String(init?.body)).collections, [product]);
    const item = {
      id: "LC08_L2SP_182032_20261020_20261029_02_T1_SR", collection: product,
      properties: { datetime: "2026-10-20T09:00:00Z" }, assets: {},
    };
    return Response.json({ features: [
      item, { ...item, id: "LE07_L2SP_182032_20261020_20261029_02_T1_SR" },
      { ...item, properties: { datetime: "2026-11-20T09:00:00Z" } },
    ], links: [{ rel: "next" }] });
  });
  assert.equal(search.items.length, 1);
  assert.equal(search.truncated, true);
});
