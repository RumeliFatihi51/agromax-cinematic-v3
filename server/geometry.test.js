import test from "node:test";
import assert from "node:assert/strict";
import { validateGeometry } from "../shared/geometry.js";
import { prepareField } from "./fields.js";
const square = {
  type: "Polygon",
  coordinates: [
    [
      [32, 39],
      [32.001, 39],
      [32.001, 39.001],
      [32, 39.001],
      [32, 39],
    ],
  ],
};
test("area is calculated from WGS84 geometry and ignores user area override", () => {
  const r = prepareField({ name: "test", area: 999, geometry: square });
  assert.ok(r.area > 9 && r.area < 10);
  assert.equal(r.areaSource, "geometry");
  assert.notEqual(r.area, 999);
});
test("self-intersections, open rings and nonfinite points are rejected", () => {
  assert.throws(() =>
    validateGeometry({
      type: "Polygon",
      coordinates: [
        [
          [32, 39],
          [32.01, 39.01],
          [32.01, 39],
          [32, 39.01],
          [32, 39],
        ],
      ],
    }),
  );
  assert.throws(() =>
    validateGeometry({
      type: "Polygon",
      coordinates: [
        [
          [32, 39],
          [32.01, 39],
          [32.01, 39.01],
          [32, 39.01],
        ],
      ],
    }),
  );
  assert.throws(() =>
    validateGeometry({
      type: "Polygon",
      coordinates: [
        [
          [32, 39],
          [NaN, 39],
          [32.01, 39.01],
          [32, 39],
        ],
      ],
    }),
  );
});
test("holes reduce area; multipolygons retain disconnected pieces", () => {
  const hole = [
    [32.0002, 39.0002],
    [32.0002, 39.0008],
    [32.0008, 39.0008],
    [32.0008, 39.0002],
    [32.0002, 39.0002],
  ];
  assert.ok(
    validateGeometry({ ...square, coordinates: [square.coordinates[0], hole] })
      .area < validateGeometry(square).area,
  );
  const second = square.coordinates.map((r) =>
    r.map(([x, y]) => [x + 0.01, y]),
  );
  assert.ok(
    validateGeometry({
      type: "MultiPolygon",
      coordinates: [square.coordinates, second],
    }).area > 18,
  );
});
test("existing manual fields can migrate to drawn geometry", () => {
  const r = prepareField(
    { geometry: square },
    { name: "Existing", area: 15, crop: "Wheat" },
  );
  assert.equal(r.name, "Existing");
  assert.equal(r.crop, "Wheat");
  assert.equal(r.areaSource, "geometry");
});
