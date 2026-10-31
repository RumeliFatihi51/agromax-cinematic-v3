// Explicit network fixtures. No real credentials, accounts, parcels or requests.
import test from "node:test";
import assert from "node:assert/strict";
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
let caseId = 0;
async function harness(
  t,
  {
    empty = false,
    tokenStatus = 200,
    statisticsStatus = 200,
    timeout = false,
    malformed = false,
    missing = false,
  } = {},
) {
  const names = [
    "SENTINEL_PROVIDER",
    "SENTINEL_CLIENT_ID",
    "SENTINEL_CLIENT_SECRET",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, {
    SENTINEL_PROVIDER: "cdse",
    SENTINEL_CLIENT_ID: "isolated-fixture-id",
    SENTINEL_CLIENT_SECRET: "isolated-fixture-secret",
  });
  t.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  let requests = 0;
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (timeout) throw new DOMException("Fixture timeout", "TimeoutError");
    if (url.includes("/token"))
      return json(
        tokenStatus === 200
          ? { access_token: "isolated-fixture-token", expires_in: 1800 }
          : { error: "fixture-auth-error" },
        tokenStatus,
      );
    if (url.endsWith("/statistics")) {
      requests++;
      if (statisticsStatus !== 200)
        return json(
          {
            error: {
              code: "FIXTURE_ERROR",
              message: "isolated-fixture-secret isolated-fixture-token",
            },
          },
          statisticsStatus,
        );
      if (malformed) return new Response("not-json", { status: 200 });
      const body = JSON.parse(options.body);
      assert.ok(!body.aggregation.evalscript.includes('"WVP"'));
      if (empty) return json({ status: "OK", data: [] });
      const setup = new Function(
        body.aggregation.evalscript + ";return setup();",
      )();
      const outputs = Object.fromEntries(
        setup.output
          .filter((o) => o.id !== "dataMask")
          .map((o) => [
            o.id,
            {
              bands: {
                B0: {
                  stats: {
                    mean: 0.25,
                    min: 0.1,
                    max: 0.5,
                    stDev: 0.1,
                    sampleCount: 10,
                    noDataCount: 0,
                  },
                },
              },
            },
          ]),
      );
      if (missing) delete outputs[setup.output[0].id];
      const from = body.aggregation.timeRange.from;
      return json({
        status: "OK",
        data: [
          {
            interval: {
              from,
              to: new Date(Date.parse(from) + 86400000).toISOString(),
            },
            outputs,
          },
        ],
      });
    }
    if (url.includes("/catalog/")) return json({ features: [], context: {} });
    throw new Error("Unexpected fixture endpoint");
  });
  const satellite = await import(`./satellite.js?fixture=${++caseId}`);
  return { satellite, requests: () => requests };
}
test("transport merges every supported metric group without manufacturing missing data", async (t) => {
  const h = await harness(t);
  const a = await h.satellite.fetchAnalysis(geometry);
  assert.equal(h.requests(), 5);
  assert.equal(a.availableMetrics.length, 40);
  assert.equal(a.observations.length, 1);
  assert.equal(a.observations[0].stats.NDVI.mean, 0.25);
  assert.equal(a.observations[0].stats.WVP, null);
});
test("empty provider results remain empty and cannot become a zero measurement", async (t) => {
  const h = await harness(t, { empty: true });
  const a = await h.satellite.fetchAnalysis(geometry);
  assert.deepEqual(a.observations, []);
  assert.deepEqual(a.scenes, []);
  assert.equal(a.comparison.NDVI.current, null);
  assert.equal(a.comparison.NDVI.delta, null);
});
test("an incomplete output group fails the whole analysis", async (t) => {
  const h = await harness(t, { missing: true });
  await assert.rejects(
    h.satellite.fetchAnalysis(geometry),
    /eksik veya hatalı/,
  );
});
test("provider auth failure is reported before attempting statistics", async (t) => {
  const h = await harness(t, { tokenStatus: 401 });
  await assert.rejects(
    h.satellite.fetchAnalysis(geometry),
    (e) => e.status === 502 && e.message.includes("401"),
  );
  assert.equal(h.requests(), 0);
});
test("provider errors redact both secret and bearer token, including after 401 invalidation", async (t) => {
  const h = await harness(t, { statisticsStatus: 401 });
  await assert.rejects(
    h.satellite.fetchAnalysis(geometry),
    (e) =>
      e.providerStatus === 401 &&
      !e.providerDetail.includes("isolated-fixture"),
  );
});
test("provider rate limits retain their actual HTTP meaning", async (t) => {
  const h = await harness(t, { statisticsStatus: 429 });
  await assert.rejects(
    h.satellite.fetchAnalysis(geometry),
    (e) => e.status === 429,
  );
});
test("provider timeout and malformed JSON cannot produce successful results", async (t) => {
  const h = await harness(t, { timeout: true });
  await assert.rejects(
    h.satellite.fetchAnalysis(geometry),
    (e) => e.status === 504,
  );
});
test("malformed success payload is a safe provider error", async (t) => {
  const h = await harness(t, { malformed: true });
  await assert.rejects(
    h.satellite.fetchAnalysis(geometry),
    (e) => e.status === 502 && e.message.includes("geçerli"),
  );
});
test("unconfigured access fails explicitly without a network request", async (t) => {
  const h = await harness(t);
  delete process.env.SENTINEL_CLIENT_SECRET;
  await assert.rejects(
    h.satellite.fetchAnalysis(geometry),
    (e) => e.status === 503,
  );
  assert.equal(h.requests(), 0);
});
