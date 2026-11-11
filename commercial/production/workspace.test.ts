// Isolated PostgreSQL fixtures; no customer account or production provider writes.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createStore, type Store, type SqlClient } from "../db/store";
import { createApplication } from "../../server/application.js";
import { createProductionWorkspace } from "./workspace";
import { createReport } from "../reports/service";
import { projectWorkspace } from "./snapshot";
import type { PrivateObjects } from "../files/private-store";
import { randomBytes } from "node:crypto";
import { geometryHash } from "../../server/analysis-jobs.js";
import { openSentinelMethod, openSentinelProvider } from "../../shared/open-sentinel.js";

export function productionSqlAdapter(store: Store) {
  const adapter = (client: SqlClient) => ({
    dialect: "postgres",
    lock: " FOR UPDATE",
    exec: async (input: string) => {
      for (const s of input
        .split(";")
        .map((v) => v.trim())
        .filter(Boolean))
        await client.query(s);
    },
    prepare: (input: string) => {
      let n = 0;
      const query = (...values: unknown[]) =>
        client.query(
          input.replace(/\?/g, () => `$${++n}`),
          values,
        );
      // Parameter numbering is local to each execution, including reused statements.
      const runQuery = (...values: unknown[]) => {
        n = 0;
        return query(...values);
      };
      return {
        get: async (...v: unknown[]) => (await runQuery(...v)).rows[0],
        all: async (...v: unknown[]) => (await runQuery(...v)).rows,
        run: async (...v: unknown[]) => ({
          changes: (await runQuery(...v)).rowCount || 0,
        }),
      };
    },
  });
  return {
    ...adapter(store.raw),
    transaction: <T>(fn: (tx: ReturnType<typeof adapter>) => Promise<T>) =>
      store.transaction((client) => fn(adapter(client))),
  };
}

test("existing live sessions open real workspace modules without replacing accounts, leaking tenants or pretending email verification", async () => {
  const store = await createStore({ migrate: true });
  const files = new Map<string, Uint8Array>();
  const objects: PrivateObjects = {
    put: async (k, b) => {
      files.set(k, b);
    },
    get: async (k) => files.get(k)!,
  };
  const workspace = await createProductionWorkspace({
    store,
    secret: "isolated-workspace-signing-secret-123456789",
    objects,
  });
  const app = await createApplication({
    db: productionSqlAdapter(store),
    workspace,
  });
  const server = http.createServer(app.handle);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  const call = async (
    path: string,
    body?: unknown,
    cookie?: string,
    method = body ? "POST" : "GET",
    headers: Record<string, string> = {},
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    assert.equal((await call("/api/runtime")).body.workspaceEnabled, true);
    const a = await call("/api/register", {
      name: "EXPLICIT WORKSPACE A",
      email: "bridge-a@example.invalid",
      password: "isolated-password-123",
    });
    const b = await call("/api/register", {
      name: "EXPLICIT WORKSPACE B",
      email: "bridge-b@example.invalid",
      password: "isolated-password-123",
    });
    assert.equal(a.body.commercial, true);
    assert.ok(a.cookie && b.cookie);
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [27.5, 38.5],
          [27.501, 38.5],
          [27.501, 38.501],
          [27.5, 38.501],
          [27.5, 38.5],
        ],
      ],
    };
    const field = await call(
      "/api/records",
      { kind: "field", name: "EXPLICIT FIXTURE FIELD", geometry },
      a.cookie,
    );
    assert.equal(field.status, 201);
    const bootstrap = await call("/api/v1/bootstrap", undefined, a.cookie);
    assert.equal(bootstrap.status, 200);
    assert.equal(bootstrap.body.user.emailVerified, false);
    const org = bootstrap.body.organizations[0].id;
    const cost = await call(
      "/api/v1/records/cost",
      {
        fieldId: field.body.id,
        date: "2026-11-04",
        category: "seed",
        title: "EXPLICIT COST",
        amountMinor: 12345,
        currency: "TRY",
      },
      a.cookie,
    );
    assert.equal(cost.status, 201);
    assert.equal(
      (await call("/api/v1/costs/summary", undefined, a.cookie)).body.totals[0]
        .amountMinor,
      12345,
    );
    assert.equal(
      (await call("/api/v1/records/cost", undefined, b.cookie)).body.records
        .length,
      0,
    );
    assert.equal(
      (
        await call("/api/v1/records/cost", undefined, b.cookie, "GET", {
          "X-Organization-ID": org,
        })
      ).status,
      404,
    );
    const draft = await call(
      "/api/v1/assistant/proposals",
      {
        kind: "task",
        payload: {
          fieldId: field.body.id,
          name: "EXPLICIT CONFIRMED TASK",
          date: "2026-11-05",
        },
      },
      a.cookie,
    );
    assert.equal(draft.status, 201);
    assert.equal(
      (await call("/api/records", undefined, a.cookie)).body.filter(
        (r: { kind: string }) => r.kind === "task",
      ).length,
      0,
    );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await call(
            `/api/v1/assistant/proposals/${draft.body.id}/confirm`,
            {},
            a.cookie,
          )
        ).status,
        200,
      );
    assert.equal(
      (await call("/api/records", undefined, a.cookie)).body.filter(
        (r: { kind: string }) => r.kind === "task",
      ).length,
      1,
    );
    const job = "c".repeat(32);
    const analysis = {
      source: "EXPLICIT TEST SOURCE",
      method: openSentinelMethod,
      provider: openSentinelProvider,
      fetchedAt: new Date().toISOString(),
      range: {
        from: "2026-09-01T00:00:00Z",
        split: "2026-10-01T00:00:00Z",
        to: "2026-10-31T23:59:59Z",
      },
      observations: [],
      comparison: { NDVI: {
        previous: { mean: 0.3, meanCoverage: 0.9, observations: 3 },
        current: { mean: 0.5, meanCoverage: 0.9, observations: 3 },
      } },
      resolution: 20,
    };
    await store.raw.query(
      "insert into analysis_jobs(id,user_id,field_id,geometry_hash,snapshot,state,created_at,result) values($1,$2,$3,$4,$5,'completed',$6,$7)",
      [
        job,
        a.body.id,
        field.body.id,
        geometryHash(geometry),
        JSON.stringify({ field: field.body }),
        new Date().toISOString(),
        JSON.stringify(analysis),
      ],
    );
    const workspaceFile = await call("/api/platform/records", {
      fieldId: field.body.id, name: "EXPLICIT COST SCENARIO", kind: "scenario",
      payload: { waterM3: 10, waterUnitCost: 2, fertilizerKg: 0, fertilizerUnitCost: 0,
        laborHours: 0, laborHourlyCost: 0, otherCost: 0, currency: "TRY" },
    }, a.cookie);
    assert.equal(workspaceFile.status, 201);
    const claimsPath = `/api/v1/fields/${field.body.id}/claims`;
    const claims = await call(claimsPath, undefined, a.cookie);
    assert.equal(claims.body.claims[0].analysisId, job);
    assert.equal(claims.body.claims[0].evidence.verification, "observational");
    assert.equal((await call(claimsPath, undefined, b.cookie)).status, 404);
    const claimId = claims.body.claims[0].id;
    const investigationPath = `${claimsPath}/${claimId}/investigation`;
    assert.equal((await call(investigationPath, {}, a.cookie)).status, 201);
    assert.equal((await call(investigationPath, {}, a.cookie)).status, 200);
    const balancePath = `/api/v1/fields/${field.body.id}/water-balance`;
    const input = {
      scope: "trakya-winter-wheat", weatherSource: "Explicit meteorology", soilSource: "Explicit soil",
      sowingDate: "2026-10-01", days: ["2026-10-02", "2026-10-03"].map(date =>
        ({ date, et0Mm: 4, effectiveRainMm: 0, cropCoefficient: 1, meanTempC: 10 })),
      soil: { fieldCapacity: 0.3, wiltingPoint: 0.15, rootDepthM: 1, initialDepletionMm: 120, depletionFraction: 0.5 },
      systemEfficiency: 0.8, baseTemperatureC: 2,
      scenarios: [{ name: "Temel", irrigation: [] }, { name: "Alternatif", irrigation: [{ date: "2026-10-02", grossMm: 100 }] }],
      waterCostMinorPerM3: 200, maxVolumeM3: 10000, maxCostMinor: 1000000,
    };
    assert.equal((await call(balancePath, input, b.cookie)).status, 404);
    const modelRun = await call(balancePath, input, a.cookie);
    assert.equal(modelRun.status, 201);
    assert.equal(modelRun.body.run.data.result.calibration, "unvalidated_pilot");
    assert.equal(modelRun.body.run.data.result.yieldPrediction, null);
    assert.equal((await call(balancePath, undefined, a.cookie)).body.run.id, modelRun.body.run.id);
    const facts = await call(`/api/v1/assistant/facts?fieldId=${field.body.id}`, undefined, a.cookie);
    assert.ok(facts.body.facts.some((fact: {source:string}) => fact.source.includes(workspaceFile.body.record.id)));
    const report = await call(
      "/api/v1/reports",
      { analysisId: job },
      a.cookie,
      "POST",
      { "Idempotency-Key": "fixture-report-1" },
    );
    assert.equal(report.status, 202);
    const saved = await call(
      `/api/v1/reports/${report.body.id}`,
      undefined,
      a.cookie,
    );
    assert.equal(saved.body.state, "completed");
    assert.ok(saved.body.snapshot.records.some((record: {id:string}) => record.id === workspaceFile.body.record.id));
    const exportPath = `/api/v1/reports/${report.body.id}/export`;
    const json = await call(exportPath + "?format=json", undefined, a.cookie);
    assert.equal(json.body.geometryVersion, geometryHash(geometry));
    assert.equal((await call(exportPath + "?format=json", undefined, b.cookie)).status, 404);
    const csv = await fetch(base + exportPath + "?format=csv", { headers: { Cookie: a.cookie! } });
    assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
    assert.match(await csv.text(), /EXPLICIT COST SCENARIO/);
    const mrv = await call(`/api/v1/fields/${field.body.id}/evidence-bundle`, undefined, a.cookie);
    assert.equal(mrv.body.schema, "agromax.evidence-bundle.v2");
    assert.ok(mrv.body.reportFiles.some((file: {id:string}) => file.id === report.body.id));
    assert.ok(mrv.body.modelRuns.some((run: {id:string}) => run.id === modelRun.body.run.id));
    assert.equal(mrv.body.integrity.algorithm, "SHA-256");
    assert.equal(
      (await call(`/api/v1/reports/${report.body.id}`, undefined, b.cookie))
        .status,
      404,
    );
    const link = await call(
      `/api/v1/reports/${report.body.id}/download-link`,
      {},
      a.cookie,
    );
    const pdf = await fetch(base + link.body.url, {
      headers: { Cookie: a.cookie! },
    });
    assert.equal(pdf.status, 200);
    assert.match(
      Buffer.from(await pdf.arrayBuffer()).toString("latin1"),
      /^%PDF/,
    );
    assert.equal(
      (await call("/api/v1/billing", undefined, a.cookie)).body.subscription,
      null,
    );
    assert.equal(
      (
        await call(
          "/api/auth/update-user",
          { name: "EXPLICIT UPDATED NAME" },
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("/api/me", undefined, a.cookie)).body.name,
      "EXPLICIT UPDATED NAME",
    );
    const sessions = await call(
      "/api/v1/account/sessions",
      undefined,
      a.cookie,
    );
    assert.equal(sessions.body.sessions[0].createdAt, null);
    assert.ok(!JSON.stringify(sessions.body).includes(a.cookie!.slice(8)));
    assert.equal(
      (
        await call(
          "/api/auth/change-password",
          {
            currentPassword: "wrong-password",
            newPassword: "new-isolated-password-123",
          },
          a.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          "/api/auth/change-password",
          {
            currentPassword: "isolated-password-123",
            newPassword: "new-isolated-password-123",
            revokeOtherSessions: true,
          },
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call("/api/login", {
          email: "bridge-a@example.invalid",
          password: "new-isolated-password-123",
        })
      ).status,
      200,
    );
    const ctx = await projectWorkspace(store, {
      id: a.body.id,
      name: "EXPLICIT UPDATED NAME",
      email: "bridge-a@example.invalid",
      emailVerified: false,
      authentication: "legacy-session",
    });
    await assert.rejects(
      createReport(
        store.db,
        ctx,
        { analysisId: job },
        "over-daily-limit",
        false,
        1,
      ),
      /rapor sınırına/,
    );
    const again = await createReport(
      store.db,
      ctx,
      { analysisId: job },
      "fixture-report-1",
      false,
      1,
    );
    assert.equal(again.id, report.body.id);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await app.analysisService.waitForIdle();
    await store.close();
  }
});
