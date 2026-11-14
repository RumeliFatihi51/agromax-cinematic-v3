import test from "node:test";
import assert from "node:assert/strict";
import { nasaAssets, sceneFootprints, parseGibsDates, nasaLayerStatus, searchNasaScenes } from "./nasa-products.js";

test("GIBS reports the named layer's real time dimension and rejects empty responses", () => {
  const layer = '<Layer><ows:Identifier>MODIS_Terra_L3_NDVI_16Day</ows:Identifier><Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-10-16</Default></Dimension></Layer>';
  assert.deepEqual(parseGibsDates(layer), { modis: "2026-10-16" });
  assert.throws(() => parseGibsDates(layer.replace("2026-10-16", "2026-02-30")), /doğrulanamadı/);
});

test("catalog accepts only known HTTPS hosts and explicitly published browse files", () => {
  const url = "https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/sample.tif";
  assert.deepEqual(nasaAssets({ links: [
    { href: url }, { href: url + "?access_token=secret" }, { href: url, inherited: true },
    { href: "https://evil.example/test.tif" }, { href: "https://nisar.asf.earthdatacloud.nasa.gov/sample_LATLON.png" },
  ] }), [{ name:"sample.tif", url, browse:false }, {
    name:"sample_LATLON.png", url:"https://nisar.asf.earthdatacloud.nasa.gov/sample_LATLON.png", browse:true,
  }]);
});

test("NASA requests use fixed providers, a rounded parcel bbox, and a bounded time window", async t => {
  const mock = t.mock.method(globalThis, "fetch", async value => {
    const uri = new URL(value);
    if (uri.hostname === "gibs.earthdata.nasa.gov") return new Response('<Layer><ows:Identifier>IMERG_Precipitation_Rate</ows:Identifier><Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-10-16</Default></Dimension></Layer>');
    assert.equal(uri.hostname, "cmr.earthdata.nasa.gov");
    assert.equal(uri.searchParams.get("collection_concept_id"), "C3622241360-ASF");
    assert.equal(uri.searchParams.get("bounding_box"), "27.51,38.5,27.52,38.51");
    assert.equal(uri.searchParams.get("temporal"), "2026-09-02T00:00:00Z,2026-10-31T23:59:59Z");
    return Response.json({ feed: { entry: [] } });
  });
  assert.equal((await nasaLayerStatus()).latest.gpm, "2026-10-16");
  for (let i=0;i<2;i++) assert.deepEqual((await searchNasaScenes("nisar",[27.511,38.501,27.519,38.505],"2026-10-31")).scenes, []);
  assert.equal(mock.mock.callCount(), 2);
  await assert.rejects(searchNasaScenes("toString",[0,0,1,1],"2026-10-31"), {status:400});
});

test("CMR footprints use longitude first and close the polygon", () => {
  assert.deepEqual(sceneFootprints({ polygons: [["38 27 38 28 39 28 39 27"]] }), [
    { type:"Polygon", coordinates:[[[27,38],[28,38],[28,39],[27,39],[27,38]]] },
  ]);
  assert.deepEqual(sceneFootprints({ polygons: [["38 179 38 -179 39 -179 39 179"]] }), []);
});
