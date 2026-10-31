import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlaces, searchPlaces } from "./places.js";
test("place results preserve longitude/latitude order and returned bounds", () => {
  const [place] = normalizePlaces({
    features: [
      {
        geometry: { type: "Point", coordinates: [32.49, 37.87] },
        properties: {
          osm_type: "R",
          osm_id: 7,
          name: "Konya",
          city: "Konya",
          state: "Konya",
          country: "Türkiye",
          extent: [32.3, 37.6, 32.7, 38],
        },
      },
    ],
  });
  assert.equal(place.lat, 37.87);
  assert.equal(place.lng, 32.49);
  assert.deepEqual(place.bbox, [32.3, 37.6, 32.7, 38]);
  assert.equal(place.address, "Türkiye");
});
test("invalid locations cannot become map markers; invalid bounds are not used", () => {
  const result = normalizePlaces({
    features: [
      {
        geometry: { type: "Point", coordinates: [900, 37] },
        properties: { name: "Bad" },
      },
      {
        geometry: { type: "Point", coordinates: [32, 39] },
        properties: { name: "Valid", extent: [-1, -1, 1, 1] },
      },
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Valid");
  assert.equal(result[0].bbox, null);
  assert.throws(() => normalizePlaces({ error: "unavailable" }));
});
test("empty queries and invalid search centers are rejected before provider access", async () => {
  await assert.rejects(searchPlaces(" "), (e) => e.status === 400);
  await assert.rejects(
    searchPlaces("Konya", { lat: NaN, lng: 35 }),
    (e) => e.status === 400,
  );
});
