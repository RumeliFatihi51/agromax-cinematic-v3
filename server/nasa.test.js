// Explicit in-memory credentials and response fixtures. Never real user data.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createNasaService } from "./nasa.js";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function setup(t, mode = "success") {
  const keys = ["NASA_API_KEY", "EARTHDATA_TOKEN"],
    previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    NASA_API_KEY: "isolated-nasa-key-fixture",
    EARTHDATA_TOKEN: "isolated-edl-token-fixture",
  });
  const db = new DatabaseSync(":memory:");
  let calls = 0;
  t.after(() => {
    db.close();
    for (const k of keys)
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
  });
  const fetcher = async (url, options) => {
    calls++;
    const host = new URL(url).hostname;
    if (mode === "timeout")
      throw new DOMException("Explicit timeout fixture", "TimeoutError");
    if (host === "api.nasa.gov")
      return mode === "unauthorized"
        ? json({ error: "fixture" }, 403)
        : json({ near_earth_objects: {}, element_count: 0 });
    if (host === "cmr.earthdata.nasa.gov")
      return json({
        feed: {
          entry: [
            {
              id: "EXPLICIT-FIXTURE-GRANULE",
              links: [
                {
                  href: `https://${mode === "bad-asset" ? "example.invalid" : "data.lpdaac.earthdatacloud.nasa.gov"}/fixture.B04.tif`,
                },
              ],
            },
          ],
        },
      });
    if (host === "data.lpdaac.earthdatacloud.nasa.gov") {
      assert.equal(
        options.headers.Authorization,
        "Bearer isolated-edl-token-fixture",
      );
      return new Response(null, {
        status: 303,
        headers: {
          location:
            mode === "unauthorized"
              ? "https://urs.earthdata.nasa.gov/oauth/authorize"
              : mode === "bad-redirect"
                ? "https://example.invalid/fixture.tif"
                : "https://fixture.cloudfront.net/fixture.tif",
        },
      });
    }
    if (host === "fixture.cloudfront.net") {
      assert.equal(options.headers.Authorization, undefined);
      return new Response(
        mode === "html"
          ? "<html>Login</html>"
          : new Uint8Array([73, 73, 42, 0]),
        { status: 206 },
      );
    }
    throw new Error("Unexpected fixture host");
  };
  return {
    db,
    service: await createNasaService(db, {
      fetcher,
      now: () => new Date("2026-10-31T18:00:00Z"),
    }),
    calls: () => calls,
  };
}
test("NASA and Earthdata verification stores only real response evidence and never credentials", async (t) => {
  const h = await setup(t);
  const result = await h.service.verify();
  assert.equal(result.nasa.state, "verified");
  assert.equal(result.earthdata.state, "verified");
  assert.equal(result.earthdata.evidence.rasterAnalysisAvailable, false);
  const stored = JSON.stringify(
    h.db.prepare("SELECT * FROM integration_checks").all(),
  );
  assert.ok(!stored.includes(process.env.NASA_API_KEY));
  assert.ok(!stored.includes(process.env.EARTHDATA_TOKEN));
  assert.equal(h.calls(), 4);
  await h.service.verify();
  assert.equal(h.calls(), 4);
});
test("missing NASA credentials cause no request and no invented verification", async (t) => {
  const h = await setup(t);
  delete process.env.NASA_API_KEY;
  delete process.env.EARTHDATA_TOKEN;
  const s = await h.service.verify();
  assert.equal(s.nasa.state, "missing_configuration");
  assert.equal(s.earthdata.state, "missing_configuration");
  assert.equal(h.calls(), 0);
});
test("credential rotation invalidates previously verified state", async (t) => {
  const h = await setup(t);
  await h.service.verify();
  process.env.EARTHDATA_TOKEN = "rotated-fixture-token";
  assert.equal((await h.service.status()).earthdata.state, "not_verified");
  assert.equal((await h.service.status()).earthdata.checkedAt, null);
});
test("Earthdata login redirects and NASA gateway rejection are reported as unauthorized", async (t) => {
  const h = await setup(t, "unauthorized");
  const s = await h.service.verify();
  assert.equal(s.nasa.state, "unauthorized");
  assert.equal(s.earthdata.state, "unauthorized");
  assert.equal(s.earthdata.evidence, null);
});
for (const mode of ["bad-asset", "bad-redirect", "html", "timeout"])
  test(`unverifiable NASA data cannot become successful access: ${mode}`, async (t) => {
    const h = await setup(t, mode);
    const s = await h.service.verify();
    assert.equal(s.earthdata.state, "unavailable");
    assert.equal(s.earthdata.evidence, null);
  });
