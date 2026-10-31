import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { sqliteDatabase } from "./database.js";

test("awaited local transaction rollback cannot absorb another concurrent request", async () => {
  const db = sqliteDatabase(new DatabaseSync(":memory:"));
  await db.exec("CREATE TABLE entries(id TEXT PRIMARY KEY)");
  let release, entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const transaction = db.transaction(async (tx) => {
    await tx
      .prepare("INSERT INTO entries VALUES(?)")
      .run("rolled-back fixture");
    entered();
    await gate;
    throw new Error("Explicit rollback fixture");
  });
  const rejected = assert.rejects(transaction, /Explicit rollback/);
  await ready;
  const concurrent = db
    .prepare("INSERT INTO entries VALUES(?)")
    .run("separate request fixture");
  release();
  await rejected;
  await concurrent;
  assert.deepEqual(
    (await db.prepare("SELECT id FROM entries").all()).map((row) => row.id),
    ["separate request fixture"],
  );
  await db.close();
});
