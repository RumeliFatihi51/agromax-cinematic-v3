import test from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { createStore } from "../db/store";
import {
  user,
  farmRecords,
  subscriptions,
  farmJobs,
  farmAnalyses,
  farmNotifications,
  usageReservations,
} from "../db/schema";
import { createOrganization } from "../organizations/service";
import {
  queueAnalysis,
  claimAnalysis,
  assertActive,
  finishAnalysis,
  releaseCanceledUsage,
  cancelAnalysis,
} from "./service";
import { geometryHash } from "../../server/analysis-jobs.js";
test("duplicate workflows, retry delivery, changed geometry and canceled jobs settle quota at most once", async () => {
  const store = await createStore({ migrate: true });
  const before = {
    provider: process.env.SENTINEL_PROVIDER,
    id: process.env.SENTINEL_CLIENT_ID,
    secret: process.env.SENTINEL_CLIENT_SECRET,
  };
  process.env.SENTINEL_PROVIDER = "cdse";
  process.env.SENTINEL_CLIENT_ID = "explicit-test-only";
  process.env.SENTINEL_CLIENT_SECRET = "explicit-test-only";
  try {
    const actor = {
      id: "durability-fixture",
      name: "Isolated durability fixture",
      email: "durability@example.invalid",
      emailVerified: true,
    };
    await store.db.insert(user).values(actor);
    const org = await createOrganization(store.db, actor, {
      name: "Isolated fixture",
    });
    await store.db.insert(subscriptions).values({
      organizationId: org.id,
      state: "active",
      periodEnd: new Date("2099-01-01T00:00:00Z"),
      limits: { analysis: 3 },
    });
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [27, 38],
          [27.01, 38],
          [27.01, 38.01],
          [27, 38],
        ],
      ],
    };
    await store.db.insert(farmRecords).values({
      id: "fixture-field",
      organizationId: org.id,
      kind: "field",
      body: JSON.stringify({ name: "Fixture", geometry }),
    });
    const id = await queueAnalysis(store.db, org.id, "fixture-field", true);
    assert.equal(
      await queueAnalysis(store.db, org.id, "fixture-field", true),
      id,
    );
    assert.equal((await store.db.select().from(usageReservations)).length, 1);
    assert.ok(await claimAnalysis(store, id, "winner-run"));
    assert.equal(await claimAnalysis(store, id, "duplicate-run"), null);
    assert.equal(await assertActive(store, id, "winner-run"), true);
    await finishAnalysis(store, id, "duplicate-run", {
      source: "must-not-publish",
    });
    assert.equal(
      (await store.db.select().from(farmJobs).where(eq(farmJobs.id, id)))[0]!
        .state,
      "running",
    );
    const result = {
      source: "EXPLICIT TEST FIXTURE",
      method: "fixture-v1",
      observations: [],
      scenes: [],
      fetchedAt: new Date().toISOString(),
    };
    await finishAnalysis(store, id, "winner-run", result);
    await finishAnalysis(store, id, "winner-run", result);
    assert.equal((await store.db.select().from(farmNotifications)).length, 1);
    assert.equal(
      (await store.db.select().from(usageReservations))[0]!.state,
      "consumed",
    );
    const next = await queueAnalysis(store.db, org.id, "fixture-field", true);
    await claimAnalysis(store, next, "changed-run");
    await store.db
      .update(farmRecords)
      .set({
        body: JSON.stringify({
          geometry: { type: "Polygon", coordinates: [] },
        }),
      })
      .where(eq(farmRecords.id, "fixture-field"));
    await finishAnalysis(store, next, "changed-run", result);
    assert.equal(
      (await store.db.select().from(farmJobs).where(eq(farmJobs.id, next)))[0]!
        .state,
      "failed",
    );
    assert.equal(
      (
        await store.db
          .select()
          .from(usageReservations)
          .where(eq(usageReservations.idempotencyKey, `analysis:${next}`))
      )[0]!.state,
      "released",
    );
    await store.db
      .update(farmRecords)
      .set({ body: JSON.stringify({ geometry }) })
      .where(eq(farmRecords.id, "fixture-field"));
    const custom = await queueAnalysis(
      store.db,
      org.id,
      "fixture-field",
      true,
      { start: "2026-09-01", split: "2026-10-01", end: "2026-10-20" },
    );
    await assert.rejects(
      () => queueAnalysis(store.db, org.id, "fixture-field", true),
      /farklı bir dönem/,
    );
    await claimAnalysis(store, custom, "custom-run");
    await finishAnalysis(store, custom, "custom-run", result);
    const [calendarCache] = await store.db
      .select()
      .from(farmAnalyses)
      .where(eq(farmAnalyses.fieldId, "fixture-field"));
    assert.equal(JSON.parse(calendarCache!.body).historyId, id);
    await store.db
      .update(farmRecords)
      .set({ body: JSON.stringify({ geometry }) })
      .where(eq(farmRecords.id, "fixture-field"));
    const canceled = await queueAnalysis(
      store.db,
      org.id,
      "fixture-field",
      true,
    );
    await cancelAnalysis(store.db, org.id, canceled, actor.id);
    await cancelAnalysis(store.db, org.id, canceled, actor.id);
    assert.equal(await claimAnalysis(store, canceled, "late-run"), null);
    assert.equal(
      (
        await store.db
          .select()
          .from(usageReservations)
          .where(eq(usageReservations.idempotencyKey, `analysis:${canceled}`))
      )[0]!.state,
      "released",
    );
  } finally {
    for (const [name, value] of [
      ["SENTINEL_PROVIDER", before.provider],
      ["SENTINEL_CLIENT_ID", before.id],
      ["SENTINEL_CLIENT_SECRET", before.secret],
    ]) {
      if (value === undefined) delete process.env[name!];
      else process.env[name!] = value;
    }
    await store.close();
  }
});
