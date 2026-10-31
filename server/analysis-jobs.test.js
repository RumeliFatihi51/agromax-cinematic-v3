// All users, parcels and analysis results below are isolated in-memory fixtures.
// No production account, external request or on-disk application data is used.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { sqliteDatabase } from "./database.js";
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
  const service = await createAnalysisService(sqliteDatabase(db), {
    configured: () => true,
    execute: async () => {
      requests++;
      return fixtureResult();
    },
  });
  const first = await service.enqueue("owner-a", "field-a");
  assert.equal(first.state, "queued");
  assert.equal((await service.enqueue("owner-a", "field-a")).id, first.id);
  await service.waitForIdle();
  const done = await service.get("owner-a", first.id);
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
  const second = await service.enqueue("owner-a", "field-a");
  await service.waitForIdle();
  assert.notEqual(second.id, first.id);
  assert.equal((await service.list("owner-a")).length, 2);
  assert.equal(
    (await service.get("owner-a", first.id)).analysis.historyId,
    first.id,
  );
  db.close();
});
test("jobs, enqueue and result access enforce ownership on the server", async () => {
  const db = database();
  const service = await createAnalysisService(sqliteDatabase(db), {
    configured: () => true,
    execute: async () => fixtureResult(),
  });
  await assert.rejects(
    async () => await service.enqueue("owner-b", "field-a"),
    (e) => e.status === 404,
  );
  const job = await service.enqueue("owner-a", "field-a");
  await assert.rejects(
    async () => await service.get("owner-b", job.id),
    (e) => e.status === 404,
  );
  await assert.rejects(
    async () => await service.cancel("owner-b", job.id),
    (e) => e.status === 404,
  );
  assert.deepEqual(await service.list("owner-b"), []);
  await service.waitForIdle();
  db.close();
});
test("canceling queued work never performs a provider request or creates a result", async () => {
  const db = database();
  let requests = 0;
  const service = await createAnalysisService(sqliteDatabase(db), {
    configured: () => true,
    execute: async () => {
      requests++;
      return fixtureResult();
    },
  });
  const job = await service.enqueue("owner-a", "field-a");
  await service.cancel("owner-a", job.id);
  await service.waitForIdle();
  assert.equal(requests, 0);
  assert.equal((await service.get("owner-a", job.id)).state, "canceled");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM analyses").get().n, 0);
  db.close();
});
test("canceling running work aborts the request and cannot later publish its result", async () => {
  const db = database();
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const service = await createAnalysisService(sqliteDatabase(db), {
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
  const job = await service.enqueue("owner-a", "field-a");
  service.start();
  await ready;
  assert.equal((await service.get("owner-a", job.id)).state, "running");
  await service.cancel("owner-a", job.id);
  await service.waitForIdle();
  assert.equal((await service.get("owner-a", job.id)).state, "canceled");
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
  const service = await createAnalysisService(sqliteDatabase(db), {
    configured: () => true,
    execute: async () => {
      throw Object.assign(new Error("Isolated provider timeout fixture"), {
        status: 504,
      });
    },
  });
  const job = await service.enqueue("owner-a", "field-a");
  await service.waitForIdle();
  assert.equal((await service.get("owner-a", job.id)).state, "failed");
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
  const service = await createAnalysisService(sqliteDatabase(db), {
    configured: () => true,
    execute: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const job = await service.enqueue("owner-a", "field-a");
  service.start();
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
  assert.equal((await service.get("owner-a", job.id)).state, "failed");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM analyses").get().n, 0);
  db.close();
});
test("restart recovery marks only truly running jobs interrupted without fabricated success", async () => {
  const db = database();
  const initial = await createAnalysisService(sqliteDatabase(db), {
    configured: () => false,
  });
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
  const restarted = await createAnalysisService(sqliteDatabase(db), {
    configured: () => true,
    execute: async () => fixtureResult(),
  });
  await restarted.waitForIdle();
  assert.equal((await restarted.get("owner-a", "interrupted")).state, "failed");
  assert.equal(
    db.prepare("SELECT type FROM notifications").get().type,
    "analysis.failed",
  );
  db.close();
});

test("a second instance preserves a live lease and cross-instance cancellation prevents publishing", async () => {
  const raw = database();
  const db = sqliteDatabase(raw);
  let ready, finish;
  const started = new Promise((resolve) => {
    ready = resolve;
  });
  const first = await createAnalysisService(db, {
    configured: () => true,
    execute: () =>
      new Promise((resolve) => {
        finish = resolve;
        ready();
      }),
  });
  const job = await first.enqueue("owner-a", "field-a");
  first.start();
  await started;
  const second = await createAnalysisService(db, { configured: () => true });
  await second.start();
  assert.equal((await second.get("owner-a", job.id)).state, "running");
  assert.equal((await second.enqueue("owner-a", "field-a")).id, job.id);
  await second.cancel("owner-a", job.id);
  finish(fixtureResult());
  await first.waitForIdle();
  assert.equal((await second.get("owner-a", job.id)).state, "canceled");
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM analyses").get().n, 0);
  assert.equal(
    raw.prepare("SELECT COUNT(*) AS n FROM notifications").get().n,
    1,
  );
  raw.close();
});

test("bounded worker timeout records failure without manufacturing results", async () => {
  const raw = database();
  const service = await createAnalysisService(sqliteDatabase(raw), {
    configured: () => true,
    maxWorkMs: 1200,
    execute: async (_geometry, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  });
  const job = await service.enqueue("owner-a", "field-a");
  await service.waitForIdle();
  assert.equal((await service.get("owner-a", job.id)).state, "failed");
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM analyses").get().n, 0);
  raw.close();
});
