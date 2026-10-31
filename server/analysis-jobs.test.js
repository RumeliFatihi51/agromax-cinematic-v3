// All users, parcels and analysis results below are isolated in-memory fixtures.
// No production account, external request or on-disk application data is used.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createAnalysisService } from "./analysis-jobs.js";

const geometry = {
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
const fixtureResult = () => ({
  source: "Explicit isolated fixture",
  fetchedAt: new Date().toISOString(),
  method: "fixture-v1",
  observations: [],
  scenes: [],
});
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE records(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT,body TEXT);CREATE TABLE analyses(field_id TEXT PRIMARY KEY,geometry_hash TEXT,body TEXT);",
  );
  db.prepare("INSERT INTO records VALUES(?,?,?,?)").run(
    "field-a",
    "owner-a",
    "field",
    JSON.stringify({ name: "Isolated fixture parcel", geometry }),
  );
  return db;
}

test("analysis queue persists actual transitions, immutable result and one terminal notification", async () => {
  const db = database();
  let requests = 0;
  const service = createAnalysisService(db, {
    configured: () => true,
    execute: async () => {
      requests++;
      return fixtureResult();
    },
  });
  const first = service.enqueue("owner-a", "field-a");
  assert.equal(first.state, "queued");
  assert.equal(service.enqueue("owner-a", "field-a").id, first.id);
  await service.waitForIdle();
  const done = service.get("owner-a", first.id);
  assert.equal(done.state, "completed");
  assert.ok(done.startedAt);
  assert.ok(done.finishedAt);
  assert.equal(requests, 1);
  assert.equal(done.analysis.historyId, first.id);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM notifications").get().n,
    1,
  );
  assert.equal(
    JSON.parse(db.prepare("SELECT body FROM analyses").get().body).historyId,
    first.id,
  );
  const second = service.enqueue("owner-a", "field-a");
  await service.waitForIdle();
  assert.notEqual(second.id, first.id);
  assert.equal(service.list("owner-a").length, 2);
  assert.equal(service.get("owner-a", first.id).analysis.historyId, first.id);
  db.close();
});
test("jobs, enqueue and result access enforce ownership on the server", async () => {
  const db = database();
  const service = createAnalysisService(db, {
    configured: () => true,
    execute: async () => fixtureResult(),
  });
  assert.throws(
    () => service.enqueue("owner-b", "field-a"),
    (e) => e.status === 404,
  );
  const job = service.enqueue("owner-a", "field-a");
  assert.throws(
    () => service.get("owner-b", job.id),
    (e) => e.status === 404,
  );
  assert.throws(
    () => service.cancel("owner-b", job.id),
    (e) => e.status === 404,
  );
  assert.deepEqual(service.list("owner-b"), []);
  await service.waitForIdle();
  db.close();
});
test("canceling queued work never performs a provider request or creates a result", async () => {
  const db = database();
  let requests = 0;
  const service = createAnalysisService(db, {
    configured: () => true,
    execute: async () => {
      requests++;
      return fixtureResult();
    },
  });
  const job = service.enqueue("owner-a", "field-a");
  service.cancel("owner-a", job.id);
  await service.waitForIdle();
  assert.equal(requests, 0);
  assert.equal(service.get("owner-a", job.id).state, "canceled");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM analyses").get().n, 0);
  db.close();
});
test("canceling running work aborts the request and cannot later publish its result", async () => {
  const db = database();
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const service = createAnalysisService(db, {
    configured: () => true,
    execute: async (_geometry, { signal }) => {
      started();
      await new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
      return fixtureResult();
    },
  });
  const job = service.enqueue("owner-a", "field-a");
  await ready;
  assert.equal(service.get("owner-a", job.id).state, "running");
  service.cancel("owner-a", job.id);
  await service.waitForIdle();
  assert.equal(service.get("owner-a", job.id).state, "canceled");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM analyses").get().n, 0);
  db.close();
});
test("provider failure keeps previous cache and records a real failed event", async () => {
  const db = database();
  db.prepare("INSERT INTO analyses VALUES(?,?,?)").run(
    "field-a",
    "old",
    '{"previous":true}',
  );
  const service = createAnalysisService(db, {
    configured: () => true,
    execute: async () => {
      throw Object.assign(new Error("Isolated provider timeout fixture"), {
        status: 504,
      });
    },
  });
  const job = service.enqueue("owner-a", "field-a");
  await service.waitForIdle();
  assert.equal(service.get("owner-a", job.id).state, "failed");
  assert.deepEqual(
    JSON.parse(db.prepare("SELECT body FROM analyses").get().body),
    { previous: true },
  );
  assert.equal(
    db.prepare("SELECT type FROM notifications").get().type,
    "analysis.failed",
  );
  db.close();
});
test("a changed or deleted parcel cannot receive a stale in-flight analysis", async () => {
  const db = database();
  let finish;
  const service = createAnalysisService(db, {
    configured: () => true,
    execute: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const job = service.enqueue("owner-a", "field-a");
  await new Promise((resolve) => setImmediate(resolve));
  db.prepare("UPDATE records SET body=? WHERE id=?").run(
    JSON.stringify({
      name: "Fixture changed",
      geometry,
      deletedAt: new Date().toISOString(),
    }),
    "field-a",
  );
  finish(fixtureResult());
  await service.waitForIdle();
  assert.equal(service.get("owner-a", job.id).state, "failed");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM analyses").get().n, 0);
  db.close();
});
test("restart recovery marks only truly running jobs interrupted without fabricated success", async () => {
  const db = database();
  const initial = createAnalysisService(db, { configured: () => false });
  await initial.waitForIdle();
  db.prepare(
    "INSERT INTO analysis_jobs(id,user_id,field_id,geometry_hash,snapshot,state,created_at) VALUES(?,?,?,?,?,?,?)",
  ).run(
    "interrupted",
    "owner-a",
    "field-a",
    "hash",
    JSON.stringify({ field: { name: "Fixture" } }),
    "running",
    new Date().toISOString(),
  );
  const restarted = createAnalysisService(db, {
    configured: () => true,
    execute: async () => fixtureResult(),
  });
  await restarted.waitForIdle();
  assert.equal(restarted.get("owner-a", "interrupted").state, "failed");
  assert.equal(
    db.prepare("SELECT type FROM notifications").get().type,
    "analysis.failed",
  );
  db.close();
});
