// Explicit isolated weather fixtures. No production fields, credentials or network.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { sqliteDatabase } from "./database.js";
import {
  createWeatherService,
  normalizeForecast,
  weatherPoint,
} from "./weather.js";
const NOW = Date.parse("2026-10-31T20:00:00Z");
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
const payload = () => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [32.0005, 39.0005, 100] },
  properties: {
    meta: {
      updated_at: "2026-10-31T19:00:00Z",
      units: {
        air_temperature: "celsius",
        wind_speed: "m/s",
        precipitation_amount: "mm",
        relative_humidity: "%",
        cloud_area_fraction: "%",
        wind_from_direction: "degrees",
      },
    },
    timeseries: [0, 1, 2].map((h) => ({
      time: new Date(NOW + h * 3600000).toISOString(),
      data: {
        instant: {
          details: {
            air_temperature: -2 + h,
            wind_speed: 2,
            relative_humidity: 75,
            cloud_area_fraction: 0,
            wind_from_direction: 200,
          },
        },
        ...(h === 2
          ? {}
          : {
              next_1_hours: {
                summary: { symbol_code: "clearsky_night" },
                details: { precipitation_amount: h === 0 ? 0 : null },
              },
              next_6_hours: {
                summary: { symbol_code: "cloudy" },
                details: { precipitation_amount: 5 },
              },
            }),
      },
    })),
  },
});
async function setup(t, fetcher) {
  const db = sqliteDatabase(new DatabaseSync(":memory:"));
  await db.exec(
    "CREATE TABLE records(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT,body TEXT)",
  );
  await db
    .prepare("INSERT INTO records VALUES(?,?,?,?)")
    .run(
      "fixture-field",
      "fixture-owner",
      "field",
      JSON.stringify({ name: "Isolated fixture", geometry }),
    );
  const service = await createWeatherService(db, { fetcher, now: () => NOW });
  t.after(() => db.close());
  return { db, service };
}
test("weather keeps real zero distinct from missing rain and preserves overlapping period semantics", () => {
  const data = normalizeForecast(payload(), weatherPoint(geometry));
  assert.equal(data.type, "forecast");
  assert.equal(data.modelElevationM, 100);
  assert.equal(data.points[0].values.air_temperature, -2);
  assert.equal(data.points[0].periods[0].values.precipitation_amount, 0);
  assert.equal(data.points[1].periods[0].values.precipitation_amount, null);
  assert.equal(data.points[0].periods[1].hours, 6);
  assert.equal(data.points[0].periods[1].values.precipitation_amount, 5);
  assert.deepEqual(data.points[2].periods, []);
});
test("weather rejects wrong coordinates, units and unsorted timestamps", () => {
  for (const mutate of [
    (p) => (p.geometry.coordinates[0] = 10),
    (p) => (p.properties.meta.units.air_temperature = "fahrenheit"),
    (p) => p.properties.timeseries.reverse(),
  ]) {
    const p = payload();
    mutate(p);
    assert.throws(
      () => normalizeForecast(p, weatherPoint(geometry)),
      (e) => e.status === 502,
    );
  }
  const p = payload();
  p.properties.timeseries[0].data.instant.details.relative_humidity = 101;
  p.properties.timeseries[0].data.instant.details.wind_speed = -1;
  const data = normalizeForecast(p, weatherPoint(geometry));
  assert.equal(data.points[0].values.relative_humidity, null);
  assert.equal(data.points[0].values.wind_speed, null);
});
test("forecast ownership, deleted parcels and undrawn parcels fail before any provider request", async (t) => {
  let requests = 0;
  const { db, service } = await setup(t, async () => {
    requests++;
    throw new Error("Unexpected fixture request");
  });
  await assert.rejects(
    () => service.forecast("other-owner", "fixture-field"),
    (e) => e.status === 404,
  );
  await db
    .prepare("UPDATE records SET body=? WHERE id=?")
    .run(
      JSON.stringify({ geometry, deletedAt: new Date(NOW).toISOString() }),
      "fixture-field",
    );
  await assert.rejects(
    () => service.forecast("fixture-owner", "fixture-field"),
    (e) => e.status === 404,
  );
  await db
    .prepare("UPDATE records SET body=? WHERE id=?")
    .run(JSON.stringify({ area: 5 }), "fixture-field");
  await assert.rejects(
    () => service.forecast("fixture-owner", "fixture-field"),
    (e) => e.status === 422,
  );
  assert.equal(requests, 0);
});
test("persistent cache honors Expires across instances, then uses conditional 304 revalidation", async (t) => {
  let requests = 0,
    clock = NOW;
  const modified = "Sat, 31 Oct 2026 19:00:00 GMT";
  const fetcher = async (url, options) => {
    requests++;
    assert.match(
      options.headers["User-Agent"],
      /Agromax.*github.com\/erdoganenestr\/Agromax/,
    );
    assert.ok(new URL(url).searchParams.get("lat").split(".")[1].length <= 4);
    if (requests > 1) {
      assert.equal(options.headers["If-Modified-Since"], modified);
      return new Response(null, {
        status: 304,
        headers: { Expires: new Date(clock + 600000).toUTCString() },
      });
    }
    return Response.json(payload(), {
      headers: {
        Expires: new Date(clock + 600000).toUTCString(),
        "Last-Modified": modified,
      },
    });
  };
  const { db } = await setup(t, fetcher);
  const first = await createWeatherService(db, { fetcher, now: () => clock });
  const initial = await first.forecast("fixture-owner", "fixture-field");
  const second = await createWeatherService(db, { fetcher, now: () => clock });
  assert.deepEqual(
    await second.forecast("fixture-owner", "fixture-field"),
    initial,
  );
  assert.equal(requests, 1);
  clock += 601000;
  const checked = await second.forecast("fixture-owner", "fixture-field");
  assert.equal(requests, 2);
  assert.equal(checked.fetchedAt, initial.fetchedAt);
  assert.notEqual(checked.checkedAt, initial.checkedAt);
});
test("concurrent instances never duplicate an in-flight provider request", async (t) => {
  let ready,
    finish,
    requests = 0;
  const begun = new Promise((resolve) => {
    ready = resolve;
  });
  const fetcher = async () => {
    requests++;
    ready();
    return new Promise((resolve) => {
      finish = () => resolve(Response.json(payload()));
    });
  };
  const { db, service } = await setup(t, fetcher);
  const pending = service.forecast("fixture-owner", "fixture-field");
  await begun;
  const other = await createWeatherService(db, { fetcher, now: () => NOW });
  await assert.rejects(
    () => other.forecast("fixture-owner", "fixture-field"),
    (e) => e.status === 503,
  );
  finish();
  await pending;
  assert.equal(requests, 1);
});
test("upstream rate limiting persists backoff and cannot become fabricated or stale weather", async (t) => {
  let requests = 0;
  const { service } = await setup(t, async () => {
    requests++;
    return new Response("fixture rate limit", {
      status: 429,
      headers: { "Retry-After": "120" },
    });
  });
  await assert.rejects(
    () => service.forecast("fixture-owner", "fixture-field"),
    (e) => e.status === 429,
  );
  await assert.rejects(
    () => service.forecast("fixture-owner", "fixture-field"),
    (e) => e.status === 503,
  );
  assert.equal(requests, 1);
});
for (const mode of ["timeout", "malformed", "past-only"])
  test(`unverifiable provider response remains an error: ${mode}`, async (t) => {
    const { service } = await setup(t, async () => {
      if (mode === "timeout")
        throw new DOMException("Fixture timeout", "TimeoutError");
      if (mode === "malformed") return new Response("{fixture");
      const data = payload();
      data.properties.timeseries.forEach((p) => {
        p.time = p.time.replace("2026", "2020");
      });
      return Response.json(data);
    });
    await assert.rejects(
      () => service.forecast("fixture-owner", "fixture-field"),
      (e) => e.status === (mode === "timeout" ? 504 : 502),
    );
  });
