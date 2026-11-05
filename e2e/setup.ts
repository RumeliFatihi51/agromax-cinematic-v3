import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { hashPassword } from "better-auth/crypto";
import { createStore } from "../commercial/db/store";
import { user, account, farmRecords, farmJobs } from "../commercial/db/schema";
import {
  createOrganization,
  resolveContext,
} from "../commercial/organizations/service";
import { createReport } from "../commercial/reports/service";
import { processReport } from "../commercial/reports/worker";
import { privateObjects } from "../commercial/files/private-store";
import { prepareField } from "../server/fields.js";
import { comparisonRange } from "../server/satellite.js";
import { geometryHash } from "../server/analysis-jobs.js";
export default async function setup() {
  const root = resolve("data", `browser-fixtures-${Date.now()}`),
    directory = resolve(root, "postgres"),
    objects = privateObjects({
      directory: resolve(root, "objects"),
      remote: false,
    });
  await mkdir(root, { recursive: true });
  const store = await createStore({ dataDir: directory, migrate: true });
  try {
    for (const project of ["desktop", "mobile"]) {
      const actor = {
        id: `browser-${project}`,
        name: `EXPLICIT BROWSER TEST ${project}`,
        email: `${project}@example.invalid`,
        emailVerified: true,
      };
      await store.db.insert(user).values(actor);
      await store.db.insert(account).values({
        id: `account-${project}`,
        userId: actor.id,
        accountId: actor.id,
        providerId: "credential",
        password: await hashPassword("browser-fixture-password-123"),
      });
      const org = await createOrganization(store.db, actor, {
        name: `TEST WORKSPACE ${project}`,
      });
      const ctx = await resolveContext(store.db, actor, org.id);
      const fieldId =
        project === "desktop"
          ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
      const field = prepareField({
        name: `EXPLICIT TEST PARCEL ${project}`,
        crop: "Buğday",
        geometry: {
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
        },
      });
      await store.db.insert(farmRecords).values({
        id: fieldId,
        organizationId: org.id,
        kind: "field",
        body: JSON.stringify(field),
      });
      const id =
        project === "desktop"
          ? "cccccccccccccccccccccccccccccccc"
          : "dddddddddddddddddddddddddddddddd";
      const analysis = {
        source: "EXPLICIT SYNTHETIC BROWSER FIXTURE",
        method: "s2-l2a-v3",
        provider: "cdse",
        fetchedAt: new Date().toISOString(),
        resolution: 20,
        range: comparisonRange(),
        comparison: {
          NDVI: { previous: { mean: 0 }, current: { mean: 0.3 }, delta: 0.3 },
          NDMI: { previous: null, current: null, delta: null },
        },
        observations: [],
        scenes: [],
        historyId: id,
      };
      await store.db.insert(farmJobs).values({
        id,
        fieldId,
        organizationId: org.id,
        state: "completed",
        snapshot: JSON.stringify({ field: { ...field, id: fieldId } }),
        geometryHash: geometryHash(JSON.parse(JSON.stringify(field)).geometry),
        result: JSON.stringify(analysis),
        createdAt: new Date().toISOString(),
      });
      const report = await createReport(
        store.db,
        ctx,
        { analysisId: id },
        `browser-${project}`,
        false,
      );
      await processReport(store, objects, report.id, `browser-run-${project}`);
    }
  } finally {
    await store.close();
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: "5182",
    HOST: "127.0.0.1",
    AGROMAX_APP_URL: "http://127.0.0.1:5182",
    AGROMAX_AUTH_SECRET: randomBytes(48).toString("base64url"),
    AGROMAX_LOCAL_DATA_DIR: directory,
    AGROMAX_LOCAL_OBJECT_DIR: resolve(root, "objects"),
    AGROMAX_ENFORCE_QUOTAS: "false",
    SENTINEL_PROVIDER: "cdse",
    SENTINEL_CLIENT_ID: "",
    SENTINEL_CLIENT_SECRET: "",
    AGROMAX_FILIZ_ENABLED: "false",
  };
  delete env.VERCEL;
  delete env.AGROMAX_DATABASE_URL;
  Object.assign(env, { AGROMAX_DEBUG: "true" });
  Object.assign(env, {
    WORKFLOW_TARGET_WORLD: "local",
    WORKFLOW_LOCAL_DATA_DIR: resolve(root, "workflow"),
    WORKFLOW_LOCAL_BASE_URL: "http://127.0.0.1:5182",
  });
  const server = spawn(process.execPath, [".output/server/index.mjs"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let logs = "";
  server.stdout?.on("data", (chunk) => {
    logs = (logs + chunk).slice(-4000);
  });
  server.stderr?.on("data", (chunk) => {
    logs = (logs + chunk).slice(-4000);
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://127.0.0.1:5182/api/runtime");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) break;
    await delay(500);
  }
  if (!ready) {
    server.kill();
    throw new Error("Browser fixture server did not become ready: " + logs);
  }
  const smoke = await fetch("http://127.0.0.1:5182/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5182",
    },
    body: JSON.stringify({
      email: "desktop@example.invalid",
      password: "browser-fixture-password-123",
    }),
  });
  if (!smoke.ok) {
    const data = await smoke.json();
    server.kill();
    throw new Error(
      `Compiled login failed (${smoke.status}): ${JSON.stringify(data)} ${logs}`,
    );
  }
  console.log(
    "Browser tests use isolated, explicitly labeled PostgreSQL fixtures. No production data or authenticated satellite/model requests.",
  );
  return async () => {
    await writeFile(resolve(root, "server.log"), logs);
    server.kill();
    await delay(300);
  };
}
