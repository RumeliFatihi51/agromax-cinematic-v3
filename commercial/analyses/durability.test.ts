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
  analysisClaims,
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
import { dispatchPendingWork } from "../operations/dispatch";
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
    const request = { key: "explicit-fixture-request", actorId: actor.id };
    const id = await queueAnalysis(
      store.db, org.id, "fixture-field", true, undefined, request,
    );
    assert.equal(
      await queueAnalysis(store.db, org.id, "fixture-field", true),
      id,
    );
    assert.equal((await store.db.select().from(usageReservations)).length, 1);
    // Imported historical jobs have no executable plan and must not consume the batch.
    await store.db.insert(farmJobs).values({
      id: "legacy-no-plan",
      fieldId: "fixture-field",
      organizationId: org.id,
      geometryHash: geometryHash(geometry),
      snapshot: "{}",
      state: "queued",
      createdAt: "2000-01-01T00:00:00Z",
    });
    const reportStarter = async () => assert.fail("unexpected report");
    assert.deepEqual(
      await dispatchPendingWork(store.db, async () => { throw new Error("delivery interrupted"); }, reportStarter),
      { dispatched: 0, failed: 1 },
    );
    assert.deepEqual(
      await dispatchPendingWork(store.db, async (jobId) => {
        assert.equal(jobId, id);
      }, reportStarter),
      { dispatched: 1, failed: 0 },
    );
    await store.db.delete(farmJobs).where(eq(farmJobs.id, "legacy-no-plan"));
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
      method: "s2-l2a-v3",
      provider: "cdse",
      range: {
        from: "2026-09-01T00:00:00.000Z",
        split: "2026-09-11T00:00:00.000Z",
        to: "2026-09-21T00:00:00.000Z",
      },
      comparison: {
        NDVI: {
          previous: { mean: 0.2, meanCoverage: 0.8, observations: 2 },
          current: { mean: 0.4, meanCoverage: 0.9, observations: 3 },
        },
        NDRE: { previous: null, current: { mean: 0.4, meanCoverage: 1, observations: 2 } },
      },
      observations: [0.18, 0.19, 0.2, 0.21, 0.22, 0.5].map((mean, index) => ({
        from: `2026-09-${String(index === 5 ? 11 : index + 1).padStart(2, "0")}T00:00:00.000Z`,
        stats: { NDVI: { mean, coverage: 0.9 } },
      })),
      scenes: [],
      fetchedAt: new Date().toISOString(),
    };
    await finishAnalysis(store, id, "winner-run", result);
    await finishAnalysis(store, id, "winner-run", result);
    const [claim] = await store.db.select().from(analysisClaims);
    assert.equal(claim?.analysisId, id);
    assert.equal(claim?.metric, "NDVI");
    assert.equal(claim?.evidence.delta, 0.2);
    assert.equal(claim?.evidence.verification, "observational");
    assert.equal(claim?.evidence.anomaly?.direction, "above");
    assert.deepEqual(claim?.evidence.warnings, ["observation_counts_differ", "limited_observations"]);
    assert.equal((await store.db.select().from(analysisClaims)).length, 1);
    assert.equal(
      await queueAnalysis(store.db, org.id, "fixture-field", true, undefined, request),
      id,
    );
    await assert.rejects(
      () => queueAnalysis(store.db, org.id, "fixture-field", true,
        { start: "2026-09-01", split: "2026-10-01", end: "2026-10-20" }, request),
      { status: 409, code: "IDEMPOTENCY_CONFLICT" },
    );
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
