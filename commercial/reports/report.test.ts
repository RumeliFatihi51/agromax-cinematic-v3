// Explicit synthetic fixtures stay in this isolated PostgreSQL test, never customer records.
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createStore } from "../db/store";
import {
  user,
  farmRecords,
  farmJobs,
  domainRecords,
  reports,
} from "../db/schema";
import { createOrganization, resolveContext } from "../organizations/service";
import { createReport, ownReport } from "./service";
import { processReport } from "./worker";
import { contentHash, type PrivateObjects } from "../files/private-store";
import { mkdir, writeFile } from "node:fs/promises";
test("reports preserve source and geometry snapshots, produce a real Unicode PDF and do not duplicate on retry", async () => {
  const store = await createStore({ migrate: true });
  const files = new Map<string, Uint8Array>();
  let writes = 0;
  const objects: PrivateObjects = {
    put: async (key, bytes) => {
      writes++;
      files.set(key, bytes);
    },
    get: async (key) => files.get(key)!,
  };
  try {
    const actor = {
      id: "fixture-reporter",
      name: "Açık test: Şığüşöç",
      email: "reporter@example.invalid",
      emailVerified: true,
    };
    await store.db.insert(user).values(actor);
    const org = await createOrganization(store.db, actor, {
      name: "Açık rapor testi - gerçek müşteri değildir",
    });
    const ctx = await resolveContext(store.db, actor, org.id);
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [27, 38],
          [27.01, 38],
          [27.01, 38.01],
          [27, 38.01],
          [27, 38],
        ],
      ],
    };
    await store.db.insert(farmRecords).values({
      id: "fixture-field",
      organizationId: org.id,
      kind: "field",
      body: JSON.stringify({ name: "PDF TEST FİKSTÜRÜ", geometry, area: 12 }),
    });
    const analysis = {
      source: "EXPLICIT SYNTHETIC TEST SOURCE",
      fetchedAt: "2026-10-20T12:00:00Z",
      method: "fixture-method-v1",
      resolution: 20,
      mask: "Test mask",
      aggregation: "Test aggregation",
      range: {
        from: "2026-09-01T00:00:00Z",
        split: "2026-10-01T00:00:00Z",
        to: "2026-10-20T12:00:00Z",
      },
      comparison: {
        NDVI: { previous: { mean: 0 }, current: { mean: 0.3 }, delta: 0.3 },
        NDMI: { previous: null, current: null, delta: null },
      },
      observations: [
        {
          from: "2026-10-01T00:00:00Z",
          to: "2026-10-02T00:00:00Z",
          stats: { NDVI: { mean: 0.2, min: 0.1, max: 0.3, coverage: 0.9 } },
        },
        {
          from: "2026-10-02T00:00:00Z",
          to: "2026-10-03T00:00:00Z",
          stats: { NDVI: { mean: 0.3, min: 0.2, max: 0.4, coverage: 0.9 } },
        },
      ],
    };
    await store.db.insert(farmJobs).values({
      id: "fixture-job",
      organizationId: org.id,
      fieldId: "fixture-field",
      state: "completed",
      snapshot: JSON.stringify({
        field: {
          id: "fixture-field",
          name: "PDF TEST FİKSTÜRÜ",
          geometry,
          area: 12,
        },
      }),
      geometryHash: "fixture-immutable-hash",
      result: JSON.stringify(analysis),
      createdAt: "2026-10-20T12:00:00Z",
    });
    await store.db.insert(domainRecords).values({
      id: "fixture-cost",
      organizationId: org.id,
      fieldId: "fixture-field",
      createdBy: actor.id,
      kind: "cost",
      data: {
        amountMinor: 1234,
        currency: "TRY",
        title: "Belge testi",
        date: "2026-10-20",
        source: "user_statement",
      },
    });
    const first = await createReport(
      store.db,
      ctx,
      { analysisId: "fixture-job" },
      "fixture-request",
      false,
    );
    const repeated = await createReport(
      store.db,
      ctx,
      { analysisId: "fixture-job" },
      "fixture-request",
      false,
    );
    assert.equal(first.id, repeated.id);
    await assert.rejects(
      () =>
        createReport(
          store.db,
          ctx,
          { analysisId: "fixture-job", locale: "en" },
          "fixture-request",
          false,
        ),
      /farklı rapora/,
    );
    await store.db
      .update(domainRecords)
      .set({ version: 2, data: { title: "Changed after snapshot" } })
      .where(eq(domainRecords.id, "fixture-cost"));
    await processReport(store, objects, first.id, "fixture-run");
    await processReport(store, objects, first.id, "duplicate-run");
    const row = await ownReport(store.db, ctx, first.id);
    assert.equal(row.state, "completed");
    assert.equal(writes, 1);
    assert.equal(
      (row.snapshot.records as { version: number }[])[0]!.version,
      1,
    );
    const bytes = files.get(row.objectKey!)!;
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
    assert.equal(contentHash(bytes), row.sha256);
    await assert.rejects(
      () =>
        ownReport(
          store.db,
          {
            ...ctx,
            organization: { ...ctx.organization, id: "other-workspace" },
          },
          first.id,
        ),
      /bulunamadı/,
    );
    if (process.env.AGROMAX_PDF_QA === "true") {
      await mkdir("data/pdf-qa", { recursive: true });
      await writeFile("data/pdf-qa/explicit-fixture.pdf", bytes);
    }
  } finally {
    await store.close();
  }
});
