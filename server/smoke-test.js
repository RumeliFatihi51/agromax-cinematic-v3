import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
const base = "http://127.0.0.1:5173/api/";
const ids = [];
async function request(path, body, cookie, method) {
  const r = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
try {
  assert.equal((await request("records")).status, 401);
  assert.equal(
    (await request("places/search", { query: "Konya" })).status,
    401,
  );
  const a = await request("register", {
    name: "Temporary test A",
    email: `test-${Date.now()}-a@example.invalid`,
    password: "temporary-test-password-123",
  });
  assert.equal(a.status, 200);
  ids.push(a.data.id);
  assert.equal(
    (await request("places/search", { query: " " }, a.cookie)).status,
    400,
  );
  const placeSearch = await request(
    "places/search",
    { query: "Konya", lat: 39, lng: 35 },
    a.cookie,
  );
  assert.equal(placeSearch.status, 200);
  assert.ok(placeSearch.data.results.length > 0);
  assert.ok(Number.isFinite(placeSearch.data.results[0].lat));
  const b = await request("register", {
    name: "Temporary test B",
    email: `test-${Date.now()}-b@example.invalid`,
    password: "temporary-test-password-456",
  });
  assert.equal(b.status, 200);
  ids.push(b.data.id);
  assert.equal((await request("records", null, a.cookie)).data.length, 0);
  const f = await request(
    "records",
    { kind: "field", name: "Temporary field", area: 12.5 },
    a.cookie,
  );
  assert.equal(f.status, 201);
  assert.equal((await request("records", null, b.cookie)).data.length, 0);
  assert.equal(
    (
      await request(
        "records",
        { kind: "field", name: "Bad field", area: -2 },
        a.cookie,
      )
    ).status,
    400,
  );
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
  const drawn = await request(
    "records",
    { kind: "field", name: "Temporary drawn parcel", geometry, area: 999 },
    a.cookie,
  );
  assert.equal(drawn.status, 201);
  assert.equal(drawn.data.areaSource, "geometry");
  assert.ok(drawn.data.area < 10);
  assert.equal(
    (
      await request(
        "records/" + drawn.data.id,
        { name: "Unauthorized" },
        b.cookie,
        "PATCH",
      )
    ).status,
    404,
  );
  const edited = await request(
    "records/" + drawn.data.id,
    { name: "Edited parcel" },
    a.cookie,
    "PATCH",
  );
  assert.equal(edited.status, 200);
  assert.deepEqual(edited.data.geometry, geometry);
  assert.equal(
    (await request("records/" + drawn.data.id + "/analysis", null, a.cookie))
      .data.analysis,
    null,
  );
  const connection = await request("satellite/status", null, a.cookie);
  assert.equal(connection.data.provider, "cdse");
  if (!connection.data.configured)
    assert.equal(
      (await request("records/" + drawn.data.id + "/analysis", {}, a.cookie))
        .status,
      503,
    );
  assert.equal(
    (await request("records/" + drawn.data.id, null, b.cookie, "DELETE"))
      .status,
    404,
  );
  assert.equal(
    (await request("records/" + drawn.data.id, null, a.cookie, "DELETE"))
      .status,
    200,
  );
  assert.ok(
    !(await request("records", null, a.cookie)).data.some(
      (r) => r.id === drawn.data.id,
    ),
  );
  assert.equal(
    (await request("records/" + drawn.data.id + "/restore", {}, a.cookie))
      .status,
    200,
  );
  assert.ok(
    (await request("records", null, a.cookie)).data.some(
      (r) => r.id === drawn.data.id,
    ),
  );
  const t = await request(
    "records",
    { kind: "task", name: "Temporary task", date: "2026-11-01" },
    a.cookie,
  );
  assert.equal(t.status, 201);
  assert.equal(
    (await request("records/" + t.data.id, { done: true }, b.cookie, "PATCH"))
      .status,
    404,
  );
  assert.equal(
    (await request("records/" + t.data.id, { done: true }, a.cookie, "PATCH"))
      .data.done,
    true,
  );
  assert.equal((await request("logout", {}, a.cookie)).status, 200);
  assert.equal((await request("records", null, a.cookie)).status, 401);
  console.log(
    "PASS: registration, session, field geometry CRUD, area calculation, user isolation, missing-secret response, delete/restore, tasks, logout",
  );
} finally {
  const db = new DatabaseSync("data/agromax.sqlite");
  for (const id of ids) {
    db.prepare("DELETE FROM records WHERE user_id=?").run(id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    db.prepare("DELETE FROM users WHERE id=?").run(id);
  }
  db.close();
}
