import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { imageAnalysis } from "./fields.js";
import { geometryHash } from "./analysis-jobs.js";

test("historical imagery uses its immutable analysis geometry and rejects other owners", () => {
  const previousProvider = process.env.SENTINEL_PROVIDER;
  process.env.SENTINEL_PROVIDER = "cdse";
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE records(id TEXT,user_id TEXT,kind TEXT); CREATE TABLE analyses(field_id TEXT,geometry_hash TEXT,body TEXT); CREATE TABLE analysis_jobs(id TEXT,user_id TEXT,field_id TEXT,state TEXT,result TEXT,snapshot TEXT);",
    );
    const oldGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [32, 39],
          [32.001, 39],
          [32.001, 39.001],
          [32, 39],
        ],
      ],
    };
    const newGeometry = {
      ...oldGeometry,
      coordinates: [
        [
          [33, 39],
          [33.001, 39],
          [33.001, 39.001],
          [33, 39],
        ],
      ],
    };
    const historical = {
      method: "s2-l2a-v3",
      provider: "cdse",
      observations: [],
      scenes: [],
      historyId: "fixture-job",
    };
    db.prepare("INSERT INTO records VALUES(?,?,?)").run(
      "fixture-field",
      "fixture-owner",
      "field",
    );
    db.prepare("INSERT INTO analysis_jobs VALUES(?,?,?,?,?,?)").run(
      "fixture-job",
      "fixture-owner",
      "fixture-field",
      "completed",
      JSON.stringify(historical),
      JSON.stringify({ field: { geometry: oldGeometry } }),
    );
    assert.deepEqual(
      imageAnalysis(db, "fixture-owner", "fixture-field", "fixture-job", {
        geometry: newGeometry,
      }).geometry,
      oldGeometry,
    );
    assert.throws(
      () =>
        imageAnalysis(db, "other-owner", "fixture-field", "fixture-job", {
          geometry: newGeometry,
        }),
      (e) => e.status === 404,
    );
    assert.throws(
      () =>
        imageAnalysis(db, "fixture-owner", "fixture-field", "missing", {
          geometry: newGeometry,
        }),
      (e) => e.status === 404,
    );
    db.prepare("INSERT INTO analyses VALUES(?,?,?)").run(
      "fixture-field",
      geometryHash(oldGeometry),
      JSON.stringify(historical),
    );
    assert.throws(
      () =>
        imageAnalysis(db, "fixture-owner", "fixture-field", null, {
          geometry: newGeometry,
        }),
      (e) => e.status === 422,
    );
    assert.deepEqual(
      imageAnalysis(db, "fixture-owner", "fixture-field", null, {
        geometry: oldGeometry,
      }).geometry,
      oldGeometry,
    );
  } finally {
    db.close();
    if (previousProvider === undefined) delete process.env.SENTINEL_PROVIDER;
    else process.env.SENTINEL_PROVIDER = previousProvider;
  }
});
