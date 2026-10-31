// Live deployment QA. Temporary private accounts are removed in finally.
// The geometry is copied from an actual local parcel; satellite responses are real.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { postgresDatabase } from "../server/database.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const base = process.env.AGROMAX_DEPLOYMENT_URL;
if (!base?.startsWith("https://") || !process.env.DATABASE_URL)
  throw new Error("Explicit deployment URL and database are required.");
const db = postgresDatabase(process.env.DATABASE_URL);
const source = new DatabaseSync("data/agromax.sqlite", { readOnly: true });
const fields = source
  .prepare("SELECT body FROM records WHERE kind='field'")
  .all()
  .map((r) => JSON.parse(r.body))
  .filter((f) => f.geometry && !f.deletedAt);
source.close();
fields.sort((a, b) => a.area - b.area);
assert.ok(fields.length, "A real source parcel is required.");
const ids = [],
  evidence = {};
let job, cookie;
function protectedFetch(url, options) {
  const cache = join(process.env.LOCALAPPDATA, "npm-cache", "_npx");
  const cli = readdirSync(cache)
    .map((d) => join(cache, d, "node_modules", "vercel"))
    .find(
      (p) =>
        existsSync(join(p, "package.json")) &&
        JSON.parse(readFileSync(join(p, "package.json"), "utf8")).version ===
          "65.9.0",
    );
  assert.ok(cli, "Authenticated Vercel CLI is required for protected QA.");
  const config = [
    `request = ${JSON.stringify(options.method)}`,
    ...Object.entries(options.headers).map(
      ([key, value]) => `header = ${JSON.stringify(`${key}: ${value}`)}`,
    ),
    ...(options.body ? [`data = ${JSON.stringify(options.body)}`] : []),
  ].join("\n");
  // Request credentials go through stdin, never command-line arguments or logs.
  const result = spawnSync(
    process.execPath,
    [
      join(cli, "dist", "index.js"),
      "curl",
      url,
      "--scope",
      "next-3011",
      "--",
      "--silent",
      "--show-error",
      "--include",
      "--config",
      "-",
    ],
    {
      input: Buffer.from(config),
      windowsHide: true,
      timeout: 190000,
      maxBuffer: 10000000,
    },
  );
  if (result.status !== 0)
    throw new Error("Authenticated deployment request failed.");
  let output = result.stdout,
    headers,
    status;
  do {
    const split = output.indexOf("\r\n\r\n");
    assert.ok(split >= 0, "HTTP headers are required.");
    const lines = output.subarray(0, split).toString("utf8").split("\r\n");
    status = Number(lines.shift().split(" ")[1]);
    headers = Object.fromEntries(
      lines.map((line) => {
        const colon = line.indexOf(":");
        return [line.slice(0, colon), line.slice(colon + 1).trim()];
      }),
    );
    output = output.subarray(split + 4);
  } while (output.subarray(0, 5).toString() === "HTTP/");
  return new Response(output, { status, headers });
}
async function request(
  path,
  {
    body,
    session = cookie,
    method = body === undefined ? "GET" : "POST",
    binary = false,
  } = {},
) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(session ? { Cookie: session } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  };
  const response = process.env.AGROMAX_PROTECTED_QA
    ? protectedFetch(base + path, options)
    : await fetch(base + path, options);
  const data =
    binary && response.ok
      ? Buffer.from(await response.arrayBuffer())
      : await response.json();
  return { response, data };
}
try {
  const stamp = randomBytes(10).toString("hex");
  const credentials = {
    name: "Temporary deployment verification",
    email: `deployment-${stamp}@example.invalid`,
    password: randomBytes(24).toString("hex"),
  };
  const a = await request("/api/register", { body: credentials, session: "" });
  assert.equal(a.response.status, 200);
  ids.push(a.data.id);
  cookie = a.response.headers.get("set-cookie").split(";")[0];
  assert.match(a.response.headers.get("set-cookie"), /Secure/);
  assert.match(a.response.headers.get("set-cookie"), /HttpOnly/);
  assert.equal(
    (
      await request("/api/login", {
        body: { ...credentials, password: "deliberately-invalid-password" },
      })
    ).response.status,
    401,
  );
  const login = await request("/api/login", { body: credentials, session: "" });
  assert.equal(login.response.status, 200);
  cookie = login.response.headers.get("set-cookie").split(";")[0];
  assert.equal((await request("/api/me")).data.id, ids[0]);
  assert.deepEqual((await request("/api/records")).data, []);
  evidence.auth = "register/login/me/Secure cookie passed";
  const b = await request("/api/register", {
    body: { ...credentials, email: `other-${stamp}@example.invalid` },
    session: "",
  });
  assert.equal(b.response.status, 200);
  ids.push(b.data.id);
  const otherCookie = b.response.headers.get("set-cookie").split(";")[0];
  const saved = await request("/api/records", {
    body: {
      kind: "field",
      name: "Temporary QA of actual source geometry",
      geometry: fields[0].geometry,
    },
  });
  assert.equal(saved.response.status, 201);
  assert.equal(
    (
      await request(`/api/records/${saved.data.id}/analysis`, {
        session: otherCookie,
      })
    ).response.status,
    404,
  );
  assert.equal((await request("/api/records")).data[0].id, saved.data.id);
  evidence.parcel = "real geometry save/read and other-owner rejection passed";
  const search = await request("/api/places/search", {
    body: { query: "Konya", lat: 39, lng: 35 },
  });
  assert.equal(search.response.status, 200);
  assert.ok(search.data.results.length);
  evidence.placeResults = search.data.results.length;
  const status = await request("/api/satellite/status");
  assert.equal(status.data.configured, true);
  const nasa = await request("/api/nasa/verify", { body: {} });
  assert.equal(nasa.response.status, 200);
  evidence.nasa = Object.fromEntries(
    Object.entries(nasa.data).map(([k, v]) => [
      k,
      { state: v.state, checkedAt: v.checkedAt },
    ]),
  );
  const queued = await request(`/api/records/${saved.data.id}/analysis`, {
    body: {},
  });
  assert.equal(queued.response.status, 202);
  job = queued.data.job;
  const deadline = Date.now() + 270000;
  do {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const polled = await request(`/api/analyses/${job.id}`);
    assert.equal(polled.response.status, 200);
    job = polled.data.job;
  } while (["queued", "running"].includes(job.state) && Date.now() < deadline);
  assert.equal(job.state, "completed", "Real satellite job did not complete.");
  assert.equal(job.analysis.historyId, job.id);
  const notices = await request("/api/notifications");
  assert.ok(
    notices.data.notifications.some(
      (n) => n.jobId === job.id && n.type === "analysis.completed",
    ),
  );
  const cached = await request(`/api/records/${saved.data.id}/analysis`);
  assert.equal(cached.data.analysis.historyId, job.id);
  evidence.satellite = {
    state: job.state,
    method: job.analysis.method,
    source: job.analysis.source,
    observations: job.analysis.observations.length,
    scenes: job.analysis.scenes.length,
    historyAndNotificationMatched: true,
  };
  const day = job.analysis.observations.find(
    (o) =>
      o.stats?.NDMI?.sampleCount > 0 || Number.isFinite(o.stats?.NDMI?.mean),
  );
  const scene =
    day &&
    job.analysis.scenes.find(
      (s) =>
        Date.parse(s.properties.datetime) >= Date.parse(day.from) &&
        Date.parse(s.properties.datetime) < Date.parse(day.to),
    );
  if (scene) {
    const image = await request(`/api/records/${saved.data.id}/image`, {
      body: {
        analysisId: job.id,
        date: scene.properties.datetime.slice(0, 10),
        layer: "NDMI",
      },
      binary: true,
    });
    assert.equal(image.response.status, 200);
    assert.equal(image.data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.ok(Number(image.response.headers.get("x-valid-pixels")) > 0);
    evidence.image = {
      format: "PNG",
      layer: "NDMI",
      validPixels: Number(image.response.headers.get("x-valid-pixels")),
    };
  } else
    evidence.image =
      "No eligible unmasked NDMI scene in this parcel/date range; not invented.";
  await request(`/api/records/${saved.data.id}`, { method: "DELETE" });
  assert.deepEqual((await request("/api/records")).data, []);
  assert.equal(
    (await request(`/api/records/${saved.data.id}/restore`, { body: {} }))
      .response.status,
    200,
  );
  await request("/api/logout", { body: {} });
  assert.equal((await request("/api/me")).response.status, 401);
  evidence.logoutAndRestore = "passed";
  console.log(JSON.stringify({ verified: true, base, evidence }));
} catch (error) {
  console.error(
    JSON.stringify({ verified: false, base, check: error.message, evidence }),
  );
  process.exitCode = 1;
} finally {
  if (job && ["queued", "running"].includes(job.state) && cookie)
    await request(`/api/analyses/${job.id}/cancel`, { body: {} }).catch(
      () => {},
    );
  await db.transaction(async (tx) => {
    for (const userId of ids) {
      await tx
        .prepare(
          "DELETE FROM analyses WHERE field_id IN (SELECT id FROM records WHERE user_id=?)",
        )
        .run(userId);
      for (const table of [
        "sessions",
        "notifications",
        "audit_events",
        "analysis_jobs",
        "records",
      ])
        await tx.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(userId);
      await tx.prepare("DELETE FROM users WHERE id=?").run(userId);
    }
  });
  console.log(JSON.stringify({ temporaryAccountsRemoved: ids.length }));
  await db.close();
}
